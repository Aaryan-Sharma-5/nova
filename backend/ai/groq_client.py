"""Groq OpenAI-compatible client singleton and chat helper with retries."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from functools import lru_cache

from groq import Groq
from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(_ENV_PATH)


@lru_cache(maxsize=1)
def get_groq_client() -> Groq:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY environment variable is not set")
    return Groq(api_key=api_key)


def _is_rate_limit_error(exc: BaseException) -> bool:
    text = str(exc)
    if "429" in text:
        return True
    code = getattr(exc, "status_code", None)
    return code == 429


def _get_model_config() -> tuple[str, str | None, float, int]:
    primary = os.environ.get("GROQ_MODEL_PRIMARY", "llama3-8b-8192")
    fallback = os.environ.get("GROQ_MODEL_FALLBACK")
    temperature = float(os.environ.get("GROQ_TEMPERATURE", "0.2"))
    max_tokens = int(os.environ.get("GROQ_MAX_TOKENS", "512"))
    return primary, fallback, temperature, max_tokens


def _is_model_decommissioned_error(exc: BaseException) -> bool:
    text = str(exc).lower()
    return "decommissioned" in text and "model" in text


async def groq_chat(
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    stream: bool = False,
):
    """
    Call Groq chat completions with up to 2 retries on rate limit (429).
    """
    client = get_groq_client()
    last_error: BaseException | None = None

    primary_model, fallback_model, default_temp, default_max_tokens = _get_model_config()
    chosen_model = model or primary_model
    chosen_temp = default_temp if temperature is None else temperature
    chosen_max_tokens = default_max_tokens if max_tokens is None else max_tokens

    for attempt in range(3):
        try:
            return client.chat.completions.create(
                model=chosen_model,
                messages=messages,
                temperature=chosen_temp,
                max_tokens=chosen_max_tokens,
                stream=stream,
            )
        except Exception as e:  # noqa: BLE001 — propagate after retries
            last_error = e
            if _is_model_decommissioned_error(e) and fallback_model and chosen_model != fallback_model:
                chosen_model = fallback_model
                continue
            if _is_rate_limit_error(e) and attempt < 2:
                await asyncio.sleep(2**attempt)
                continue
            raise

    if last_error:
        raise last_error
    raise RuntimeError("groq_chat failed with no error recorded")
