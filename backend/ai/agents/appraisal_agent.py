"""Appraisal Agent — active on /hr/appraisals."""

from __future__ import annotations

import logging
from typing import Any

from ai.agents._context_cache import TimedCache, system_user
from ai.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = (
    "You are the Appraisal Agent for NOVA. You help HR professionals "
    "conduct fair, data-driven performance appraisals. You can explain "
    "appraisal scores, suggest decisions, identify anomalies in the "
    "appraisal distribution, and guide HR through the review workflow. "
    "Always clarify that AI suggestions are recommendations — final "
    "decisions rest with HR. Keep responses under 3 sentences for voice. "
    "Use [ACTION: /route] to suggest navigation when helpful. The current "
    "user's role is {role}. Adjust your responses: HR and Leadership: full "
    "data access with specific figures. Manager: team-level only. Employee: "
    "personal data only, no peer comparisons."
)


async def _load_summary() -> dict[str, Any]:
    try:
        from api.routes.appraisals import appraisal_summary

        data = await appraisal_summary(_current_user=system_user())  # type: ignore[arg-type]
        return {"appraisal_summary": data}
    except Exception:  # noqa: BLE001
        logger.debug("appraisal agent: summary unavailable", exc_info=True)
        return {}


class AppraisalAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            agent_id="appraisal_agent",
            system_prompt=SYSTEM_PROMPT,
            display_name="Appraisal Agent",
        )
        # Refresh every 5 minutes — appraisal cycle data is slow-moving.
        self._cache = TimedCache(ttl_seconds=300, loader=_load_summary)

    async def gather_context(
        self,
        message: str,  # noqa: ARG002
        context_data: dict[str, Any],
    ) -> dict[str, Any] | None:
        data = dict(await self._cache.get() or {})

        # Pass-through page state from frontend so the LLM can refer to it.
        for key in (
            "selected_department",
            "currently_reviewed_employee_id",
            "appraisal_filter_active",
        ):
            if key in context_data:
                data[key] = context_data[key]

        return data or None
