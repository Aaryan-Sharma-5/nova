"""Sentiment analysis using Groq."""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

from ai.groq_client import groq_chat
from ai.models import build_fallback_structured_insight, parse_structured_insight
from ai.schemas import SentimentRequest, SentimentResult


EMOTION_KEYS = (
    "stress",
    "frustration",
    "disengagement",
    "satisfaction",
    "enthusiasm",
    "anxiety",
)

# In-memory daily emotion history by employee and date.
_EMOTION_HISTORY: dict[str, dict[str, dict[str, float]]] = {}


@lru_cache(maxsize=1)
def _load_prompt() -> str:
    prompt_path = Path(__file__).resolve().parent / "prompts" / "sentiment.txt"
    return prompt_path.read_text(encoding="utf-8").strip()


def _build_messages(request: SentimentRequest) -> list[dict[str, str]]:
    sentiment_delta = _rolling_delta(request.texts)
    emotions = _detect_emotions(request.texts)
    employee_history = _EMOTION_HISTORY.get(request.employee_id, {})
    history_preview = [
        {"date": day, "emotions": employee_history[day]}
        for day in sorted(employee_history.keys())[-14:]
    ]
    payload = {
        "employee_id": request.employee_id,
        "texts": request.texts,
        "rolling_window_delta": sentiment_delta,
        "emotion_signals": emotions,
        "emotion_history_14d": history_preview,
    }
    return [
        {"role": "system", "content": _load_prompt()},
        {"role": "user", "content": json.dumps(payload)},
    ]


def _normalize_text(text: str) -> str:
    return " ".join(text.lower().split())


def _simple_polarity_score(texts: list[str]) -> float:
    positive = {
        "support", "supported", "appreciated", "great", "good", "motivated", "engaged",
        "balanced", "happy", "enjoy", "love", "positive", "valued", "growth",
    }
    negative = {
        "stress", "stressed", "overwhelmed", "burnout", "frustrated", "tired",
        "exhausted", "unhappy", "toxic", "ignored", "dread", "pressure", "overworked",
    }
    score = 0.0
    for text in texts:
        normalized = _normalize_text(text)
        for word in positive:
            if word in normalized:
                score += 1.0
        for word in negative:
            if word in normalized:
                score -= 1.0
    if not texts:
        return 0.0
    return score / max(1, len(texts))


def _rolling_delta(texts: list[str]) -> float:
    if len(texts) < 2:
        return 0.0
    split_index = max(1, len(texts) // 3)
    recent = texts[-split_index:]
    baseline = texts[:-split_index]
    recent_score = _simple_polarity_score(recent)
    baseline_score = _simple_polarity_score(baseline)
    return round(recent_score - baseline_score, 3)


def _detect_emotions(texts: list[str]) -> dict[str, float]:
    stress_words = {"overwhelmed", "stress", "stressed", "burnout", "pressure", "exhausted"}
    frustration_words = {"frustrated", "blocked", "ignored", "unfair", "stuck"}
    disengagement_words = {"detached", "checked out", "unmotivated", "bored", "apathy"}
    satisfaction_words = {"satisfied", "content", "balanced", "stable", "comfortable", "valued"}
    enthusiasm_words = {"excited", "motivated", "energized", "enthusiastic", "passionate", "inspired"}
    anxiety_words = {"anxious", "worried", "uneasy", "nervous", "panic", "uncertain"}

    signals = {
        "stress": 0.0,
        "frustration": 0.0,
        "disengagement": 0.0,
        "satisfaction": 0.0,
        "enthusiasm": 0.0,
        "anxiety": 0.0,
    }
    if not texts:
        return signals

    for text in texts:
        normalized = _normalize_text(text)
        if any(word in normalized for word in stress_words):
            signals["stress"] += 1.0
        if any(word in normalized for word in frustration_words):
            signals["frustration"] += 1.0
        if any(word in normalized for word in disengagement_words):
            signals["disengagement"] += 1.0
        if any(word in normalized for word in satisfaction_words):
            signals["satisfaction"] += 1.0
        if any(word in normalized for word in enthusiasm_words):
            signals["enthusiasm"] += 1.0
        if any(word in normalized for word in anxiety_words):
            signals["anxiety"] += 1.0

    total = float(len(texts))
    return {key: round(max(0.0, min(1.0, value / total)), 3) for key, value in signals.items()}


def _extract_json_object(raw_text: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(raw_text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", raw_text)
    if not match:
        return None

    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _normalize_emotions(raw: Any, fallback: dict[str, float]) -> dict[str, float]:
    if not isinstance(raw, dict):
        return fallback

    normalized: dict[str, float] = {}
    for key in EMOTION_KEYS:
        raw_value = raw.get(key, fallback.get(key, 0.0))
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            value = fallback.get(key, 0.0)
        normalized[key] = round(_clamp(value, 0.0, 1.0), 3)
    return normalized


def _dominant_emotion(emotions: dict[str, float]) -> str:
    return max(EMOTION_KEYS, key=lambda key: emotions.get(key, 0.0))


def _today_utc() -> date:
    return datetime.utcnow().date()


def _store_daily_emotion_vector(employee_id: str, day: date, emotions: dict[str, float]) -> None:
    bucket = _EMOTION_HISTORY.setdefault(employee_id, {})
    bucket[day.isoformat()] = {key: float(emotions.get(key, 0.0)) for key in EMOTION_KEYS}

    cutoff = day - timedelta(days=30)
    stale_days = [d for d in bucket.keys() if date.fromisoformat(d) < cutoff]
    for stale in stale_days:
        bucket.pop(stale, None)


def _compute_delta_for_window(
    employee_id: str,
    *,
    day: date,
    days: int,
    current_emotions: dict[str, float],
) -> dict[str, float]:
    history = _EMOTION_HISTORY.get(employee_id, {})
    lookback_start = day - timedelta(days=days)
    prior_vectors: list[dict[str, float]] = []

    for day_key, vector in history.items():
        parsed_day = date.fromisoformat(day_key)
        if lookback_start <= parsed_day < day:
            prior_vectors.append(vector)

    if not prior_vectors:
        return {key: 0.0 for key in EMOTION_KEYS}

    deltas: dict[str, float] = {}
    denominator = float(len(prior_vectors))
    for key in EMOTION_KEYS:
        avg_prior = sum(float(v.get(key, 0.0)) for v in prior_vectors) / denominator
        deltas[key] = round(_clamp(float(current_emotions.get(key, 0.0)) - avg_prior, -1.0, 1.0), 3)
    return deltas


async def analyze_sentiment(request: SentimentRequest) -> SentimentResult:
    """Analyze employee sentiment using the Groq LLM."""
    fallback = build_fallback_structured_insight(
        summary="Sentiment summary unavailable due to model output issues.",
        key_signals=["Message tone unclear", "Emotion trend unavailable", "Context depth insufficient"],
        recommended_action="Collect additional feedback and perform a manager follow-up.",
        confidence="low",
        urgency="monitor",
    )

    heuristic_polarity = _simple_polarity_score(request.texts)
    heuristic_polarity = _clamp(heuristic_polarity / 3.0, -1.0, 1.0)
    fallback_emotions = _detect_emotions(request.texts)

    confidence_map = {"high": 0.85, "medium": 0.65, "low": 0.45}

    try:
        response = await groq_chat(messages=_build_messages(request))
        content = response.choices[0].message.content if response and response.choices else ""
        payload = _extract_json_object(content) or {}
        structured = parse_structured_insight(content, fallback)

        raw_polarity = payload.get("polarity", heuristic_polarity)
        try:
            polarity = _clamp(float(raw_polarity), -1.0, 1.0)
        except (TypeError, ValueError):
            polarity = heuristic_polarity

        emotions = _normalize_emotions(payload.get("emotions"), fallback_emotions)
        dominant_candidate = payload.get("dominant_emotion")
        dominant = (
            str(dominant_candidate)
            if isinstance(dominant_candidate, str) and dominant_candidate in EMOTION_KEYS
            else _dominant_emotion(emotions)
        )

        if polarity > 0.2:
            label = "positive"
        elif polarity < -0.2:
            label = "negative"
        else:
            label = "neutral"

        today = _today_utc()
        trend_delta_14d = _compute_delta_for_window(
            request.employee_id,
            day=today,
            days=14,
            current_emotions=emotions,
        )
        trend_delta_7d = _compute_delta_for_window(
            request.employee_id,
            day=today,
            days=7,
            current_emotions=emotions,
        )
        _store_daily_emotion_vector(request.employee_id, today, emotions)

        return SentimentResult(
            score=polarity,
            polarity=polarity,
            label=label,
            summary=structured.summary,
            confidence=confidence_map.get(structured.confidence, 0.45),
            emotions=emotions,
            dominant_emotion=dominant,
            trend_delta_14d=trend_delta_14d,
            trend_delta_7d=trend_delta_7d,
            emotion_breakdown=emotions,
            structured_insight=structured,
        )
    except Exception:
        if heuristic_polarity > 0.2:
            fallback_label = "positive"
        elif heuristic_polarity < -0.2:
            fallback_label = "negative"
        else:
            fallback_label = "neutral"

        today = _today_utc()
        trend_delta_14d = _compute_delta_for_window(
            request.employee_id,
            day=today,
            days=14,
            current_emotions=fallback_emotions,
        )
        trend_delta_7d = _compute_delta_for_window(
            request.employee_id,
            day=today,
            days=7,
            current_emotions=fallback_emotions,
        )
        _store_daily_emotion_vector(request.employee_id, today, fallback_emotions)

        return SentimentResult(
            score=heuristic_polarity,
            polarity=heuristic_polarity,
            label=fallback_label,
            summary=fallback.summary,
            confidence=0.0,
            emotions=fallback_emotions,
            dominant_emotion=_dominant_emotion(fallback_emotions),
            trend_delta_14d=trend_delta_14d,
            trend_delta_7d=trend_delta_7d,
            emotion_breakdown=fallback_emotions,
            structured_insight=fallback,
        )
