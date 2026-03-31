"""Sentiment analysis using Groq."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from ai.groq_client import groq_chat
from ai.schemas import SentimentRequest, SentimentResult


@lru_cache(maxsize=1)
def _load_prompt() -> str:
    prompt_path = Path(__file__).resolve().parent / "prompts" / "sentiment.txt"
    return prompt_path.read_text(encoding="utf-8").strip()


def _build_messages(request: SentimentRequest) -> list[dict[str, str]]:
    sentiment_delta = _rolling_delta(request.texts)
    emotions = _detect_emotions(request.texts)
    payload = {
        "employee_id": request.employee_id,
        "texts": request.texts,
        "rolling_window_delta": sentiment_delta,
        "emotion_signals": emotions,
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

    signals = {"stress": 0.0, "frustration": 0.0, "disengagement": 0.0}
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

    total = float(len(texts))
    return {key: round(value / total, 3) for key, value in signals.items()}


async def analyze_sentiment(request: SentimentRequest) -> SentimentResult:
    """Analyze employee sentiment using the Groq LLM."""
    try:
        response = await groq_chat(messages=_build_messages(request))
        content = response.choices[0].message.content if response and response.choices else ""
        data = json.loads(content)
        emotion_breakdown = None
        raw_emotions = data.get("emotion_breakdown") if isinstance(data, dict) else None
        if isinstance(raw_emotions, dict):
            emotion_breakdown = {
                key: float(value)
                for key, value in raw_emotions.items()
                if isinstance(value, (int, float))
            }
        data["emotion_breakdown"] = emotion_breakdown
        return SentimentResult(**data)
    except Exception:
        return SentimentResult(
            score=0.0,
            label="neutral",
            summary="Analysis unavailable",
            confidence=0.0,
            emotion_breakdown=None,
        )
