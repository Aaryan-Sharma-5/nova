"""Burnout risk assessment with rule-based scoring and Groq insights."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from ai.groq_client import groq_chat
from ai.schemas import BurnoutRequest, BurnoutResult


@lru_cache(maxsize=1)
def _load_prompt() -> str:
    prompt_path = Path(__file__).resolve().parent / "prompts" / "burnout.txt"
    return prompt_path.read_text(encoding="utf-8").strip()


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def _compute_score(request: BurnoutRequest) -> float:
    score = 0.0
    if request.overtime_hours > 50:
        score += 0.30
    if request.pto_days_unused > 10:
        score += 0.20
    if request.sentiment_score < -0.3:
        score += 0.25
    if request.meeting_load_hours > 30:
        score += 0.15
    if request.tenure_months < 6:
        score += 0.10
    return _clamp(score)


def _risk_level(score: float) -> str:
    if score <= 0.25:
        return "low"
    if score <= 0.50:
        return "medium"
    if score <= 0.75:
        return "high"
    return "critical"


def _build_messages(request: BurnoutRequest, score: float) -> list[dict[str, str]]:
    payload = {
        "employee_id": request.employee_id,
        "risk_score": score,
        "overtime_hours": request.overtime_hours,
        "pto_days_unused": request.pto_days_unused,
        "sentiment_score": request.sentiment_score,
        "meeting_load_hours": request.meeting_load_hours,
        "tenure_months": request.tenure_months,
    }
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


async def assess_burnout(request: BurnoutRequest) -> BurnoutResult:
    """Assess burnout risk and enrich with LLM-generated insights."""
    risk_score = _compute_score(request)
    risk_level = _risk_level(risk_score)
    factors = ["Data unavailable"]
    recommendation = "Manual review recommended"

    try:
        response = await groq_chat(messages=_build_messages(request, risk_score))
        content = response.choices[0].message.content if response and response.choices else ""
        data = json.loads(content)
        factors = _safe_list(data.get("factors"), factors)
        recommendation = _safe_text(data.get("recommendation"), recommendation)
    except Exception:
        pass

    return BurnoutResult(
        risk_level=risk_level,
        risk_score=risk_score,
        factors=factors,
        recommendation=recommendation,
    )
