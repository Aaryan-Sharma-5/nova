"""Single registry for all NOVA voice agents.

Specialized agents (workforce overview, employee intelligence, appraisal,
feedback, dept insights, org structure) are added in later milestones and
registered by importing them below.
"""

from __future__ import annotations

from ai.agents.appraisal_agent import AppraisalAgent
from ai.agents.base_agent import BaseAgent
from ai.agents.employee_agent import EmployeeAgent
from ai.agents.feedback_agent import FeedbackAgent
from ai.agents.general_agent import GeneralNovaAgent
from ai.agents.workforce_overview_agent import WorkforceOverviewAgent


PAGE_TO_AGENT: dict[str, str] = {
    "/org-health": "workforce_overview_agent",
    "/dashboard": "workforce_overview_agent",
    "/employees": "employee_intelligence_agent",
    "/hr/appraisals": "appraisal_agent",
    "/hr/feedback-analyzer": "feedback_agent",
    "/departments/heatmap": "dept_insights_agent",
    "/employees/org-tree": "org_structure_agent",
}

FALLBACK_AGENT_ID = "general_nova_agent"


def _build_registry() -> dict[str, BaseAgent]:
    registry: dict[str, BaseAgent] = {}
    registry[FALLBACK_AGENT_ID] = GeneralNovaAgent()
    registry["workforce_overview_agent"] = WorkforceOverviewAgent()
    registry["employee_intelligence_agent"] = EmployeeAgent()
    registry["appraisal_agent"] = AppraisalAgent()
    registry["feedback_agent"] = FeedbackAgent()
    return registry


_REGISTRY: dict[str, BaseAgent] = _build_registry()


def resolve_agent_id(agent_id: str | None, current_page: str | None) -> str:
    if agent_id and agent_id != "auto" and agent_id in _REGISTRY:
        return agent_id
    if current_page:
        mapped = PAGE_TO_AGENT.get(current_page)
        if mapped and mapped in _REGISTRY:
            return mapped
    return FALLBACK_AGENT_ID


def get_agent(agent_id: str) -> BaseAgent:
    return _REGISTRY.get(agent_id) or _REGISTRY[FALLBACK_AGENT_ID]


def list_agents() -> list[dict[str, str]]:
    return [
        {"agent_id": agent.agent_id, "display_name": agent.display_name}
        for agent in _REGISTRY.values()
    ]
