"""Employee Intelligence Agent — active on /employees and profile pages."""

from __future__ import annotations

import logging
from typing import Any

from ai.agents._context_cache import system_user
from ai.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = (
    "You are the Employee Intelligence Agent for NOVA. You help HR "
    "professionals understand individual employee risk profiles, interpret "
    "scores, and decide on actions. When an employee is being viewed, their "
    "data is in your context. Never reveal raw scores to non-HR roles. "
    "Suggest specific actions like scheduling 1:1s, sending recognition, or "
    "reviewing interventions. Keep responses under 3 sentences. When you "
    "recommend a 1:1 with a specific employee, emit the action token "
    "[ACTION: schedule-1on1:{employee_id}]."
)


def _hr_visible(role: str | None) -> bool:
    return (role or "").lower() in {"hr", "leadership"}


async def _fetch_top_flight_risks(limit: int = 5) -> list[dict[str, Any]]:
    try:
        from core.database import get_supabase_admin

        sb = get_supabase_admin()
        resp = sb.table("employees").select(
            "id,name,department,role,attrition_risk,burnout_score,sentiment_score"
        ).limit(250).execute()
        rows = resp.data or []
    except Exception:  # noqa: BLE001
        logger.debug("employee agent: supabase unavailable", exc_info=True)
        rows = []

    rows.sort(key=lambda r: float(r.get("attrition_risk") or 0.0), reverse=True)
    return rows[:limit]


async def _fetch_employee_snapshot(employee_id: str) -> dict[str, Any] | None:
    try:
        from core.database import get_supabase_admin

        sb = get_supabase_admin()
        resp = (
            sb.table("employees")
            .select("*")
            .eq("id", employee_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0] if rows else None
    except Exception:  # noqa: BLE001
        logger.debug("employee agent: snapshot fetch failed", exc_info=True)
        return None


class EmployeeAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            agent_id="employee_intelligence_agent",
            system_prompt=SYSTEM_PROMPT,
            display_name="Employee Intelligence Agent",
        )

    async def gather_context(
        self,
        message: str,
        context_data: dict[str, Any],
    ) -> dict[str, Any] | None:
        _ = system_user()  # touched for parity with other agents
        out: dict[str, Any] = {}
        role = str(context_data.get("user_role") or "")

        viewed_id = (
            context_data.get("currently_viewed_employee_id")
            or context_data.get("employee_id")
        )
        if viewed_id:
            snapshot = await _fetch_employee_snapshot(str(viewed_id))
            if snapshot:
                if not _hr_visible(role):
                    # strip raw scores for non-HR consumers
                    snapshot = {
                        k: v
                        for k, v in snapshot.items()
                        if k not in {
                            "burnout_score",
                            "attrition_risk",
                            "sentiment_score",
                            "performance_score",
                            "engagement_score",
                        }
                    }
                out["viewed_employee"] = snapshot

        lowered = (message or "").lower()
        if any(t in lowered for t in ("flight risk", "highest risk", "attrition", "leaving")):
            top = await _fetch_top_flight_risks()
            if not _hr_visible(role):
                top = [
                    {k: v for k, v in row.items() if k in {"name", "department", "role"}}
                    for row in top
                ]
            out["top_flight_risks"] = top

        return out or None
