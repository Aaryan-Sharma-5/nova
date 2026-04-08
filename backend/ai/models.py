"""Shared AI response models and robust structured output parsing."""

from __future__ import annotations

import json
import re
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError


ConfidenceLevel = Literal["high", "medium", "low"]
UrgencyLevel = Literal["immediate", "this_week", "monitor"]


class StructuredInsight(BaseModel):
    """Strict structured insight shape required from prompt templates."""

    summary: str = Field(..., min_length=1)
    key_signals: list[str] = Field(..., min_length=3, max_length=3)
    recommended_action: str = Field(..., min_length=1)
    confidence: ConfidenceLevel
    urgency: UrgencyLevel


def _extract_json_object(raw_text: str) -> dict[str, Any] | None:
    """Try strict parse first, then recover from wrapped markdown/text blocks."""

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


def build_fallback_structured_insight(
    *,
    summary: str,
    key_signals: list[str],
    recommended_action: str,
    confidence: ConfidenceLevel = "low",
    urgency: UrgencyLevel = "monitor",
) -> StructuredInsight:
    """Create a compliant fallback structure even when the LLM payload is malformed."""

    normalized_signals = [s.strip() for s in key_signals if isinstance(s, str) and s.strip()]
    while len(normalized_signals) < 3:
        normalized_signals.append("Insufficient signal detail from model output")

    return StructuredInsight(
        summary=summary.strip() or "AI summary unavailable.",
        key_signals=normalized_signals[:3],
        recommended_action=recommended_action.strip() or "Run manual review and schedule manager follow-up.",
        confidence=confidence,
        urgency=urgency,
    )


def parse_structured_insight(
    raw_content: str,
    fallback: StructuredInsight,
) -> StructuredInsight:
    """Validate LLM content against StructuredInsight with robust malformed JSON handling."""

    candidate = _extract_json_object(raw_content)
    if not candidate:
        return fallback

    try:
        return StructuredInsight.model_validate(candidate)
    except ValidationError:
        return fallback
