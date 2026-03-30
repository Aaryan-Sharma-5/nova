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
    payload = {
        "employee_id": request.employee_id,
        "texts": request.texts,
    }
    return [
        {"role": "system", "content": _load_prompt()},
        {"role": "user", "content": json.dumps(payload)},
    ]


async def analyze_sentiment(request: SentimentRequest) -> SentimentResult:
    """Analyze employee sentiment using the Groq LLM."""
    try:
        response = await groq_chat(messages=_build_messages(request))
        content = response.choices[0].message.content if response and response.choices else ""
        data = json.loads(content)
        return SentimentResult(**data)
    except Exception:
        return SentimentResult(
            score=0.0,
            label="neutral",
            summary="Analysis unavailable",
            confidence=0.0,
        )
