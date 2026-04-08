"""Intervention recommendation API endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ai.anomaly_detector import (
    composite_anomaly_check,
    detect_communication_drop,
    detect_engagement_drop,
    detect_performance_decline,
    detect_sentiment_crash,
)
from ai.intervention_engine import (
    InterventionRequest,
    InterventionResponse,
    get_interventions,
)
from api.deps import require_role
from models.user import User, UserRole

router = APIRouter()


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
