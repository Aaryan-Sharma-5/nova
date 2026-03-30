"""Performance prediction using Groq."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from ai.groq_client import groq_chat
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
    try:
        response = await groq_chat(messages=_build_messages(request))
        content = response.choices[0].message.content if response and response.choices else ""
        data = json.loads(content)
        return PerformanceResult(**data)
    except Exception:
        return PerformanceResult(
            predicted_band="solid",
            confidence=0.0,
            narrative="Analysis unavailable",
            suggested_actions=[],
        )
