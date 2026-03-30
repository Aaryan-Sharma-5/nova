"""Retention risk assessment using Groq with rule-based overrides."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from ai.groq_client import groq_chat
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

    try:
        response = await groq_chat(messages=_build_messages(request))
        content = response.choices[0].message.content if response and response.choices else ""
        data = json.loads(content)
        key_reasons = _safe_list(data.get("key_reasons"), key_reasons)
        retention_actions = _safe_list(data.get("retention_actions"), retention_actions)
        if not force_high_risk:
            retention_risk = _safe_risk(data.get("retention_risk"), retention_risk)
            flight_risk_score = _safe_float(data.get("flight_risk_score"), flight_risk_score)
    except Exception:
        pass

    return RetentionResult(
        retention_risk=retention_risk,
        flight_risk_score=flight_risk_score,
        key_reasons=key_reasons,
        retention_actions=retention_actions,
    )
