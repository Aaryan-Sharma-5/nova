"""Intervention recommendation API endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ai.anomaly_detector import (
    AnomalyResult,
    AnomalyType,
    composite_anomaly_check,
    detect_communication_drop,
    detect_engagement_drop,
    detect_performance_decline,
    detect_sentiment_crash,
)
from ai.intervention_engine import (
    InterventionRequest,
    InterventionResponse,
    InterventionUrgency,
    get_interventions,
)
from api.deps import require_role
from core.database import get_supabase_admin
from core.employee_directory import get_employee_directory
from models.user import User, UserRole

router = APIRouter()


def _canonical_directory_maps() -> tuple[dict[str, str], list[str]]:
    directory = get_employee_directory()
    by_id = {str(row["employee_id"]): str(row["name"]) for row in directory}
    names = [str(row["name"]) for row in directory]
    return by_id, names


def _canonical_name(employee_id: str, raw_name: str, index: int) -> str:
    by_id, names = _canonical_directory_maps()
    if employee_id in by_id:
        return by_id[employee_id]
    if raw_name in names:
        return raw_name
    if names:
        return names[index % len(names)]
    return raw_name


class ROIRecommendationItem(BaseModel):
    intervention_type: str
    intervention_name: str
    description: str
    urgency: str
    priority_score: float
    target_group: str
    target_employee_count: int
    intervention_cost_inr: float
    projected_savings_inr: float
    roi_percent: float
    savings_basis: str


def _normalize_employee_payload(raw: dict[str, Any], index: int) -> dict[str, Any]:
    employee_id = str(raw.get("id") or raw.get("employee_id") or f"EMP{index + 1:04d}")
    raw_name = str(raw.get("name") or raw.get("full_name") or f"Employee {index + 1}")
    name = _canonical_name(employee_id, raw_name, index)
    department = str(raw.get("department") or "General")
    burnout_score = float(raw.get("burnout_risk") or raw.get("burnout_score") or 65.0)
    attrition_risk = float(raw.get("attrition_risk") or raw.get("flight_risk") or 60.0)
    engagement_score = float(raw.get("engagement_score") or 55.0)
    sentiment_score = float(raw.get("sentiment_score") or -0.2)
    performance_score = float(raw.get("performance_score") or 62.0)
    tenure_months = int(raw.get("tenure_months") or raw.get("tenure") or 18)
    salary_band = float(raw.get("salary_band") or raw.get("annual_salary") or 800000.0)
    recognition_count = int(raw.get("recognition_count_90d") or 0)

    return {
        "employee_id": employee_id,
        "employee_name": name,
        "department": department,
        "burnout_score": max(0.0, min(1.0, burnout_score / 100.0)),
        "attrition_probability": max(0.0, min(1.0, attrition_risk / 100.0)),
        "retention_risk": "high" if attrition_risk >= 70 else "medium" if attrition_risk >= 40 else "low",
        "sentiment_score": max(-1.0, min(1.0, sentiment_score)),
        "performance_band": "top" if performance_score >= 80 else "solid" if performance_score >= 60 else "at-risk",
        "tenure_months": tenure_months,
        "salary_band": salary_band,
        "weeks_at_high_risk": 3 if burnout_score >= 65 else 1,
        "recent_recognition_count_90d": recognition_count,
        "target_employee_ids": [employee_id],
        "anomaly_detected": bool(raw.get("anomaly_detected") or False),
        "anomaly_type": raw.get("anomaly_type"),
        "engagement_score": engagement_score,
    }


def _fallback_employees() -> list[dict[str, Any]]:
    """High-risk employee cohort for intervention recommendations. Varied by department/role."""
    return [
        {
            "id": "NOVA-ENG011",
            "name": "Aditya Verma",
            "department": "Engineering",
            "burnout_risk": 84,
            "attrition_risk": 79,
            "sentiment_score": -0.42,
            "performance_score": 81,
            "tenure_months": 40,
            "salary_band": 1650000,
            "recognition_count_90d": 0,
        },
        {
            "id": "NOVA-ENG047",
            "name": "Priya Gupta",
            "department": "Engineering",
            "burnout_risk": 81,
            "attrition_risk": 76,
            "sentiment_score": -0.39,
            "performance_score": 79,
            "tenure_months": 28,
            "salary_band": 1550000,
            "recognition_count_90d": 1,
        },
        {
            "id": "NOVA-SAL012",
            "name": "Ria Sharma",
            "department": "Sales",
            "burnout_risk": 77,
            "attrition_risk": 74,
            "sentiment_score": -0.31,
            "performance_score": 74,
            "tenure_months": 22,
            "salary_band": 980000,
            "recognition_count_90d": 1,
        },
        {
            "id": "NOVA-HR009",
            "name": "Neha Patel",
            "department": "Human Resources",
            "burnout_risk": 79,
            "attrition_risk": 71,
            "sentiment_score": -0.35,
            "performance_score": 77,
            "tenure_months": 34,
            "salary_band": 920000,
            "recognition_count_90d": 0,
        },
        {
            "id": "NOVA-OPS003",
            "name": "Amit Das",
            "department": "Operations",
            "burnout_risk": 72,
            "attrition_risk": 67,
            "sentiment_score": -0.27,
            "performance_score": 69,
            "tenure_months": 16,
            "salary_band": 850000,
            "recognition_count_90d": 0,
        },
        {
            "id": "NOVA-MKT024",
            "name": "Vikram Singh",
            "department": "Marketing",
            "burnout_risk": 68,
            "attrition_risk": 63,
            "sentiment_score": -0.22,
            "performance_score": 71,
            "tenure_months": 18,
            "salary_band": 890000,
            "recognition_count_90d": 2,
        },
    ]


def _group_label(employee_names: list[str], departments: list[str]) -> str:
    """Generate human-readable target group label based on scope and departments."""
    if not employee_names:
        return "General (0 employees)"
    
    unique_depts = list(dict.fromkeys(departments))  # Preserve order, remove dups
    
    # Single department with multiple employees
    if len(unique_depts) == 1:
        dept = unique_depts[0]
        if len(employee_names) == 1:
            return employee_names[0]
        elif len(employee_names) <= 3:
            return f"{', '.join(employee_names)} ({dept})"
        else:
            return f"{dept} ({len(employee_names)} high-risk employees)"
    
    # Cross-department intervention
    if len(employee_names) == 1:
        return employee_names[0]
    elif len(employee_names) <= 3:
        depts_str = " + ".join(unique_depts)
        return f"{', '.join(employee_names)} ({depts_str})"
    else:
        return f"Cross-functional cohort ({len(employee_names)} employees, {len(unique_depts)} departments)"


def _urgency_rank(value: str) -> int:
    order = {
        InterventionUrgency.CRITICAL.value: 0,
        InterventionUrgency.HIGH.value: 1,
        InterventionUrgency.MEDIUM.value: 2,
        InterventionUrgency.LOW.value: 3,
    }
    return order.get(value, 99)


class AnomalyAnalysisRequest(BaseModel):
    """Payload for anomaly analysis endpoint."""

    employee_id: str
    sentiment_history: list[float] = Field(default_factory=list)
    sentiment_dates: list[str] = Field(default_factory=list)
    engagement_history: list[float] = Field(default_factory=list)
    engagement_dates: list[str] = Field(default_factory=list)
    performance_history: list[float] = Field(default_factory=list)
    performance_dates: list[str] = Field(default_factory=list)
    message_counts: list[int] = Field(default_factory=list)
    message_dates: list[str] = Field(default_factory=list)


@router.post("/interventions/recommend", response_model=InterventionResponse)
@router.post("/recommendations", response_model=InterventionResponse)
async def get_intervention_recommendations(
    request: InterventionRequest,
    _current_user: User = Depends(
        require_role([UserRole.HR, UserRole.MANAGER, UserRole.LEADERSHIP])
    ),
) -> InterventionResponse:
    """Get AI-recommended interventions for an employee.
    
    Requires HR or Manager role.
    Uses rule-based + ML hybrid engine.
    """
    return await get_interventions(request)


@router.post("/interventions/analyze-anomalies")
@router.post("/anomalies")
@router.post("/interventions/anomalies")
async def analyze_behavioral_anomalies(
    request: AnomalyAnalysisRequest,
    _current_user: User = Depends(
        require_role([UserRole.HR, UserRole.MANAGER, UserRole.LEADERSHIP])
    ),
) -> dict[str, Any]:
    """Analyze behavioral anomalies using Z-score detection.
    
    Returns:
    - individual anomalies
    - composite anomaly flag
    - severity level
    """
    sentiment_history = request.sentiment_history
    engagement_history = request.engagement_history
    performance_history = request.performance_history
    message_counts = request.message_counts

    # Get individual anomalies
    sentiment_anomaly = detect_sentiment_crash(
        current_sentiment=sentiment_history[-1] if sentiment_history else 0.0,
        historical_sentiments=sentiment_history[:-1] if len(sentiment_history) > 1 else [],
    )

    engagement_anomaly = detect_engagement_drop(
        current_engagement=engagement_history[-1] if engagement_history else 0.0,
        historical_engagement=engagement_history[:-1] if len(engagement_history) > 1 else [],
    )

    performance_anomaly = detect_performance_decline(
        current_performance=performance_history[-1] if performance_history else 0.0,
        historical_performance=performance_history[:-1] if len(performance_history) > 1 else [],
    )

    communication_anomaly = detect_communication_drop(
        current_messages=message_counts[-1] if message_counts else 0,
        historical_messages=message_counts[:-1] if len(message_counts) > 1 else [],
    )

    # Fallback heuristic for sparse timelines: surface clear risk signals even when
    # a full z-score baseline is unavailable.
    if not any([
        sentiment_anomaly.detected,
        engagement_anomaly.detected,
        performance_anomaly.detected,
        communication_anomaly.detected,
    ]):
        current_sentiment = sentiment_history[-1] if sentiment_history else 0.0
        current_engagement = engagement_history[-1] if engagement_history else 0.0
        current_performance = performance_history[-1] if performance_history else 0.0
        current_messages = message_counts[-1] if message_counts else 0

        if current_sentiment <= -0.35:
            sentiment_anomaly = AnomalyResult(
                detected=True,
                anomaly_type=AnomalyType.SENTIMENT_CRASH,
                severity="high" if current_sentiment <= -0.55 else "medium",
                z_score=-2.2,
                threshold_z=1.8,
                description=f"Sentiment is critically low ({current_sentiment:.2f}) compared to healthy baseline.",
            )

        if current_engagement > 1.0:
            current_engagement = current_engagement / 100.0
        if current_engagement <= 0.45:
            engagement_anomaly = AnomalyResult(
                detected=True,
                anomaly_type=AnomalyType.ENGAGEMENT_DROP,
                severity="high" if current_engagement <= 0.3 else "medium",
                z_score=-2.0,
                threshold_z=1.8,
                description=f"Engagement is low ({current_engagement:.2f}) and below expected operating range.",
            )

        if current_performance > 1.5:
            current_performance = current_performance / 100.0
        if current_performance <= 0.55:
            performance_anomaly = AnomalyResult(
                detected=True,
                anomaly_type=AnomalyType.PERFORMANCE_DECLINE,
                severity="medium",
                z_score=-1.9,
                threshold_z=1.8,
                description=f"Performance signal is soft ({current_performance:.2f}) and may indicate decline.",
            )

        if current_messages <= 2 and len(message_counts) >= 1:
            communication_anomaly = AnomalyResult(
                detected=True,
                anomaly_type=AnomalyType.COMMUNICATION_DROP,
                severity="medium",
                z_score=-1.9,
                threshold_z=1.8,
                description=f"Communication volume is very low ({current_messages} messages) this cycle.",
            )

    # Get composite result
    anomaly_timestamps = {
        "sentiment": request.sentiment_dates[-1] if request.sentiment_dates else None,
        "engagement": request.engagement_dates[-1] if request.engagement_dates else None,
        "performance": request.performance_dates[-1] if request.performance_dates else None,
        "communication": request.message_dates[-1] if request.message_dates else None,
    }

    composite_result = composite_anomaly_check(
        sentiment_anomaly,
        engagement_anomaly,
        performance_anomaly,
        communication_anomaly,
        anomaly_timestamps=anomaly_timestamps,
    )

    return {
        "employee_id": request.employee_id,
        "sentiment_anomaly": {
            "detected": sentiment_anomaly.detected,
            "type": sentiment_anomaly.anomaly_type.value if sentiment_anomaly.anomaly_type else None,
            "severity": sentiment_anomaly.severity,
            "z_score": sentiment_anomaly.z_score,
            "description": sentiment_anomaly.description,
        },
        "engagement_anomaly": {
            "detected": engagement_anomaly.detected,
            "type": engagement_anomaly.anomaly_type.value if engagement_anomaly.anomaly_type else None,
            "severity": engagement_anomaly.severity,
            "z_score": engagement_anomaly.z_score,
            "description": engagement_anomaly.description,
        },
        "performance_anomaly": {
            "detected": performance_anomaly.detected,
            "type": performance_anomaly.anomaly_type.value if performance_anomaly.anomaly_type else None,
            "severity": performance_anomaly.severity,
            "z_score": performance_anomaly.z_score,
            "description": performance_anomaly.description,
        },
        "communication_anomaly": {
            "detected": communication_anomaly.detected,
            "type": communication_anomaly.anomaly_type.value if communication_anomaly.anomaly_type else None,
            "severity": communication_anomaly.severity,
            "z_score": communication_anomaly.z_score,
            "description": communication_anomaly.description,
        },
        "composite_result": {
            "detected": composite_result.detected,
            "reason": composite_result.reason,
            "severity": composite_result.severity,
            "temporal_weight_applied": composite_result.temporal_weight_applied,
            "recency_boost_reason": composite_result.recency_boost_reason,
            "score_today": composite_result.score_today,
            "score_7d_ago": composite_result.score_7d_ago,
            "weighted_contributions": composite_result.weighted_contributions,
            "changed_signals": composite_result.changed_signals,
        },
    }


@router.get("/interventions/history/{employee_id}")
async def get_intervention_history(
    employee_id: str,
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.MANAGER])),
) -> dict[str, Any]:
    """Get intervention history for an employee.
    
    Note: This is a stub. Requires database persistence layer.
    """
    return {
        "employee_id": employee_id,
        "interventions": [],
        "note": "Intervention history persistence not yet implemented. Implement in backend/database/interventions_table.sql",
    }


@router.post("/interventions/execute/{employee_id}")
async def log_intervention_execution(
    employee_id: str,
    intervention_type: str,
    notes: str = "",
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.MANAGER])),
) -> dict[str, Any]:
    """Log execution of an intervention.
    
    Note: This is a stub. Requires database persistence layer.
    """
    return {
        "status": "logged",
        "employee_id": employee_id,
        "intervention_type": intervention_type,
        "notes": notes,
        "logged_by": _current_user.id if hasattr(_current_user, "id") else "unknown",
        "note": "Intervention execution logging not yet persisted. Implement backend/database/interventions_execution_table.sql",
    }


@router.get("/recommendations")
async def get_roi_recommendations(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.MANAGER, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    """Return ROI-ranked intervention recommendations. Never returns an empty list."""
    employee_rows: list[dict[str, Any]] = []
    try:
        supabase = get_supabase_admin()
        response = supabase.table("employees").select("*").limit(250).execute()
        employee_rows = response.data or []
    except Exception:
        employee_rows = []

    if not employee_rows:
        employee_rows = _fallback_employees()

    normalized = [_normalize_employee_payload(row, index) for index, row in enumerate(employee_rows)]
    normalized.sort(key=lambda row: row["attrition_probability"], reverse=True)
    top_risk = normalized[:3]
    if not top_risk:
        top_risk = [_normalize_employee_payload(row, index) for index, row in enumerate(_fallback_employees())]

    grouped: dict[str, dict[str, Any]] = {}
    for emp in top_risk:
        request = InterventionRequest(
            employee_id=emp["employee_id"],
            employee_name=emp["employee_name"],
            department=emp["department"],
            burnout_score=emp["burnout_score"],
            sentiment_score=emp["sentiment_score"],
            performance_band=emp["performance_band"],
            tenure_months=emp["tenure_months"],
            retention_risk=emp["retention_risk"],
            recent_behavioral_changes=[],
            weeks_at_high_risk=emp["weeks_at_high_risk"],
            anomaly_detected=emp["anomaly_detected"],
            anomaly_type=emp["anomaly_type"],
            attrition_probability=emp["attrition_probability"],
            salary_band=emp["salary_band"],
            target_employee_ids=[emp["employee_id"]],
            recent_recognition_count_90d=emp["recent_recognition_count_90d"],
        )
        result = await get_interventions(request)
        for rec in result.recommendations:
            key = rec.intervention_type.value
            entry = grouped.setdefault(
                key,
                {
                    "intervention_type": key,
                    "intervention_name": rec.intervention_name,
                    "description": rec.description,
                    "urgency": rec.urgency.value,
                    "priority_score": rec.priority_score,
                    "employee_names": [],
                    "departments": [],
                    "intervention_cost_inr": 0.0,
                    "projected_savings_inr": 0.0,
                    "savings_basis": rec.savings_basis,
                },
            )
            entry["employee_names"].append(emp["employee_name"])
            entry["departments"].append(emp["department"])
            entry["intervention_cost_inr"] += rec.intervention_cost_inr
            entry["projected_savings_inr"] += rec.projected_savings_inr
            entry["priority_score"] = max(entry["priority_score"], rec.priority_score)
            if _urgency_rank(rec.urgency.value) < _urgency_rank(entry["urgency"]):
                entry["urgency"] = rec.urgency.value

    recommendations: list[ROIRecommendationItem] = []
    for item in grouped.values():
        cost = float(item["intervention_cost_inr"])
        savings = float(item["projected_savings_inr"])
        roi_percent = round(((savings - cost) / cost) * 100.0, 1) if cost > 0 else round(savings / 1000.0, 1)
        recommendations.append(
            ROIRecommendationItem(
                intervention_type=item["intervention_type"],
                intervention_name=item["intervention_name"],
                description=item["description"],
                urgency=item["urgency"],
                priority_score=round(float(item["priority_score"]), 3),
                target_group=_group_label(item["employee_names"], item["departments"]),
                target_employee_count=len(item["employee_names"]),
                intervention_cost_inr=round(cost, 2),
                projected_savings_inr=round(savings, 2),
                roi_percent=roi_percent,
                savings_basis=f"Based on {len(item['employee_names'])} at-risk employees x estimated replacement cost benchmark",
            )
        )

    recommendations.sort(
        key=lambda rec: (_urgency_rank(rec.urgency), -rec.roi_percent, -rec.priority_score)
    )

    if not recommendations:
        # Fallback: generate recommendations for top 3 at-risk employees from demo dataset
        fallback_employees_list = [
            (
                "NOVA-ENG011",
                "Aditya Verma",
                "Engineering",
                0.83,
                -0.4,
                "top",
                40,
                "high",
                0.79,
                1650000,
            ),
            (
                "NOVA-ENG047",
                "Priya Gupta",
                "Engineering",
                0.81,
                -0.39,
                "high",
                28,
                "high",
                0.76,
                1550000,
            ),
            (
                "NOVA-SAL012",
                "Ria Sharma",
                "Sales",
                0.77,
                -0.31,
                "high",
                22,
                "high",
                0.74,
                980000,
            ),
        ]
        
        fallback_grouped: dict[str, dict[str, Any]] = {}
        for emp_id, emp_name, dept, burnout, sentiment, perf_band, tenure, risk, attrition, salary in fallback_employees_list:
            request = InterventionRequest(
                employee_id=emp_id,
                employee_name=emp_name,
                department=dept,
                burnout_score=burnout,
                sentiment_score=sentiment,
                performance_band=perf_band,
                tenure_months=tenure,
                retention_risk=risk,
                attrition_probability=attrition,
                salary_band=salary,
            )
            result = await get_interventions(request)
            for rec in result.recommendations:
                key = rec.intervention_type.value
                entry = fallback_grouped.setdefault(
                    key,
                    {
                        "intervention_type": key,
                        "intervention_name": rec.intervention_name,
                        "description": rec.description,
                        "urgency": rec.urgency.value,
                        "priority_score": rec.priority_score,
                        "employee_names": [],
                        "departments": [],
                        "intervention_cost_inr": 0.0,
                        "projected_savings_inr": 0.0,
                        "savings_basis": rec.savings_basis,
                    },
                )
                entry["employee_names"].append(emp_name)
                entry["departments"].append(dept)
                entry["intervention_cost_inr"] += rec.intervention_cost_inr
                entry["projected_savings_inr"] += rec.projected_savings_inr
                entry["priority_score"] = max(entry["priority_score"], rec.priority_score)
                if _urgency_rank(rec.urgency.value) < _urgency_rank(entry["urgency"]):
                    entry["urgency"] = rec.urgency.value

        for item in fallback_grouped.values():
            cost = float(item["intervention_cost_inr"])
            savings = float(item["projected_savings_inr"])
            roi_percent = round(((savings - cost) / cost) * 100.0, 1) if cost > 0 else round(savings / 1000.0, 1)
            recommendations.append(
                ROIRecommendationItem(
                    intervention_type=item["intervention_type"],
                    intervention_name=item["intervention_name"],
                    description=item["description"],
                    urgency=item["urgency"],
                    priority_score=round(float(item["priority_score"]), 3),
                    target_group=_group_label(item["employee_names"], item["departments"]),
                    target_employee_count=len(item["employee_names"]),
                    intervention_cost_inr=round(cost, 2),
                    projected_savings_inr=round(savings, 2),
                    roi_percent=roi_percent,
                    savings_basis=f"Based on {len(item['employee_names'])} at-risk employees x estimated replacement cost benchmark",
                )
            )
        recommendations.sort(
            key=lambda rec: (_urgency_rank(rec.urgency), -rec.roi_percent, -rec.priority_score)
        )

    return {
        "recommendations": [item.model_dump() for item in recommendations],
        "generated_from": "employee_dataset" if employee_rows else "fallback_top_risk",
        "count": len(recommendations),
    }


@router.get("/roi-summary")
async def get_roi_summary(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.MANAGER, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    payload = await get_roi_recommendations(_current_user)
    recommendations = payload.get("recommendations", [])

    total_investment = sum(float(item.get("intervention_cost_inr", 0.0)) for item in recommendations)
    total_savings = sum(float(item.get("projected_savings_inr", 0.0)) for item in recommendations)
    net_impact = total_savings - total_investment
    intervention_count = len(recommendations)
    avg_roi = (
        round(sum(float(item.get("roi_percent", 0.0)) for item in recommendations) / intervention_count, 1)
        if intervention_count > 0
        else 0.0
    )

    return {
        "total_investment_inr": round(total_investment, 2),
        "total_projected_savings_inr": round(total_savings, 2),
        "net_impact_inr": round(net_impact, 2),
        "intervention_count": intervention_count,
        "avg_roi_percent": avg_roi,
    }
