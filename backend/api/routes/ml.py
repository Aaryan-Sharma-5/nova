"""ML explainability endpoints."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query

from ai.ml.burnout_classifier import get_feature_contributions
from api.deps import require_role
from core.config import settings
from core.database import get_supabase_admin
from models.user import User, UserRole

router = APIRouter(prefix="/api/ml", tags=["ML Explainability"])


def _deterministic_unit(seed: str, salt: str) -> float:
    digest = hashlib.sha256(f"{seed}:{salt}".encode("utf-8")).hexdigest()
    value = int(digest[:8], 16)
    return value / float(0xFFFFFFFF)


def _mock_employee_features(employee_id: str) -> dict:
    """Generate deterministic feature inputs when live feature store is unavailable."""
    return {
        "overtime_hours": 20 + _deterministic_unit(employee_id, "overtime") * 40,
        "pto_days_unused": _deterministic_unit(employee_id, "pto") * 20,
        "meeting_load_hours": 10 + _deterministic_unit(employee_id, "meeting") * 25,
        "sentiment_score": -0.6 + _deterministic_unit(employee_id, "sentiment") * 1.4,
        "tenure_months": 3 + _deterministic_unit(employee_id, "tenure") * 84,
        "performance_score": 0.35 + _deterministic_unit(employee_id, "performance") * 0.6,
        "days_since_promotion": 30 + _deterministic_unit(employee_id, "promotion") * 1300,
        "after_hours_ratio": _deterministic_unit(employee_id, "after_hours"),
        "communication_drop_indicator": _deterministic_unit(employee_id, "comm_drop"),
        "engagement_score": 0.3 + _deterministic_unit(employee_id, "engagement") * 0.65,
    }


def _safe_float(value: object, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return default
    return default


def _months_since(iso_value: str | None) -> float:
    if not iso_value:
        return 12.0
    try:
        dt = datetime.fromisoformat(iso_value.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return max((now - dt).days / 30.0, 0.0)
    except Exception:
        return 12.0


def _extract_features_from_row(row: dict, tenure_months_fallback: float = 12.0) -> dict:
    """Normalize a generic metrics row into burnout classifier feature inputs."""
    return {
        "overtime_hours": _safe_float(
            row.get("overtime_hours", row.get("avg_overtime_hours", row.get("overtime", 20.0))),
            20.0,
        ),
        "pto_days_unused": _safe_float(
            row.get("pto_days_unused", row.get("unused_pto_days", row.get("pto_unused", 8.0))),
            8.0,
        ),
        "meeting_load_hours": _safe_float(
            row.get("meeting_load_hours", row.get("avg_meeting_hours", row.get("meeting_hours", 18.0))),
            18.0,
        ),
        "sentiment_score": _safe_float(
            row.get("sentiment_score", row.get("avg_sentiment", row.get("sentiment", -0.05))),
            -0.05,
        ),
        "tenure_months": _safe_float(row.get("tenure_months", tenure_months_fallback), tenure_months_fallback),
        "performance_score": _safe_float(
            row.get("performance_score", row.get("kpi_completion_rate", row.get("performance", 0.55))),
            0.55,
        ),
        "days_since_promotion": _safe_float(
            row.get("days_since_promotion", row.get("last_promotion_days", 365.0)),
            365.0,
        ),
        "after_hours_ratio": _safe_float(
            row.get("after_hours_ratio", row.get("after_hours_work_ratio", 0.25)),
            0.25,
        ),
        "communication_drop_indicator": _safe_float(
            row.get("communication_drop_indicator", row.get("communication_drop", 0.2)),
            0.2,
        ),
        "engagement_score": _safe_float(
            row.get("engagement_score", row.get("engagement", 0.6)),
            0.6,
        ),
    }


def _parse_column_map() -> dict[str, str]:
    raw = settings.ML_FEATURE_COLUMN_MAP_JSON.strip()
    if not raw:
        return {}

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return {
                str(k): str(v)
                for k, v in parsed.items()
                if isinstance(k, str) and isinstance(v, str)
            }
    except Exception:
        pass
    return {}


def _apply_column_map(row: dict, column_map: dict[str, str]) -> dict:
    """Overlay canonical keys from configured source-column names."""
    if not column_map:
        return row

    normalized = dict(row)
    for canonical_key, source_key in column_map.items():
        if source_key in row and canonical_key not in normalized:
            normalized[canonical_key] = row[source_key]
    return normalized


def _fetch_employee_features_from_config(employee_id: str) -> tuple[dict | None, str | None]:
    """Fetch live features using explicit env-configured table/columns."""
    table_name = settings.ML_FEATURE_TABLE.strip()
    if not table_name:
        return None, None

    employee_key = settings.ML_FEATURE_EMPLOYEE_KEY.strip() or "employee_id"
    column_map = _parse_column_map()

    supabase = get_supabase_admin()
    try:
        response = (
            supabase.table(table_name)
            .select("*")
            .eq(employee_key, employee_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            return None, None

        row = _apply_column_map(rows[0], column_map)
        return _extract_features_from_row(row), f"supabase-config:{table_name}"
    except Exception:
        return None, None


def _fetch_employee_features_supabase(employee_id: str) -> tuple[dict | None, str | None]:
    """Try to load real employee feature signals from Supabase.

    Returns (features, source) or (None, None) when no live records are found.
    """
    configured_features, configured_source = _fetch_employee_features_from_config(employee_id)
    if configured_features:
        return configured_features, configured_source

    supabase = get_supabase_admin()

    # 1) Attempt feature-store style tables first.
    candidate_tables = [
        "employee_feature_store",
        "employee_features",
        "employee_metrics",
        "employee_signals",
        "daily_department_metrics",
    ]

    for table_name in candidate_tables:
        try:
            response = (
                supabase.table(table_name)
                .select("*")
                .eq("employee_id", employee_id)
                .limit(1)
                .execute()
            )
            rows = response.data or []
            if rows:
                return _extract_features_from_row(rows[0]), f"supabase:{table_name}"
        except Exception:
            continue

    # 2) If employee_id is an email, derive tenure from users and combine with anomalies.
    if "@" in employee_id:
        try:
            user_response = (
                supabase.table("users")
                .select("email,created_at")
                .eq("email", employee_id)
                .limit(1)
                .execute()
            )
            user_rows = user_response.data or []
            if user_rows:
                user_row = user_rows[0]
                tenure_months = _months_since(user_row.get("created_at"))

                # Enrich with anomaly-derived signal if available.
                communication_drop = 0.2
                try:
                    anomaly_response = (
                        supabase.table("behavioral_anomalies")
                        .select("z_score,anomaly_type")
                        .eq("employee_id", employee_id)
                        .limit(20)
                        .execute()
                    )
                    anomalies = anomaly_response.data or []
                    if anomalies:
                        max_z = max(abs(_safe_float(row.get("z_score"), 0.0)) for row in anomalies)
                        communication_drop = min(max_z / 4.0, 1.0)
                except Exception:
                    pass

                base_row = {
                    "tenure_months": tenure_months,
                    "communication_drop_indicator": communication_drop,
                }
                return _extract_features_from_row(base_row, tenure_months_fallback=tenure_months), "supabase:users+derived"
        except Exception:
            return None, None

    return None, None


@router.get("/feature-importance/{employee_id}")
async def get_employee_feature_importance(
    employee_id: str,
    top_k: int = Query(default=10, ge=1, le=10),
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.MANAGER, UserRole.LEADERSHIP])),
) -> dict:
    features, source = _fetch_employee_features_supabase(employee_id)
    if not features:
        features = _mock_employee_features(employee_id)
        source = "deterministic_fallback_feature_profile"

    contributions = get_feature_contributions(features, top_k=top_k)

    return {
        "employee_id": employee_id,
        "top_features": contributions,
        "generated_from": source,
    }
