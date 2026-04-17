"""
Converts raw Composio action responses into NOVA's unified signal types.

Rules:
- No message body or subject is stored.
- Only counts, timestamps, booleans, and participant counts are kept.
- after_hours = local_hour < 8 or local_hour >= 19 (UTC approximation).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


# ── Unified signal types ──────────────────────────────────────────────────────

@dataclass
class CommunicationMetadata:
    """Normalized communication signal — zero content stored."""
    employee_email:       str
    source:               str          # slack | gmail | gcal
    signal_type:          str          # message_sent | thread_replied | email_sent | meeting_attended
    occurred_at:          datetime
    channel_or_thread:    str | None = None
    participant_count:    int = 1
    after_hours:          bool = False
    response_lag_minutes: int | None = None
    is_cross_team:        bool = False
    metadata:             dict = field(default_factory=dict)


@dataclass
class ActivityEvent:
    """Normalized task or code-activity signal."""
    employee_email: str
    source:         str           # github | jira
    signal_type:    str           # pr_opened | pr_merged | commit | issue_closed | issue_updated
    occurred_at:    datetime
    repository:     str | None = None
    status:         str | None = None
    metadata:       dict = field(default_factory=dict)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_after_hours(dt: datetime) -> bool:
    hour = dt.hour
    return hour < 8 or hour >= 19


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


# ── Slack ─────────────────────────────────────────────────────────────────────

def normalize_slack_message(raw: dict, user_email: str, channel_id: str) -> CommunicationMetadata:
    """
    raw: a single message dict from SLACK_LIST_ALL_MESSAGES_IN_A_CHANNEL.
    Expects: ts (unix timestamp str), thread_ts (optional), reply_count (optional).
    """
    ts_raw = raw.get("ts") or raw.get("timestamp", "0")
    try:
        occurred_at = datetime.fromtimestamp(float(ts_raw), tz=timezone.utc)
    except (ValueError, TypeError):
        occurred_at = datetime.now(tz=timezone.utc)

    is_reply = bool(raw.get("thread_ts") and raw.get("thread_ts") != raw.get("ts"))
    reply_count = int(raw.get("reply_count") or 0)

    return CommunicationMetadata(
        employee_email=user_email,
        source="slack",
        signal_type="thread_replied" if is_reply else "message_sent",
        occurred_at=occurred_at,
        channel_or_thread=channel_id,
        participant_count=reply_count + 1,
        after_hours=_is_after_hours(occurred_at),
    )


# ── Gmail ─────────────────────────────────────────────────────────────────────

def normalize_gmail_thread(raw: dict) -> CommunicationMetadata | None:
    """
    raw: thread detail dict from GMAIL_GET_THREAD.
    Extracts sender email from From header — stores no subject or body.
    """
    messages = raw.get("messages") or []
    if not messages:
        return None

    first = messages[0]
    headers = {h["name"].lower(): h["value"] for h in (first.get("payload") or {}).get("headers") or []}
    from_header = headers.get("from", "")
    # Extract email address from "Name <email>" or plain "email"
    if "<" in from_header and ">" in from_header:
        sender_email = from_header.split("<")[-1].rstrip(">").strip()
    else:
        sender_email = from_header.strip()

    if not sender_email or "@" not in sender_email:
        return None

    ts_ms = int(first.get("internalDate") or 0)
    occurred_at = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc) if ts_ms else datetime.now(tz=timezone.utc)

    return CommunicationMetadata(
        employee_email=sender_email,
        source="gmail",
        signal_type="email_sent",
        occurred_at=occurred_at,
        participant_count=len(messages),
        after_hours=_is_after_hours(occurred_at),
    )


# ── Google Calendar ───────────────────────────────────────────────────────────

def normalize_gcal_event(raw: dict, employee_email: str) -> CommunicationMetadata:
    """
    raw: event dict from GOOGLECALENDAR_LIST_EVENTS.
    Stores attendee count and duration — no title or description.
    """
    start_block = raw.get("start") or {}
    start_str = start_block.get("dateTime") or start_block.get("date") or ""
    try:
        occurred_at = _parse_iso(start_str) if start_str else datetime.now(tz=timezone.utc)
    except ValueError:
        occurred_at = datetime.now(tz=timezone.utc)

    end_block = raw.get("end") or {}
    end_str = end_block.get("dateTime") or ""
    duration_minutes = 0
    if end_str and start_str:
        try:
            duration_minutes = int((_parse_iso(end_str) - occurred_at).total_seconds() / 60)
        except Exception:
            pass

    attendees = raw.get("attendees") or []

    return CommunicationMetadata(
        employee_email=employee_email,
        source="gcal",
        signal_type="meeting_attended",
        occurred_at=occurred_at,
        participant_count=len(attendees),
        after_hours=_is_after_hours(occurred_at),
        metadata={"duration_minutes": duration_minutes},
    )


# ── GitHub ────────────────────────────────────────────────────────────────────

def normalize_github_pr(raw: dict, employee_email: str) -> ActivityEvent:
    """raw: PR dict from GITHUB_LIST_PULL_REQUESTS."""
    merged_at = raw.get("merged_at")
    created_at = raw.get("created_at") or ""
    ts_str = merged_at or created_at
    try:
        occurred_at = _parse_iso(ts_str) if ts_str else datetime.now(tz=timezone.utc)
    except ValueError:
        occurred_at = datetime.now(tz=timezone.utc)

    repo_name = (raw.get("base") or {}).get("repo", {}).get("full_name") or raw.get("repo")

    return ActivityEvent(
        employee_email=employee_email,
        source="github",
        signal_type="pr_merged" if merged_at else "pr_opened",
        occurred_at=occurred_at,
        repository=repo_name,
        status=raw.get("state"),
        metadata={
            "additions":  raw.get("additions", 0),
            "deletions":  raw.get("deletions", 0),
            "pr_number":  raw.get("number"),
        },
    )


# ── Jira ──────────────────────────────────────────────────────────────────────

def normalize_jira_issue(raw: dict, employee_email: str) -> ActivityEvent:
    """raw: issue dict from JIRA_GET_AN_ISSUE."""
    fields = raw.get("fields") or {}
    ts_str = fields.get("updated") or fields.get("created") or ""
    try:
        occurred_at = _parse_iso(ts_str) if ts_str else datetime.now(tz=timezone.utc)
    except ValueError:
        occurred_at = datetime.now(tz=timezone.utc)

    status_name = (fields.get("status") or {}).get("name") or ""
    signal_type = "issue_closed" if status_name.lower() in ("done", "closed", "resolved") else "issue_updated"

    return ActivityEvent(
        employee_email=employee_email,
        source="jira",
        signal_type=signal_type,
        occurred_at=occurred_at,
        status=status_name,
        metadata={
            "priority":     (fields.get("priority") or {}).get("name"),
            "story_points": fields.get("story_points") or fields.get("customfield_10016"),
            "issue_key":    raw.get("key"),
        },
    )
