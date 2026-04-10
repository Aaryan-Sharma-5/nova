"""Insights endpoints for explainable business-impact calculations."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ai.cost_calculator import CostImpactInputs, build_intervention_impacts, calculate_cost_impact
from api.deps import require_role
from models.user import User, UserRole

router = APIRouter(prefix="/api/insights", tags=["Insights"])


@router.get("/cost-impact")
async def get_cost_impact(
    at_risk_junior_employees: int = Query(10, ge=0, le=100000),
    at_risk_senior_employees: int = Query(2, ge=0, le=100000),
    avg_junior_salary: float = Query(700000.0, ge=0),
    avg_senior_salary: float = Query(1300000.0, ge=0),
    predicted_retention_improvement_rate: float = Query(0.65, ge=0.0, le=1.0),
    baseline_output: float = Query(900000.0, ge=0),
    engagement_delta: float = Query(0.07, ge=0.0, le=1.0),
    team_size: int = Query(120, ge=0, le=100000),
    _current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    """Return transparent attrition-cost, savings, productivity, and methodology breakdowns."""
    inputs = CostImpactInputs(
        at_risk_junior_employees=at_risk_junior_employees,
        at_risk_senior_employees=at_risk_senior_employees,
        avg_junior_salary=avg_junior_salary,
        avg_senior_salary=avg_senior_salary,
        predicted_retention_improvement_rate=predicted_retention_improvement_rate,
        baseline_output=baseline_output,
        engagement_delta=engagement_delta,
        team_size=team_size,
    )

    cost_impact = calculate_cost_impact(inputs)
    intervention_impacts = build_intervention_impacts(cost_impact)

    return {
        **cost_impact,
        "intervention_impacts": intervention_impacts,
        "methodology": {
            "assumptions": [
                "Junior attrition replacement cost = salary × 0.5",
                "Senior attrition replacement cost = salary × 1.5",
                "Savings = attrition_cost × predicted_retention_improvement_rate",
                "Productivity gain = baseline_output × engagement_delta × team_size",
                "All figures are directional planning estimates and should be calibrated with org-specific finance data",
            ],
            "currency": "INR",
            "version": "1.0",
        },
    }
