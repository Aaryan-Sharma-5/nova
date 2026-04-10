from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query

from ai.groq_client import groq_chat
from api.deps import require_role
from models.user import User, UserRole

router = APIRouter(prefix="/api/reports", tags=["Reports"])


async def _build_executive_summary(payload: dict[str, Any]) -> str:
    prompt = (
        "Write a 150-word executive summary for an HR org health report. "
        "Be concise, business-friendly, and action-oriented."
    )
    user_payload = (
        f"Overall score: {payload['overall_workforce_health_score']}. "
        f"Top risks: {payload['top_at_risk_employees']}. "
        f"Intervention success rate: {payload['intervention_success_rate']}%. "
        f"Key deltas: {payload['key_metrics_vs_last_month']}"
    )
    try:
        response = await groq_chat(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_payload},
            ],
            max_tokens=260,
            temperature=0.2,
        )
        content = response.choices[0].message.content if response and response.choices else ""
        if content and content.strip():
            return content.strip()
    except Exception:
        pass

    return (
        "Workforce health remains stable with focused risk pockets. Attrition and burnout pressures are concentrated in a "
        "small set of teams, while engagement trends remain resilient overall. The current intervention portfolio is producing "
        "measurable impact, especially where managers are acting quickly on early warning signals. Priority actions for the next "
        "cycle include targeted retention plans for high-risk employees, stronger workload normalization in pressured departments, "
        "and consistent manager follow-through on one-on-ones. If current trends continue and interventions remain timely, the "
        "organization should improve both retention outcomes and productivity confidence over the next reporting window."
    )


@router.get("/org-health")
async def get_org_health_report(
    format: str = Query("pdf"),
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    data = {
        "report_date": date.today().isoformat(),
        "format": format,
        "overall_workforce_health_score": 76,
        "top_at_risk_employees": [
            {"employee": "Employee A", "risk_score": 87, "department": "Sales"},
            {"employee": "Employee B", "risk_score": 82, "department": "Engineering"},
            {"employee": "Employee C", "risk_score": 79, "department": "Marketing"},
        ],
        "department_burnout_heatmap": [
            {"department": "Engineering", "burnout": 58},
            {"department": "Sales", "burnout": 72},
            {"department": "Marketing", "burnout": 54},
            {"department": "Operations", "burnout": 48},
        ],
        "intervention_success_rate": 61,
        "key_metrics_vs_last_month": {
            "attrition_rate_delta_pct": -1.3,
            "engagement_delta_pct": 2.4,
            "burnout_delta_pct": -0.9,
            "absenteeism_delta_pct": 0.7,
        },
    }
    data["executive_summary"] = await _build_executive_summary(data)
    return data
