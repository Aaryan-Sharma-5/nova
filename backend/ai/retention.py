"""Retention risk assessment using Groq with rule-based overrides."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from ai.groq_client import groq_chat
from ai.models import build_fallback_structured_insight, parse_structured_insight
from ai.schemas import RetentionRequest, RetentionResult


@lru_cache(maxsize=1)
def _load_prompt() -> str:
    prompt_path = Path(__file__).resolve().parent / "prompts" / "retention.txt"
    return prompt_path.read_text(encoding="utf-8").strip()


def _build_messages(request: RetentionRequest) -> list[dict[str, str]]:
    payload = request.model_dump()
    return [
        {"role": "system", "content": _load_prompt()},
        {"role": "user", "content": json.dumps(payload)},
    ]


def _safe_list(value: object, fallback: list[str]) -> list[str]:
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return value
    return fallback


def _safe_text(value: object, fallback: str) -> str:
    return value if isinstance(value, str) and value.strip() else fallback


def _safe_float(value: object, fallback: float) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return fallback


def _safe_risk(value: object, fallback: str) -> str:
    if value in {"low", "medium", "high"}:
        return str(value)
    return fallback


async def assess_retention(request: RetentionRequest) -> RetentionResult:
    """Assess retention risk with a rule-based pre-filter and LLM insights."""
    force_high_risk = request.tenure_months < 12 and request.burnout_risk_score > 0.6
    retention_risk = "high" if force_high_risk else "medium"
    flight_risk_score = (
        min(request.burnout_risk_score + 0.2, 1.0) if force_high_risk else 0.0
    )
    key_reasons = ["Data unavailable"]
    retention_actions = ["Manual review recommended"]
    structured_insight = build_fallback_structured_insight(
        summary="Retention summary unavailable due to model output issues.",
        key_signals=key_reasons,
        recommended_action=retention_actions[0],
        confidence="low",
        urgency="monitor",
    )

    try:
        response = await groq_chat(messages=_build_messages(request))
        content = response.choices[0].message.content if response and response.choices else ""
        structured_insight = parse_structured_insight(content, structured_insight)
        key_reasons = _safe_list(structured_insight.key_signals, key_reasons)
        retention_actions = [structured_insight.recommended_action]

        if not force_high_risk:
            if structured_insight.urgency == "immediate":
                retention_risk = "high"
            elif structured_insight.urgency == "this_week":
                retention_risk = "medium"
            else:
                retention_risk = "low"

            if structured_insight.confidence == "high":
                flight_risk_score = max(flight_risk_score, 0.8)
            elif structured_insight.confidence == "medium":
                flight_risk_score = max(flight_risk_score, 0.5)
            else:
                flight_risk_score = max(flight_risk_score, 0.25)
    except Exception:
        pass

    return RetentionResult(
        retention_risk=retention_risk,
        flight_risk_score=flight_risk_score,
        key_reasons=key_reasons,
        retention_actions=retention_actions,
        structured_insight=structured_insight,
    )
