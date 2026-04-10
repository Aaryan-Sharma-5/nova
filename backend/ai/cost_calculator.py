"""Transparent cost and savings calculator for attrition and productivity impact."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class CostImpactInputs:
    """Inputs for attrition and productivity impact calculations.

    Attributes:
        at_risk_junior_employees: Count of at-risk junior employees.
        at_risk_senior_employees: Count of at-risk senior employees.
        avg_junior_salary: Average annual salary for junior cohort.
        avg_senior_salary: Average annual salary for senior cohort.
        predicted_retention_improvement_rate: Expected intervention retention uplift (0-1).
        baseline_output: Baseline annual output proxy per employee (revenue/value proxy).
        engagement_delta: Predicted engagement uplift after intervention (0-1).
        team_size: Team size used for productivity gain estimate.
    """

    at_risk_junior_employees: int = 10
    at_risk_senior_employees: int = 2
    avg_junior_salary: float = 700000.0
    avg_senior_salary: float = 1300000.0
    predicted_retention_improvement_rate: float = 0.65
    baseline_output: float = 900000.0
    engagement_delta: float = 0.07
    team_size: int = 120


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def calculate_cost_impact(inputs: CostImpactInputs) -> dict[str, Any]:
    """Calculate attrition cost, savings, productivity gain, and full formula breakdown."""
    junior_count = max(0, int(inputs.at_risk_junior_employees))
    senior_count = max(0, int(inputs.at_risk_senior_employees))
    junior_salary = max(0.0, float(inputs.avg_junior_salary))
    senior_salary = max(0.0, float(inputs.avg_senior_salary))
    retention_rate = _clamp(float(inputs.predicted_retention_improvement_rate), 0.0, 1.0)
    baseline_output = max(0.0, float(inputs.baseline_output))
    engagement_delta = _clamp(float(inputs.engagement_delta), 0.0, 1.0)
    team_size = max(0, int(inputs.team_size))

    junior_attrition_cost_per_employee = junior_salary * 0.5
    senior_attrition_cost_per_employee = senior_salary * 1.5

    junior_attrition_cost_total = junior_attrition_cost_per_employee * junior_count
    senior_attrition_cost_total = senior_attrition_cost_per_employee * senior_count

    total_attrition_cost = junior_attrition_cost_total + senior_attrition_cost_total
    savings = total_attrition_cost * retention_rate
    productivity_gain = baseline_output * engagement_delta * team_size

    total_at_risk = junior_count + senior_count
    weighted_avg_salary = (
        ((junior_salary * junior_count) + (senior_salary * senior_count)) / total_at_risk
        if total_at_risk > 0
        else 0.0
    )

    plain_english = (
        f"Based on {total_at_risk} at-risk employees at avg ₹{weighted_avg_salary/100000:.1f}L salary, "
        f"early intervention saves an estimated ₹{savings/100000:.1f}L in rehiring costs"
    )

    return {
        "figures": {
            "junior_attrition_cost_per_employee": round(junior_attrition_cost_per_employee, 2),
            "senior_attrition_cost_per_employee": round(senior_attrition_cost_per_employee, 2),
            "total_attrition_cost": round(total_attrition_cost, 2),
            "projected_savings": round(savings, 2),
            "productivity_gain": round(productivity_gain, 2),
            "net_impact": round(savings + productivity_gain, 2),
            "weighted_avg_salary": round(weighted_avg_salary, 2),
            "total_at_risk_employees": total_at_risk,
        },
        "plain_english": plain_english,
        "calculation_breakdown": {
            "inputs": {
                "at_risk_junior_employees": junior_count,
                "at_risk_senior_employees": senior_count,
                "avg_junior_salary": junior_salary,
                "avg_senior_salary": senior_salary,
                "predicted_retention_improvement_rate": retention_rate,
                "baseline_output": baseline_output,
                "engagement_delta": engagement_delta,
                "team_size": team_size,
            },
            "steps": [
                {
                    "name": "junior_attrition_cost_per_employee",
                    "formula": "avg_junior_salary * 0.5",
                    "result": round(junior_attrition_cost_per_employee, 2),
                },
                {
                    "name": "senior_attrition_cost_per_employee",
                    "formula": "avg_senior_salary * 1.5",
                    "result": round(senior_attrition_cost_per_employee, 2),
                },
                {
                    "name": "total_attrition_cost",
                    "formula": "(junior_attrition_cost_per_employee * at_risk_junior_employees) + (senior_attrition_cost_per_employee * at_risk_senior_employees)",
                    "result": round(total_attrition_cost, 2),
                },
                {
                    "name": "projected_savings",
                    "formula": "total_attrition_cost * predicted_retention_improvement_rate",
                    "result": round(savings, 2),
                },
                {
                    "name": "productivity_gain",
                    "formula": "baseline_output * engagement_delta * team_size",
                    "result": round(productivity_gain, 2),
                },
            ],
        },
    }


def build_intervention_impacts(cost_impact: dict[str, Any]) -> list[dict[str, Any]]:
    """Create intervention-level cost/savings cards that inherit the same explainable model."""
    total_savings = float(cost_impact["figures"]["projected_savings"])
    total_attrition_cost = float(cost_impact["figures"]["total_attrition_cost"])

    templates = [
        ("Compensation Review Program", "23 employees below market rate", 0.24),
        ("Manager Leadership Training", "5 managers with low team scores", 0.14),
        ("Workload Rebalancing Initiative", "Engineering & Sales teams", 0.27),
        ("Career Development Program", "45 employees due for advancement", 0.22),
        ("Enhanced Recognition System", "Organization-wide", 0.13),
    ]

    impacts: list[dict[str, Any]] = []
    for intervention, target_group, share in templates:
        savings = total_savings * share
        estimated_cost = max(1.0, (total_attrition_cost * share) * 0.38)
        roi = ((savings - estimated_cost) / estimated_cost) * 100.0

        impacts.append(
            {
                "intervention": intervention,
                "target_group": target_group,
                "estimated_cost": round(estimated_cost, 2),
                "projected_savings": round(savings, 2),
                "roi_percent": round(roi, 1),
                "plain_english": (
                    f"{intervention}: expected savings ₹{savings/100000:.1f}L for {target_group}, "
                    f"using the same attrition-cost and retention-uplift assumptions."
                ),
                "calculation_breakdown": {
                    "formula": "intervention_share * portfolio_totals",
                    "inputs": {
                        "intervention_share": share,
                        "portfolio_total_savings": total_savings,
                        "portfolio_total_attrition_cost": total_attrition_cost,
                        "cost_multiplier": 0.38,
                    },
                    "steps": [
                        {
                            "name": "projected_savings",
                            "formula": "portfolio_total_savings * intervention_share",
                            "result": round(savings, 2),
                        },
                        {
                            "name": "estimated_cost",
                            "formula": "portfolio_total_attrition_cost * intervention_share * 0.38",
                            "result": round(estimated_cost, 2),
                        },
                        {
                            "name": "roi_percent",
                            "formula": "((projected_savings - estimated_cost) / estimated_cost) * 100",
                            "result": round(roi, 1),
                        },
                    ],
                },
            }
        )

    return impacts
