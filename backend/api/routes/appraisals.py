from __future__ import annotations

import hashlib
import logging
import random
from collections import Counter, defaultdict
from datetime import datetime
from functools import lru_cache
from statistics import mean
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError
from pydantic import BaseModel

from ai.appraisal_engine import AppraisalEngine
from api.deps import require_role
from core.employee_directory import get_employee_directory, get_employee_record
from core.database import get_supabase_admin
from models.user import User, UserRole

router = APIRouter(prefix="/api/appraisals", tags=["Appraisals"])
engine = AppraisalEngine()
logger = logging.getLogger(__name__)


class GenerateBatchRequest(BaseModel):
    department: str | None = None
    employee_ids: list[str] | None = None


class UpdateSuggestionRequest(BaseModel):
    hr_notes: str | None = None
    hr_decision: str | None = None
    status: str | None = None


def _is_missing_appraisals_table(exc: Exception) -> bool:
    if isinstance(exc, APIError):
        payload = exc.args[0] if exc.args and isinstance(exc.args[0], dict) else {}
        code = str(payload.get("code") or "")
        message = str(payload.get("message") or "")
        if code == "PGRST205" and "appraisal_suggestions" in message:
            return True
    text = str(exc)
    return "PGRST205" in text and "appraisal_suggestions" in text


def _is_supabase_connectivity_error(exc: Exception) -> bool:
    text = str(exc).lower()
    connectivity_markers = (
        "getaddrinfo failed",
        "temporary failure in name resolution",
        "name or service not known",
        "nodename nor servname provided",
        "httpx.connecterror",
        "httpcore.connecterror",
        "httpx.readerror",
        "httpcore.readerror",
        "connecterror",
        "readerror",
        "winerror 10054",
        "forcibly closed by the remote host",
        "connection reset by peer",
        "server disconnected",
        "remote protocol error",
        "errno 11001",
    )
    return any(marker in text for marker in connectivity_markers)


def _raise_storage_http_exception(exc: Exception) -> None:
    if _is_supabase_connectivity_error(exc):
        logger.warning("Supabase connectivity issue while reading appraisals: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Supabase is unreachable (DNS/network). Verify SUPABASE_URL and local DNS settings.",
        ) from exc
    if _is_missing_appraisals_table(exc):
        raise HTTPException(
            status_code=503,
            detail=(
                "appraisal_suggestions table is unavailable. Run backend/database/005_appraisals.sql first."
            ),
        ) from exc
    raise HTTPException(
        status_code=503,
        detail="Appraisals storage is unavailable.",
    ) from exc


def _empty_summary(*, storage_unavailable: bool = False, reason: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "total_reviewed": 0,
        "promotion_eligible_count": 0,
        "pip_count": 0,
        "fast_track_count": 0,
        "category_distribution": {},
        "avg_composite_score": 0.0,
        "dept_breakdown": {},
        "draft_count": 0,
    }
    if storage_unavailable:
        payload["storage_unavailable"] = True
        if reason:
            payload["reason"] = reason
    return payload


def _appraisals_table() -> Any:
    supabase = get_supabase_admin()
    try:
        supabase.table("appraisal_suggestions").select("id").limit(1).execute()
        return supabase.table("appraisal_suggestions")
    except Exception as exc:
        _raise_storage_http_exception(exc)


def _seed_from_employee(employee_id: str) -> int:
    digest = hashlib.sha256(employee_id.encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


@lru_cache(maxsize=1)
def _appraisal_thresholds() -> tuple[float, float, float, float]:
    scores: list[float] = []
    for record in get_employee_directory():
        profile = _resolve_employee_profile(record["employee_id"])
        scores.append(engine.compute_scoring_matrix(profile).composite_appraisal_score)

    if not scores:
        return 80.0, 60.0, 40.0, 20.0

    ordered = sorted(scores)

    def percentile(pct: float) -> float:
        if len(ordered) == 1:
            return ordered[0]
        rank = (len(ordered) - 1) * pct
        lower = int(rank)
        upper = min(lower + 1, len(ordered) - 1)
        weight = rank - lower
        return ordered[lower] * (1 - weight) + ordered[upper] * weight

    return (
        percentile(0.80),
        percentile(0.60),
        percentile(0.40),
        percentile(0.20),
    )


def _category_for_score(score: float) -> str:
    exceptional, high, meets, needs = APPRAISAL_PERCENTILE_THRESHOLDS
    if score >= exceptional:
        return "Exceptional — Fast Track Promotion"
    if score >= high:
        return "High Performer — Standard Promotion + Raise"
    if score >= meets:
        return "Meets Expectations — Merit Increment"
    if score >= needs:
        return "Needs Improvement — PIP Consideration"
    return "Critical — Intervention Required Before Review"


def _resolve_feedback_signals(employee_id: str) -> tuple[int, bool, list[str]]:
    supabase = get_supabase_admin()
    positive_count = 0
    critical_exists = False
    themes: Counter[str] = Counter()

    try:
        records = (
            supabase.table("employee_feedbacks")
            .select("sentiment_score,themes")
            .eq("employee_id", employee_id)
            .limit(40)
            .execute()
        ).data or []

        for row in records:
            score = float(row.get("sentiment_score") or 0.0)
            if score > 0.2:
                positive_count += 1
            if score < -0.6:
                critical_exists = True
            row_themes = row.get("themes") or []
            if isinstance(row_themes, list):
                for theme in row_themes:
                    themes[str(theme)] += 1
    except Exception:
        pass

    top_themes = [name for name, _count in themes.most_common(4)]
    return positive_count, critical_exists, top_themes


def _resolve_employee_profile(employee_id: str) -> dict[str, Any]:
    seeded = random.Random(_seed_from_employee(employee_id))
    record = get_employee_record(employee_id)
    if record is None:
        record = {
            "employee_id": employee_id,
            "name": f"Employee {employee_id}",
            "department": seeded.choice(["Engineering", "Sales", "HR", "Design", "Finance", "Operations"]),
            "role": "Employee",
            "title": "Employee",
            "reports_to": None,
            "org_level": 4,
        }

    profile = {
        "employee_id": employee_id,
        "name": record.get("name") or f"Employee {employee_id}",
        "department": record.get("department") or "Engineering",
        "role": record.get("role") or record.get("title") or "Employee",
        "title": record.get("title") or record.get("role") or "Employee",
        "reports_to": record.get("reports_to"),
        "org_level": record.get("org_level", 4),
        "tenure_months": seeded.randint(6, 96),
        "performance_score": round(seeded.uniform(52, 96), 2),
        "engagement_score": round(seeded.uniform(45, 92), 2),
        "burnout_score": round(seeded.uniform(0.15, 0.88), 3),
        "attrition_risk": round(seeded.uniform(0.10, 0.82), 3),
        "sentiment_score": round(seeded.uniform(-0.55, 0.9), 3),
        "sentiment_trend": seeded.choice(["improving", "stable", "declining"]),
        "performance_history": [round(seeded.uniform(45, 97), 2) for _ in range(13)],
    }

    # Attempt to enrich from users table if available.
    try:
        user_rows = (
            get_supabase_admin()
            .table("users")
            .select("email,full_name,role,department")
            .eq("email", employee_id)
            .limit(1)
            .execute()
            .data
        ) or []
        if user_rows:
            user = user_rows[0]
            profile["name"] = user.get("full_name") or profile["name"]
            profile["role"] = str(user.get("role") or profile["role"]).replace("_", " ").title()
            if user.get("department"):
                profile["department"] = str(user.get("department"))
    except Exception:
        pass

    positive_feedback_count, critical_feedback_exists, feedback_themes = _resolve_feedback_signals(employee_id)
    profile["positive_feedback_count"] = positive_feedback_count
    profile["critical_feedback_exists"] = critical_feedback_exists
    profile["feedback_themes_if_any"] = feedback_themes

    showcase_overrides: dict[str, dict[str, Any]] = {
        "NOVA-ENG002": {
            "performance_score": 91.0,
            "engagement_score": 92.0,
            "burnout_score": 0.12,
            "attrition_risk": 0.10,
            "sentiment_score": 0.80,
            "sentiment_trend": "improving",
            "positive_feedback_count": max(2, positive_feedback_count),
            "promotion_eligible": True,
            "fast_track": True,
        },
        "NOVA-ENG005": {
            "performance_score": 54.0,
            "engagement_score": 38.0,
            "burnout_score": 0.82,
            "attrition_risk": 0.78,
            "sentiment_score": -0.90,
            "sentiment_trend": "declining",
            "critical_feedback_exists": True,
        },
        "NOVA-DES005": {
            "performance_score": 63.0,
            "engagement_score": 46.0,
            "burnout_score": 0.55,
            "attrition_risk": 0.56,
            "sentiment_score": -0.40,
            "sentiment_trend": "declining",
        },
    }
    if employee_id in showcase_overrides:
        profile.update(showcase_overrides[employee_id])

    return profile


APPRAISAL_PERCENTILE_THRESHOLDS = _appraisal_thresholds()


def _candidate_employee_ids_from_department(department: str) -> list[str]:
    candidates: set[str] = set()

    for record in get_employee_directory():
        if str(record.get("department") or "") == department:
            candidates.add(str(record.get("employee_id") or ""))

    if candidates:
        return sorted(candidates)

    return []


def _save_suggestion_row(suggestion: dict[str, Any]) -> dict[str, Any]:
    row = {
        "employee_id": suggestion["employee_id"],
        "generated_at": datetime.utcnow().isoformat(),
        "composite_score": suggestion["composite_score"],
        "category": suggestion["category"],
        "summary": suggestion["summary"],
        "recommendations": suggestion["recommendations"],
        "salary_action": suggestion["salary_action"],
        "promotion_eligible": suggestion["promotion_eligible"],
        "review_flag": suggestion["review_flag"],
        "status": "draft",
        "department": suggestion.get("department"),
        "employee_name": suggestion.get("employee_name"),
        "employee_role": suggestion.get("role"),
        "score_breakdown": suggestion.get("score_breakdown", {}),
    }
    response = _appraisals_table().insert(row).execute()
    rows = response.data or []
    return rows[0] if rows else row


def _enrich_for_response(row: dict[str, Any]) -> dict[str, Any]:
    profile = _resolve_employee_profile(str(row.get("employee_id") or "unknown"))
    matrix = engine.compute_scoring_matrix(profile)
    breakdown = {
        "performance_contribution": round(matrix.performance_score * 0.35, 2),
        "consistency_contribution": round(matrix.consistency_score * 0.15, 2),
        "growth_contribution": round(matrix.growth_trajectory * 0.20, 2),
        "engagement_contribution": round(matrix.engagement_factor * 0.15, 2),
        "retention_risk_penalty": round(matrix.retention_risk_penalty, 2),
        "burnout_penalty": round(matrix.burnout_penalty, 2),
        "sentiment_bonus": round(matrix.sentiment_bonus, 2),
        "feedback_signal": round(matrix.feedback_signal, 2),
        "total": round(float(row.get("composite_score") or matrix.composite_appraisal_score), 2),
    }

    merged = dict(row)
    merged["employee"] = {
        "id": profile.get("employee_id"),
        "name": row.get("employee_name") or profile.get("name"),
        "department": row.get("department") or profile.get("department"),
        "role": row.get("employee_role") or profile.get("role"),
        "tenure_months": profile.get("tenure_months", 0),
    }
    merged["score_breakdown"] = row.get("score_breakdown") or breakdown
    return merged


@router.post("/generate/{employee_id}")
async def generate_for_employee(
    employee_id: str,
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    _appraisals_table()
    employee_data = _resolve_employee_profile(employee_id)
    suggestion = await engine.generate_suggestion(employee_data)
    suggestion["category"] = _category_for_score(float(suggestion.get("composite_score") or 0.0))
    saved = _save_suggestion_row(suggestion)
    return _enrich_for_response(saved)


@router.post("/generate-batch")
async def generate_batch(
    payload: GenerateBatchRequest,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    _appraisals_table()

    employee_ids: list[str] = []
    if payload.employee_ids:
        employee_ids = [str(emp).strip() for emp in payload.employee_ids if str(emp).strip()]
    elif payload.department:
        employee_ids = _candidate_employee_ids_from_department(payload.department)
    else:
        if current_user.role != UserRole.LEADERSHIP:
            raise HTTPException(status_code=400, detail="Provide department or employee_ids for batch generation")
        # Leadership can generate for all known departments.
        all_ids: set[str] = set()
        for dept in ["Engineering", "Sales", "HR", "Design", "Finance", "Operations", "Marketing", "Product"]:
            all_ids.update(_candidate_employee_ids_from_department(dept))
        employee_ids = sorted(all_ids)

    if not employee_ids:
        raise HTTPException(status_code=400, detail="No employees resolved for batch generation")

    suggestions = await engine.batch_generate(employee_ids, resolver=_resolve_employee_profile)
    for suggestion in suggestions:
        suggestion["category"] = _category_for_score(float(suggestion.get("composite_score") or 0.0))

    saved_rows = [_save_suggestion_row(suggestion) for suggestion in suggestions]
    return {
        "count": len(saved_rows),
        "suggestions": [_enrich_for_response(row) for row in saved_rows],
    }


@router.get("/suggestions")
async def list_suggestions(
    department: str | None = None,
    category: str | None = None,
    promotion_eligible: bool | None = None,
    review_flag: str | None = None,
    status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    table = _appraisals_table()
    query = table.select("*", count="exact")

    if department:
        query = query.eq("department", department)
    if category:
        query = query.eq("category", category)
    if promotion_eligible is not None:
        query = query.eq("promotion_eligible", promotion_eligible)
    if review_flag:
        query = query.eq("review_flag", review_flag)
    if status:
        query = query.eq("status", status)

    start = (page - 1) * page_size
    end = start + page_size - 1
    response = query.order("generated_at", desc=True).range(start, end).execute()
    rows = response.data or []
    total = int(response.count or 0)

    return {
        "items": [_enrich_for_response(row) for row in rows],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": max(1, (total + page_size - 1) // page_size),
        },
    }


@router.patch("/suggestions/{suggestion_id}")
async def update_suggestion(
    suggestion_id: str,
    payload: UpdateSuggestionRequest,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    table = _appraisals_table()
    update_payload: dict[str, Any] = {}

    if payload.hr_notes is not None:
        update_payload["hr_notes"] = payload.hr_notes
    if payload.hr_decision is not None:
        update_payload["hr_decision"] = payload.hr_decision
    if payload.status is not None:
        normalized = payload.status.strip().lower()
        if normalized not in {"draft", "under_review", "finalized"}:
            raise HTTPException(status_code=400, detail="Invalid status value")
        update_payload["status"] = normalized
        if normalized == "finalized":
            update_payload["finalized_by"] = current_user.email
            update_payload["finalized_at"] = datetime.utcnow().isoformat()

    if not update_payload:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    response = table.update(update_payload).eq("id", suggestion_id).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return _enrich_for_response(rows[0])


@router.get("/suggestions/{employee_id}/latest")
async def latest_for_employee(
    employee_id: str,
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict[str, Any]:
    table = _appraisals_table()
    response = (
        table.select("*")
        .eq("employee_id", employee_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="No appraisal suggestion found for employee")

    latest = _enrich_for_response(rows[0])
    evidence: list[dict[str, Any]] = []
    try:
        feedback_rows = (
            get_supabase_admin()
            .table("employee_feedback")
            .select("id,message,created_at")
            .eq("user_id", employee_id)
            .eq("category", "appraisal_context")
            .order("created_at", desc=True)
            .limit(3)
            .execute()
            .data
        ) or []
        for row in feedback_rows:
            evidence.append(
                {
                    "id": row.get("id"),
                    "message": row.get("message"),
                    "created_at": row.get("created_at"),
                }
            )
    except Exception:
        evidence = []

    latest["feedback_evidence"] = evidence
    return latest


@router.get("/summary")
async def appraisal_summary(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    try:
        table = _appraisals_table()
        response = table.select("composite_score,category,review_flag,promotion_eligible,status,department").execute()
    except HTTPException as exc:
        if exc.status_code == 503:
            return _empty_summary(storage_unavailable=True, reason=str(exc.detail))
        raise
    except Exception as exc:
        try:
            _raise_storage_http_exception(exc)
        except HTTPException as http_exc:
            if http_exc.status_code == 503:
                return _empty_summary(storage_unavailable=True, reason=str(http_exc.detail))
            raise

    rows = response.data or []
    if not rows:
        return _empty_summary()

    category_distribution: Counter[str] = Counter()
    dept_breakdown: dict[str, Counter[str]] = defaultdict(Counter)
    promotion_eligible_count = 0
    pip_count = 0
    fast_track_count = 0
    reviewed_count = 0
    draft_count = 0

    for row in rows:
        category = str(row.get("category") or "Unknown")
        category_distribution[category] += 1

        dept = str(row.get("department") or "Unknown")
        dept_breakdown[dept][category] += 1

        if bool(row.get("promotion_eligible")):
            promotion_eligible_count += 1

        flag = str(row.get("review_flag") or "none")
        if flag == "pip":
            pip_count += 1
        if flag == "fast_track":
            fast_track_count += 1

        status = str(row.get("status") or "draft")
        if status != "draft":
            reviewed_count += 1
        if status == "draft":
            draft_count += 1

    avg_score = round(mean(float(row.get("composite_score") or 0.0) for row in rows), 2)

    return {
        "total_reviewed": reviewed_count,
        "promotion_eligible_count": promotion_eligible_count,
        "pip_count": pip_count,
        "fast_track_count": fast_track_count,
        "category_distribution": dict(category_distribution),
        "avg_composite_score": avg_score,
        "dept_breakdown": {dept: dict(counter) for dept, counter in dept_breakdown.items()},
        "draft_count": draft_count,
    }
