"""Feedback Analyzer Agent — active on /hr/feedback-analyzer."""

from __future__ import annotations

import logging
from typing import Any

from ai.agents._context_cache import TimedCache, system_user
from ai.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = (
    "You are the Feedback Analysis Agent for NOVA. You help HR interpret "
    "employee feedback patterns, identify sentiment trends, detect sarcasm, "
    "and surface actionable themes. You have access to org-wide feedback "
    "theme data. Protect employee anonymity — never identify anonymous "
    "feedback authors. Keep responses under 3 sentences for voice. Use "
    "[ACTION: /route] to suggest navigation when helpful. The current user's "
    "role is {role}. Adjust your responses: HR and Leadership: full data access "
    "with specific numbers. Manager: team-level only. Employee: personal-level "
    "only and no peer comparisons."
)


async def _load_themes() -> dict[str, Any]:
    try:
        from api.routes.hr_feedback import org_themes

        data = await org_themes(_current_user=system_user())  # type: ignore[arg-type]
        return {"org_themes": data}
    except Exception:  # noqa: BLE001
        logger.debug("feedback agent: org_themes unavailable", exc_info=True)
        return {}


class FeedbackAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            agent_id="feedback_agent",
            system_prompt=SYSTEM_PROMPT,
            display_name="Feedback Analyzer Agent",
        )
        self._cache = TimedCache(ttl_seconds=300, loader=_load_themes)

    async def gather_context(
        self,
        message: str,  # noqa: ARG002
        context_data: dict[str, Any],
    ) -> dict[str, Any] | None:
        data = dict(await self._cache.get() or {})

        for key in (
            "active_filters",
            "selected_feedback_ids",
            "batch_analysis_result",
        ):
            if key in context_data:
                data[key] = context_data[key]

        return data or None
