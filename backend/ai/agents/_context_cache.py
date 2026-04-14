"""Async, time-bounded cache for pre-fetched agent reference data."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)


class TimedCache:
    """Refresh a value by calling `loader` no more often than `ttl_seconds`."""

    def __init__(self, ttl_seconds: float, loader: Callable[[], Awaitable[Any]]) -> None:
        self._ttl = ttl_seconds
        self._loader = loader
        self._value: Any = None
        self._fetched_at: float = 0.0
        self._lock = asyncio.Lock()

    async def get(self) -> Any:
        now = time.monotonic()
        if self._value is not None and (now - self._fetched_at) < self._ttl:
            return self._value
        async with self._lock:
            now = time.monotonic()
            if self._value is not None and (now - self._fetched_at) < self._ttl:
                return self._value
            try:
                self._value = await self._loader()
                self._fetched_at = time.monotonic()
            except Exception:  # noqa: BLE001 - caching must never break a turn
                logger.exception("agent context loader failed")
                if self._value is None:
                    self._value = {}
            return self._value


def system_user() -> Any:
    """Synthetic in-process user used when calling route handlers directly."""
    from models.user import User, UserRole

    return User(
        email="system-agent@nova.local",
        full_name="NOVA Agent System",
        role=UserRole.LEADERSHIP,
    )
