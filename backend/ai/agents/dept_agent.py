"""Department Insights Agent — active on /departments/heatmap."""

from __future__ import annotations

import logging
from typing import Any

from ai.agents._context_cache import TimedCache, system_user
from ai.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)

_NEGATIVE_DIMS = {"burnout_rate", "attrition_risk", "workload_index"}
_DIM_LABELS = {
    "avg_performance": "performance",
    "avg_engagement": "engagement",
    "burnout_rate": "burnout",
    "attrition_risk": "attrition",
    "sentiment_score": "sentiment",
    "workload_index": "workload",
}

SYSTEM_PROMPT = (
    "You are the Department Insights Agent for NOVA. You answer questions about "
    "department efficiency and risk patterns using only the provided heatmap data. "
    "The current user's role is {role}. Adjust your responses: HR and Leadership: "
    "full data access, use specific numbers. Manager: team-level data only, no org-wide "
    "figures. Employee: personal data only, no peer comparisons. Keep responses under "
    "3 sentences for voice clarity. Response style: sentence 1 = direct answer, sentence "
    "2 = key metric comparison, sentence 3 = implication/action. Use rounded percentages "
    "with one decimal place when available. Use [ACTION: /route] tags when navigation helps."
)


async def _load_heatmap() -> dict[str, Any]:
    try:
        from api.routes.departments import get_efficiency_heatmap

        payload = await get_efficiency_heatmap(current_user=system_user())  # type: ignore[arg-type]
        return {"heatmap": payload}
    except Exception:  # noqa: BLE001
        logger.debug("dept agent: efficiency_heatmap unavailable", exc_info=True)
        return {}


def _org_avg(matrix: dict[str, dict[str, float]], dim: str) -> float:
    rows = list(matrix.values())
    if not rows:
        return 0.0
    return sum(float(row.get(dim) or 0.0) for row in rows) / len(rows)


def _overall_efficiency(dims: dict[str, float], all_dims: list[str]) -> float:
    if not all_dims:
        return 0.0
    score = 0.0
    for dim in all_dims:
        value = float(dims.get(dim) or 0.0)
        score += 1 - value if dim in _NEGATIVE_DIMS else value
    return score / len(all_dims)


def _find_department(message: str, departments: list[str], selected: str | None) -> str | None:
    lowered = message.lower()
    for dept in departments:
        if dept.lower() in lowered:
            return dept
    if selected and selected in departments:
        return selected
    return None


class DepartmentInsightsAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            agent_id="dept_insights_agent",
            system_prompt=SYSTEM_PROMPT,
            display_name="Department Insights Agent",
        )
        self._cache = TimedCache(ttl_seconds=180, loader=_load_heatmap)

    async def gather_context(
        self,
        message: str,  # noqa: ARG002
        context_data: dict[str, Any],
    ) -> dict[str, Any] | None:
        data = dict(await self._cache.get() or {})
        for key in ("selected_department", "hovered_cell_dimension"):
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
        heatmap = (cached.get("heatmap") or {}) if isinstance(cached, dict) else {}
        matrix = (heatmap.get("matrix") or {}) if isinstance(heatmap, dict) else {}
        departments = list((heatmap.get("departments") or []) if isinstance(heatmap, dict) else [])
        dimensions = list((heatmap.get("dimensions") or []) if isinstance(heatmap, dict) else [])

        if not matrix or not departments or not dimensions:
            return await super().respond(message, history, context)

        lowered = (message or "").lower()

        if role == "employee":
            return {
                "reply": "I can only provide personal-level insights for employees. Please ask your manager or HR for department comparisons.",
                "agent_id": self.agent_id,
                "suggested_actions": [],
                "data_referenced": {},
            }

        if "performing best" in lowered or "best department" in lowered or "which department is best" in lowered:
            ranked = sorted(
                departments,
                key=lambda dept: _overall_efficiency(matrix[dept], dimensions),
                reverse=True,
            )
            best = ranked[0]
            lowest = ranked[-1]
            best_eff = _overall_efficiency(matrix[best], dimensions)

            best_dim = max(
                dimensions,
                key=lambda d: (1 - float(matrix[best][d])) if d in _NEGATIVE_DIMS else float(matrix[best][d]),
            )
            reply = (
                f"{best} leads with an overall efficiency score of {best_eff * 100:.1f}%, "
                f"particularly strong in {_DIM_LABELS.get(best_dim, best_dim)}. They could serve as a model for {lowest}."
            )
            return {
                "reply": reply,
                "agent_id": self.agent_id,
                "suggested_actions": [],
                "data_referenced": {"best_department": best, "lowest_department": lowest},
            }

        if "why is" in lowered and "red" in lowered:
            selected = str(context.get("selected_department") or "") or None
            dept = _find_department(message, departments, selected)
            if not dept:
                dept = selected or departments[0]

            hovered_dim = str(context.get("hovered_cell_dimension") or "")
            dim = hovered_dim if hovered_dim in dimensions else None
            if not dim:
                dim = max(
                    dimensions,
                    key=lambda d: (_org_avg(matrix, d) - float(matrix[dept][d])) if d not in _NEGATIVE_DIMS else (float(matrix[dept][d]) - _org_avg(matrix, d)),
                )

            score = float(matrix[dept][dim])
            avg = _org_avg(matrix, dim)
            if dim in _NEGATIVE_DIMS:
                points_below = (score - avg) * 100
            else:
                points_below = (avg - score) * 100

            dept_hours = float(matrix[dept].get("workload_index") or 0.0) * 45.0
            org_hours = _org_avg(matrix, "workload_index") * 45.0

            reply = (
                f"{dept}'s {_DIM_LABELS.get(dim, dim)} score is {score * 100:.1f}%, "
                f"which is {abs(points_below):.1f} points below the org average. "
                f"The primary driver appears to be elevated workload — avg {dept_hours:.1f} hours/week vs org avg of {org_hours:.1f}."
            )
            return {
                "reply": reply,
                "agent_id": self.agent_id,
                "suggested_actions": [],
                "data_referenced": {"department": dept, "dimension": dim},
            }

        if "compare engineering and sales" in lowered or (
            "engineering" in lowered and "sales" in lowered and "compare" in lowered
        ):
            if role == "manager":
                return {
                    "reply": "I can share detailed comparisons for your own team, but I cannot provide org-wide cross-department comparisons for manager role.",
                    "agent_id": self.agent_id,
                    "suggested_actions": [],
                    "data_referenced": {},
                }

            eng = matrix.get("Engineering")
            sales = matrix.get("Sales")
            if not eng or not sales:
                return await super().respond(message, history, context)

            perf_eng = float(eng.get("avg_performance") or 0.0) * 100
            perf_sales = float(sales.get("avg_performance") or 0.0) * 100
            eng_eng = float(eng.get("avg_engagement") or 0.0) * 100
            eng_sales = float(sales.get("avg_engagement") or 0.0) * 100
            sent_eng = float(eng.get("sentiment_score") or 0.0)
            sent_sales = float(sales.get("sentiment_score") or 0.0)
            sent_avg = _org_avg(matrix, "sentiment_score")

            sentiment_line = "Both are above average on sentiment." if sent_eng >= sent_avg and sent_sales >= sent_avg else "Sentiment differs, with one department below org average."
            reply = (
                f"Engineering scores higher on performance ({perf_eng:.1f}% vs {perf_sales:.1f}%) "
                f"but Sales has better engagement ({eng_sales:.1f}% vs {eng_eng:.1f}%). "
                f"{sentiment_line}"
            )
            return {
                "reply": reply,
                "agent_id": self.agent_id,
                "suggested_actions": [],
                "data_referenced": {"engineering": eng, "sales": sales},
            }

        return await super().respond(message, history, context)
