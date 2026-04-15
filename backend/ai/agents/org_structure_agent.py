"""Org Structure Agent — active on /employees/org-tree."""

from __future__ import annotations

import logging
from typing import Any

from ai.agents._context_cache import TimedCache, system_user
from ai.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are the Org Structure Agent for NOVA. You answer questions about "
    "reporting structure, manager span, and team risk patterns using the org "
    "hierarchy context. The current user's role is {role}. Adjust your responses: "
    "HR and Leadership: full data access, use specific numbers. Manager: team-level "
    "data only, no org-wide figures. Employee: personal data only, no peer comparisons. "
    "Keep responses under 3 sentences for voice clarity. Response style: sentence 1 = "
    "direct structural answer, sentence 2 = quantification (reports/span/risk), sentence "
    "3 = recommended next action. For expandable team actions, emit "
    "[ACTION: expand-node:{employee_id}]."
)


async def _load_org() -> dict[str, Any]:
    payload: dict[str, Any] = {}

    try:
        from api.routes.org_tree import get_hierarchy_stats

        payload["org_stats"] = await get_hierarchy_stats(_current_user=system_user())  # type: ignore[arg-type]
    except Exception:  # noqa: BLE001
        logger.debug("org-structure agent: hierarchy stats unavailable", exc_info=True)

    try:
        from scripts.generate_synthetic_data import generate_org_hierarchy

        payload["org_roster"] = generate_org_hierarchy()
    except Exception:  # noqa: BLE001
        logger.debug("org-structure agent: roster unavailable", exc_info=True)

    return payload


def _find_person(message: str, roster: list[dict[str, Any]], fallback_name: str | None) -> dict[str, Any] | None:
    lowered = (message or "").lower()
    for employee in roster:
        name = str(employee.get("name") or "")
        if name and name.lower() in lowered:
            return employee

    if fallback_name:
        target = fallback_name.lower()
        for employee in roster:
            if str(employee.get("name") or "").lower() == target:
                return employee

    return None


def _direct_reports(roster: list[dict[str, Any]], manager_id: str) -> list[dict[str, Any]]:
    return [row for row in roster if str(row.get("manager_id") or "") == manager_id]


class OrgStructureAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            agent_id="org_structure_agent",
            system_prompt=SYSTEM_PROMPT,
            display_name="Org Structure Agent",
        )
        self._cache = TimedCache(ttl_seconds=180, loader=_load_org)

    async def gather_context(
        self,
        message: str,  # noqa: ARG002
        context_data: dict[str, Any],
    ) -> dict[str, Any] | None:
        data = dict(await self._cache.get() or {})
        for key in ("currently_expanded_node_id", "currently_expanded_node_name"):
            if key in context_data:
                data[key] = context_data[key]
        return data or None

    async def respond(
        self,
        message: str,
        history: Any = None,
        context_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        context = context_data or {}
        role = str(context.get("user_role") or "").lower()

        cached = await self._cache.get() or {}
        stats = (cached.get("org_stats") or {}) if isinstance(cached, dict) else {}
        roster = list((cached.get("org_roster") or []) if isinstance(cached, dict) else [])

        if not roster:
            return await super().respond(message, history, context)

        by_id = {str(row.get("id")): row for row in roster}
        expanded_name = str(context.get("currently_expanded_node_name") or "") or None

        lowered = (message or "").lower()

        if role == "employee":
            return {
                "reply": "I can only provide personal reporting-line details for employee role. Please ask your manager or HR for broader org analysis.",
                "agent_id": self.agent_id,
                "suggested_actions": [],
                "data_referenced": {},
            }

        if "show me" in lowered and "team" in lowered:
            person = _find_person(message, roster, expanded_name)
            if not person:
                return {
                    "reply": "Tell me the employee name and I can pull their team structure immediately.",
                    "agent_id": self.agent_id,
                    "suggested_actions": [],
                    "data_referenced": {},
                }
            person_id = str(person.get("id"))
            team = _direct_reports(roster, person_id)
            reply = (
                f"{person.get('name')} manages {len(team)} direct reports in {person.get('department')}. "
                "I'll expand their node now."
            )
            return {
                "reply": reply,
                "agent_id": self.agent_id,
                "suggested_actions": [
                    {
                        "label": f"Expand {person.get('name')}",
                        "route": person_id,
                        "action_type": "expand-node",
                    }
                ],
                "data_referenced": {"manager": person, "direct_reports": len(team)},
            }

        if "report to" in lowered or "reports to" in lowered:
            person = _find_person(message, roster, expanded_name)
            if not person:
                return {
                    "reply": "Please share the person's name so I can trace their reporting chain.",
                    "agent_id": self.agent_id,
                    "suggested_actions": [],
                    "data_referenced": {},
                }

            manager_id = str(person.get("manager_id") or "")
            manager = by_id.get(manager_id)
            if not manager:
                return {
                    "reply": f"{person.get('name')} appears to be at the top of the reporting chain.",
                    "agent_id": self.agent_id,
                    "suggested_actions": [],
                    "data_referenced": {"employee": person},
                }

            reply = (
                f"{person.get('name')} reports to {manager.get('name')}, {manager.get('role')}, "
                f"in the {manager.get('department')} chain."
            )
            return {
                "reply": reply,
                "agent_id": self.agent_id,
                "suggested_actions": [],
                "data_referenced": {"employee": person, "manager": manager},
            }

        if "most at-risk" in lowered and "manager" in lowered:
            if role == "manager":
                return {
                    "reply": "For manager role, I can only discuss your own team risk and not org-wide manager comparisons.",
                    "agent_id": self.agent_id,
                    "suggested_actions": [],
                    "data_referenced": {},
                }

            manager_rows = [row for row in roster if _direct_reports(roster, str(row.get("id")))]
            if not manager_rows:
                return await super().respond(message, history, context)

            best_manager = None
            best_at_risk = -1
            best_total = 0
            for manager in manager_rows:
                reports = _direct_reports(roster, str(manager.get("id")))
                at_risk = sum(1 for row in reports if bool(row.get("is_at_risk")))
                if at_risk > best_at_risk:
                    best_manager = manager
                    best_at_risk = at_risk
                    best_total = len(reports)

            if not best_manager:
                return await super().respond(message, history, context)

            reply = (
                f"{best_manager.get('name')}'s team has {best_at_risk} high-risk employees out of "
                f"{best_total} direct reports. An immediate team-level intervention may be needed. "
                "Opening the org tree may help you inspect that team."
            )
            return {
                "reply": reply,
                "agent_id": self.agent_id,
                "suggested_actions": [
                    {
                        "label": "Open Org Tree",
                        "route": "/employees/org-tree",
                        "action_type": "navigate",
                    }
                ],
                "data_referenced": {
                    "manager": best_manager,
                    "high_risk_count": best_at_risk,
                    "direct_reports": best_total,
                },
            }

        if "average span of control" in lowered or "avg span" in lowered or "span of control" in lowered:
            if role == "manager":
                return {
                    "reply": "For manager role, I can share span details for your own team but not org-wide span benchmarks.",
                    "agent_id": self.agent_id,
                    "suggested_actions": [],
                    "data_referenced": {},
                }

            avg_span = float(stats.get("avg_span_of_control") or 0.0)
            managers = [row for row in roster if _direct_reports(roster, str(row.get("id")))]
            widest = max(
                managers,
                key=lambda row: len(_direct_reports(roster, str(row.get("id")))),
                default=None,
            )
            if not widest:
                return await super().respond(message, history, context)

            widest_count = len(_direct_reports(roster, str(widest.get("id"))))
            at_risk_on_widest = sum(
                1
                for row in _direct_reports(roster, str(widest.get("id")))
                if bool(row.get("is_at_risk"))
            )
            risk_phrase = "elevated risk signals" if at_risk_on_widest > 0 else "manageable team risk"

            reply = (
                f"Managers in NOVA's org have an average of {avg_span:.1f} direct reports. "
                f"The widest span is {widest.get('name')} with {widest_count} reports, "
                f"which may contribute to {risk_phrase}."
            )
            return {
                "reply": reply,
                "agent_id": self.agent_id,
                "suggested_actions": [],
                "data_referenced": {
                    "avg_span_of_control": avg_span,
                    "widest_manager": widest,
                    "widest_span": widest_count,
                },
            }

        return await super().respond(message, history, context)
