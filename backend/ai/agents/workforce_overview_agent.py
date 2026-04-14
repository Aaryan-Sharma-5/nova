"""Workforce Overview Agent — active on /org-health and /dashboard."""

from __future__ import annotations

import logging
from typing import Any

from ai.agents._context_cache import TimedCache, system_user
from ai.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = (
    "You are the Workforce Overview Agent for NOVA. You have access to "
    "real-time org health data provided in your context. Answer questions "
    "about overall workforce health, burnout trends, attrition risk, "
    "department performance, and recommended interventions. Cite specific "
    "numbers from the data when answering. Keep all responses under 3 "
    "sentences for voice clarity. Use [ACTION: /route] to suggest navigation "
    "when helpful."
)


async def _load_overview() -> dict[str, Any]:
    user = system_user()
    payload: dict[str, Any] = {}

    try:
        from api.routes.insights import get_cost_impact

        payload["cost_impact"] = await get_cost_impact(_current_user=user)  # type: ignore[arg-type]
    except Exception:  # noqa: BLE001
        logger.debug("workforce agent: cost_impact unavailable", exc_info=True)

    try:
        from api.routes.intervention import get_roi_summary

        payload["roi_summary"] = await get_roi_summary(_current_user=user)  # type: ignore[arg-type]
    except Exception:  # noqa: BLE001
        logger.debug("workforce agent: roi_summary unavailable", exc_info=True)

    try:
        from api.routes.intervention import get_roi_recommendations

        recs = await get_roi_recommendations(_current_user=user)  # type: ignore[arg-type]
        payload["top_interventions"] = (recs or {}).get("recommendations", [])[:3]
    except Exception:  # noqa: BLE001
        logger.debug("workforce agent: roi_recommendations unavailable", exc_info=True)

    try:
        from api.routes.departments import get_efficiency_heatmap

        heatmap = await get_efficiency_heatmap(current_user=user)  # type: ignore[arg-type]
        payload["dept_heatmap"] = heatmap
        payload["dept_risk_flags"] = (heatmap or {}).get("risk_flags", {})
    except Exception:  # noqa: BLE001
        logger.debug("workforce agent: efficiency_heatmap unavailable", exc_info=True)

    return payload


class WorkforceOverviewAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            agent_id="workforce_overview_agent",
            system_prompt=SYSTEM_PROMPT,
            display_name="Workforce Overview Agent",
        )
        self._cache = TimedCache(ttl_seconds=300, loader=_load_overview)

    async def gather_context(
        self,
        message: str,  # noqa: ARG002
        context_data: dict[str, Any],  # noqa: ARG002
    ) -> dict[str, Any] | None:
        data = await self._cache.get()
        return data or None
