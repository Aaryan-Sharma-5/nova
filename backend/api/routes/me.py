"""Authenticated self-service employee endpoints."""

from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.deps import require_role
from core.database import get_supabase_admin
from models.user import User, UserRole

router = APIRouter(prefix="/api/me", tags=["Personal Data"])


class FeedbackRequest(BaseModel):
    category: str = Field(..., min_length=2, max_length=50)
    message: str = Field(..., min_length=5, max_length=2000)


def _deterministic_unit(seed: str, salt: str) -> float:
    digest = hashlib.sha256(f"{seed}:{salt}".encode("utf-8")).hexdigest()
    value = int(digest[:8], 16)
    return value / float(0xFFFFFFFF)


def _category_from_score(value: float) -> str:
    if value < 0.33:
        return "Low"
    if value < 0.66:
        return "Medium"
    return "High"


def _sentiment_trend_label(sentiment_score: float) -> str:
    if sentiment_score > 0.2:
        return "Improving"
    if sentiment_score < -0.2:
        return "Declining"
    return "Stable"


def _fetch_self_metrics(user_email: str) -> dict:
    """Best-effort fetch from Supabase metrics tables with deterministic fallback."""
    supabase = get_supabase_admin()

    candidate_tables = [
        "employee_feature_store",
        "employee_features",
        "employee_metrics",
        "employee_signals",
    ]

    row = None
    source = None
    for table_name in candidate_tables:
        try:
            response = (
                supabase.table(table_name)
                .select("*")
                .eq("employee_id", user_email)
                .limit(1)
                .execute()
            )
            rows = response.data or []
            if rows:
                row = rows[0]
                source = f"supabase:{table_name}"
                break
        except Exception:
            continue

    if not row:
        engagement = 0.35 + _deterministic_unit(user_email, "engagement") * 0.55
        burnout = 0.3 + _deterministic_unit(user_email, "burnout") * 0.5
        sentiment = -0.3 + _deterministic_unit(user_email, "sentiment") * 0.9
        return {
            "engagement_score": engagement,
            "burnout_score": burnout,
            "sentiment_score": sentiment,
            "source": "deterministic_fallback",
        }

    def _safe(value: object, default: float) -> float:
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                return default
        return default

    return {
        "engagement_score": _safe(row.get("engagement_score", row.get("engagement", 0.6)), 0.6),
        "burnout_score": _safe(row.get("burnout_score", row.get("burnout_risk_score", 0.45)), 0.45),
        "sentiment_score": _safe(row.get("sentiment_score", row.get("sentiment", 0.0)), 0.0),
        "source": source,
    }


@router.get("/data")
async def get_my_data(
    current_user: User = Depends(require_role([UserRole.EMPLOYEE])),
) -> dict:
    metrics = _fetch_self_metrics(current_user.email)

    # Transparency list intentionally avoids raw values.
    data_fields = [
        "Attendance patterns",
        "Workload and meeting load",
        "Sentiment trend from submitted feedback",
        "Engagement indicators",
        "Performance trend signals",
        "After-hours work ratio",
        "Communication pattern changes",
        "Promotion and tenure timeline",
    ]

    return {
        "employee_id": current_user.email,
        "engagement_level": _category_from_score(metrics["engagement_score"]),
        "burnout_risk_category": _category_from_score(metrics["burnout_score"]),
        "sentiment_trend": _sentiment_trend_label(metrics["sentiment_score"]),
        "data_fields_held": data_fields,
        "source": metrics["source"],
    }


@router.post("/feedback")
async def submit_my_feedback(
    payload: FeedbackRequest,
    current_user: User = Depends(require_role([UserRole.EMPLOYEE])),
) -> dict:
    supabase = get_supabase_admin()

    try:
        supabase.table("employee_feedback").insert(
            {
                "user_id": current_user.email,
                "user_role": current_user.role.value,
                "category": payload.category.strip(),
                "message": payload.message.strip(),
            }
        ).execute()
        return {"status": "ok", "message": "Feedback submitted"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to submit feedback: {exc}") from exc
