"""Performance prediction using Groq."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from ai.groq_client import groq_chat
from ai.models import build_fallback_structured_insight, parse_structured_insight
from ai.schemas import PerformanceRequest, PerformanceResult


@lru_cache(maxsize=1)
def _load_prompt() -> str:
    prompt_path = Path(__file__).resolve().parent / "prompts" / "performance.txt"
    return prompt_path.read_text(encoding="utf-8").strip()


def _build_messages(request: PerformanceRequest) -> list[dict[str, str]]:
    payload = request.model_dump()
    return [
        {"role": "system", "content": _load_prompt()},
        {"role": "user", "content": json.dumps(payload)},
    ]


async def predict_performance(request: PerformanceRequest) -> PerformanceResult:
    """Predict performance band using the Groq LLM."""
    fallback = build_fallback_structured_insight(
        summary="Performance analysis unavailable due to model output issues.",
        key_signals=["KPI trend unavailable", "Peer review trend unavailable", "Sentiment trend unavailable"],
        recommended_action="Schedule a manager check-in and review workload expectations.",
        confidence="low",
        urgency="monitor",
    )

    try:
        response = await groq_chat(messages=_build_messages(request))
        content = response.choices[0].message.content if response and response.choices else ""
        structured = parse_structured_insight(content, fallback)

        predicted_band = "solid"
        if structured.urgency == "immediate":
            predicted_band = "at-risk"
        elif structured.confidence == "high" and request.kpi_completion_rate >= 0.8:
            predicted_band = "top"

        confidence_map = {"high": 0.85, "medium": 0.65, "low": 0.45}

        return PerformanceResult(
            predicted_band=predicted_band,
            confidence=confidence_map.get(structured.confidence, 0.45),
            narrative=structured.summary,
            suggested_actions=[structured.recommended_action],
            structured_insight=structured,
        )
    except Exception:
        return PerformanceResult(
            predicted_band="solid",
            confidence=0.0,
            narrative="Analysis unavailable",
            suggested_actions=[fallback.recommended_action],
            structured_insight=fallback,
        )
