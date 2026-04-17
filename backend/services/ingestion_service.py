"""
IngestionService — orchestrates Composio data pulls, normalization, and storage.

One instance per (org_id, entity_id) pair. Designed for use in:
- BackgroundTasks (ad-hoc sync triggers)
- BatchJobScheduler (nightly sync)
- Composio webhook handler (real-time events)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Union

from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from core.database import get_supabase_admin
from integrations.composio.client import get_toolset
from integrations.composio.normalizer import (
    ActivityEvent,
    CommunicationMetadata,
    normalize_gcal_event,
    normalize_github_pr,
    normalize_gmail_thread,
    normalize_jira_issue,
    normalize_slack_message,
)

logger = logging.getLogger(__name__)

SignalUnion = Union[CommunicationMetadata, ActivityEvent]


SLACK_CHANNEL_LIST_ACTIONS = [
    "SLACK_LIST_ALL_SLACK_TEAM_CHANNELS_WITH_VARIOUS_FILTERS",
    "SLACK_LIST_ALL_CHANNELS",
    "SLACK_LIST_CONVERSATIONS",
]

SLACK_MESSAGE_HISTORY_ACTIONS = [
    "SLACK_FETCH_CONVERSATION_HISTORY",
    "SLACK_LIST_ALL_MESSAGES_IN_A_CHANNEL",
]

SLACK_USER_INFO_ACTIONS = [
    "SLACK_RETRIEVE_DETAILED_USER_INFORMATION",
    "SLACK_RETRIEVE_USER_PROFILE_INFORMATION",
    "SLACK_GET_USERS_INFO",
]


def _should_retry_composio(exc: Exception) -> bool:
    text = str(exc).lower()
    # Do not retry deterministic deprecation/enum metadata failures.
    if "no metadata found for enum" in text or "deprecated" in text:
        return False
    return True


class IngestionService:
    def __init__(self, org_id: str, entity_id: str) -> None:
        self.org_id = org_id
        self.entity_id = entity_id
        self._toolset = get_toolset(entity_id)
        self._sb = get_supabase_admin()

    # ── Public sync methods ───────────────────────────────────────────────────

    async def sync_slack(self, since_hours: int = 24) -> int:
        """Pull Slack message metadata from all channels for the past N hours."""
        stored = 0
        channels_resp = self._execute_first_success(SLACK_CHANNEL_LIST_ACTIONS, [{}])
        channels = self._extract_channels(channels_resp)

        oldest_ts = str(
            (datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)).timestamp()
        )

        for channel in channels:
            channel_id = channel.get("id")
            if not channel_id:
                continue

            msgs_resp = self._execute_first_success(
                SLACK_MESSAGE_HISTORY_ACTIONS,
                [
                    {"channel": channel_id, "oldest": oldest_ts},
                    {"conversation_id": channel_id, "oldest": oldest_ts},
                    {"channel_id": channel_id, "oldest": oldest_ts},
                ],
            )
            for msg in self._extract_messages(msgs_resp):
                slack_user_id = msg.get("user")
                if not slack_user_id:
                    continue
                email = self._resolve_slack_email(slack_user_id)
                if not email:
                    continue
                signal = normalize_slack_message(msg, email, channel_id)
                self._store_signal(signal)
                stored += 1

        logger.info("[Composio] Slack sync: stored %d signals for org=%s", stored, self.org_id)
        return stored

    async def sync_slack_with_sentiment(self, since_hours: int = 24) -> dict:
        """Pull Slack messages, run in-flight sentiment per employee, store derived scores only.

        Raw message text is never persisted — only sentiment scores and emotion vectors.
        """
        from ai.schemas import SentimentRequest
        from ai.sentiment import analyze_sentiment

        texts_by_email: dict[str, list[str]] = {}
        signal_count = 0

        channels_resp = self._execute_first_success(SLACK_CHANNEL_LIST_ACTIONS, [{}])
        channels = self._extract_channels(channels_resp)
        oldest_ts = str(
            (datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)).timestamp()
        )

        for channel in channels:
            channel_id = channel.get("id")
            if not channel_id:
                continue
            msgs_resp = self._execute_first_success(
                SLACK_MESSAGE_HISTORY_ACTIONS,
                [
                    {"channel": channel_id, "oldest": oldest_ts},
                    {"conversation_id": channel_id, "oldest": oldest_ts},
                    {"channel_id": channel_id, "oldest": oldest_ts},
                ],
            )
            for msg in self._extract_messages(msgs_resp):
                slack_user_id = msg.get("user")
                text = (msg.get("text") or "").strip()
                if not slack_user_id or not text:
                    continue
                email = self._resolve_slack_email(slack_user_id)
                if not email:
                    continue
                # Store metadata signal (no message text included)
                self._store_signal(normalize_slack_message(msg, email, channel_id))
                signal_count += 1
                # Accumulate text in-memory only — never written to DB
                bucket = texts_by_email.setdefault(email, [])
                if len(bucket) < 50:
                    bucket.append(text)

        # Analyze sentiment per employee; store only the derived scores
        sentiment_count = 0
        for email, texts in texts_by_email.items():
            if not texts:
                continue
            try:
                result = await analyze_sentiment(SentimentRequest(employee_id=email, texts=texts))
                emotions = (
                    result.emotions
                    if isinstance(result.emotions, dict)
                    else result.emotions.model_dump()
                )
                self._store_signal_row(
                    employee_email=email,
                    source="slack",
                    signal_type="sentiment_batch",
                    occurred_at=datetime.now(tz=timezone.utc),
                    metadata={
                        "sentiment_score": result.score,
                        "label": result.label,
                        "dominant_emotion": result.dominant_emotion,
                        "emotions": emotions,
                        "sarcasm_detected": result.sarcasm_detected,
                        "confidence": result.confidence,
                        "message_count": len(texts),
                    },
                )
                sentiment_count += 1
            except Exception as exc:
                logger.error("[Composio] Sentiment failed for %s: %s", email, exc)

        logger.info(
            "[Composio] Slack+sentiment: %d signals, %d sentiment batches for org=%s",
            signal_count, sentiment_count, self.org_id,
        )
        return {"signals": signal_count, "sentiment_batches": sentiment_count}

    async def sync_gmail(self, since_hours: int = 24) -> int:
        """Pull Gmail thread metadata for the past N hours."""
        stored = 0
        threads_resp = self._execute("GMAIL_LIST_THREADS", {"maxResults": 100})

        for thread_stub in (threads_resp.get("threads") or []):
            thread_id = thread_stub.get("id")
            if not thread_id:
                continue
            detail = self._execute("GMAIL_GET_THREAD", {"id": thread_id})
            signal = normalize_gmail_thread(detail)
            if signal:
                self._store_signal(signal)
                stored += 1

        logger.info("[Composio] Gmail sync: stored %d signals for org=%s", stored, self.org_id)
        return stored

    async def sync_gcal(self, employee_email: str, since_hours: int = 24) -> int:
        """Pull Google Calendar event metadata for a specific employee."""
        stored = 0
        now = datetime.now(tz=timezone.utc)
        events_resp = self._execute(
            "GOOGLECALENDAR_LIST_EVENTS",
            {
                "timeMin": (now - timedelta(hours=since_hours)).isoformat(),
                "timeMax": now.isoformat(),
            },
        )
        for event in (events_resp.get("items") or []):
            signal = normalize_gcal_event(event, employee_email)
            self._store_signal(signal)
            stored += 1

        logger.info("[Composio] GCal sync: stored %d signals for %s", stored, employee_email)
        return stored

    async def sync_github(self, employee_email: str, repos: list[str]) -> int:
        """Pull GitHub PR metadata for given repos and map to an employee."""
        stored = 0
        for repo_full in repos:
            parts = repo_full.split("/", 1)
            if len(parts) != 2:
                continue
            owner, repo = parts
            prs_resp = self._execute(
                "GITHUB_LIST_PULL_REQUESTS",
                {"owner": owner, "repo": repo, "state": "all", "per_page": 50},
            )
            for pr in (prs_resp.get("items") or prs_resp.get("data") or []):
                signal = normalize_github_pr(pr, employee_email)
                self._store_signal(signal)
                stored += 1

        logger.info("[Composio] GitHub sync: stored %d signals for %s", stored, employee_email)
        return stored

    # ── Aggregate → EmployeeDataInput fields ─────────────────────────────────

    def compute_signal_aggregates(self, employee_email: str, days: int = 14) -> dict:
        """
        Returns a partial dict compatible with EmployeeDataInput fields.
        Used to enrich AI inference payloads with live Composio signals.
        """
        since = (datetime.now(tz=timezone.utc) - timedelta(days=days)).isoformat()
        try:
            rows = (
                self._sb.table("external_signals")
                .select("source, signal_type, after_hours, metadata")
                .eq("employee_email", employee_email)
                .eq("org_id", self.org_id)
                .gte("occurred_at", since)
                .execute()
            ).data or []
        except Exception as exc:
            logger.warning("[Composio] aggregate query failed for %s: %s", employee_email, exc)
            return {}

        after_hours_events = sum(1 for r in rows if r.get("after_hours"))
        meeting_minutes = sum(
            int((r.get("metadata") or {}).get("duration_minutes") or 0)
            for r in rows
            if r.get("signal_type") == "meeting_attended"
        )
        pr_count = sum(
            1 for r in rows if r.get("signal_type") in ("pr_opened", "pr_merged")
        )

        # Aggregate sentiment from in-flight analysis batches
        sentiment_rows = [r for r in rows if r.get("signal_type") == "sentiment_batch"]
        total_events = max(len([r for r in rows if r.get("source") == "slack"]), 1)
        after_hours_ratio = round(after_hours_events / total_events, 3)

        avg_sentiment: float | None = None
        dominant_emotions: dict[str, float] = {}
        if sentiment_rows:
            scores = [
                float((r.get("metadata") or {}).get("sentiment_score", 0.0))
                for r in sentiment_rows
            ]
            avg_sentiment = round(sum(scores) / len(scores), 3)
            for r in sentiment_rows:
                for emotion, val in ((r.get("metadata") or {}).get("emotions") or {}).items():
                    dominant_emotions[emotion] = dominant_emotions.get(emotion, 0.0) + float(val)
            if dominant_emotions:
                n = len(sentiment_rows)
                dominant_emotions = {k: round(v / n, 3) for k, v in dominant_emotions.items()}

        weeks = max(days / 7, 1)
        result = {
            # Each after-hours event approximated as 15 minutes
            "after_hours_hours_14d": round(after_hours_events * 0.25, 1),
            "meeting_load_hours_weekly": round(meeting_minutes / 60 / weeks, 1),
            "pull_requests_merged_14d": pr_count,
            "after_hours_ratio": after_hours_ratio,
        }
        if avg_sentiment is not None:
            result["sentiment_score"] = avg_sentiment
            result["emotion_breakdown"] = dominant_emotions
        return result

    # ── Internals ─────────────────────────────────────────────────────────────

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception(_should_retry_composio),
    )
    def _execute(self, action: str, params: dict) -> dict:
        try:
            result = self._toolset.execute_action(action=action, params=params)
            return (result or {}).get("data") or result or {}
        except Exception as exc:
            logger.warning("[Composio] action=%s params=%s error=%s", action, params, exc)
            raise  # tenacity will retry

    def _execute_first_success(self, actions: list[str], params_candidates: list[dict]) -> dict:
        last_exc: Exception | None = None
        for action in actions:
            for params in params_candidates:
                try:
                    return self._execute(action, params)
                except Exception as exc:
                    last_exc = exc
                    continue
        if last_exc:
            raise last_exc
        return {}

    @staticmethod
    def _extract_channels(payload: dict) -> list[dict]:
        if not isinstance(payload, dict):
            return []
        channels = (
            payload.get("channels")
            or payload.get("conversations")
            or payload.get("items")
            or payload.get("data")
            or []
        )
        if isinstance(channels, dict):
            channels = channels.get("channels") or channels.get("items") or []
        return channels if isinstance(channels, list) else []

    @staticmethod
    def _extract_messages(payload: dict) -> list[dict]:
        if not isinstance(payload, dict):
            return []
        messages = (
            payload.get("messages")
            or payload.get("items")
            or payload.get("history")
            or payload.get("data")
            or []
        )
        if isinstance(messages, dict):
            messages = messages.get("messages") or messages.get("items") or []
        return messages if isinstance(messages, list) else []

    def _resolve_slack_email(self, slack_user_id: str) -> str | None:
        info = self._execute_first_success(
            SLACK_USER_INFO_ACTIONS,
            [
                {"user": slack_user_id},
                {"user_id": slack_user_id},
                {"id": slack_user_id},
            ],
        )

        candidates = [
            info.get("email"),
            (info.get("profile") or {}).get("email"),
            (info.get("user") or {}).get("email"),
            ((info.get("user") or {}).get("profile") or {}).get("email"),
            (info.get("user_profile") or {}).get("email"),
        ]
        users = info.get("users") if isinstance(info, dict) else None
        if isinstance(users, list):
            for u in users:
                if isinstance(u, dict):
                    candidates.append(u.get("email"))
                    candidates.append((u.get("profile") or {}).get("email"))

        for email in candidates:
            if isinstance(email, str) and "@" in email:
                return email.strip().lower()
        return None

    def _store_signal(self, signal: SignalUnion) -> None:
        self._store_signal_row(
            employee_email=signal.employee_email,
            source=signal.source,
            signal_type=signal.signal_type,
            occurred_at=signal.occurred_at,
            after_hours=getattr(signal, "after_hours", False),
            metadata=getattr(signal, "metadata", {}),
        )

    def _store_signal_row(
        self,
        *,
        employee_email: str,
        source: str,
        signal_type: str,
        occurred_at: datetime,
        after_hours: bool = False,
        metadata: dict | None = None,
    ) -> None:
        row: dict = {
            "org_id":         self.org_id,
            "employee_email": employee_email,
            "source":         source,
            "signal_type":    signal_type,
            "occurred_at":    occurred_at.isoformat(),
            "after_hours":    after_hours,
            "metadata":       metadata or {},
        }
        try:
            self._sb.table("external_signals").insert(row).execute()
        except Exception as exc:
            logger.error("[Composio] store_signal failed: %s | row=%s", exc, row)
