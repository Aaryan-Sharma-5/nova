from __future__ import annotations

import hashlib
import random
from collections import Counter, defaultdict
from datetime import datetime
from statistics import mean
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ai.appraisal_engine import AppraisalEngine
from api.deps import require_role
from core.database import get_supabase_admin
from models.user import User, UserRole

router = APIRouter(prefix="/api/appraisals", tags=["Appraisals"])
engine = AppraisalEngine()


class GenerateBatchRequest(BaseModel):
    department: str | None = None
    employee_ids: list[str] | None = None


class UpdateSuggestionRequest(BaseModel):
    hr_notes: str | None = None
    hr_decision: str | None = None
    status: str | None = None


def _appraisals_table() -> Any:
    supabase = get_supabase_admin()
    try:
        supabase.table("appraisal_suggestions").select("id").limit(1).execute()
        return supabase.table("appraisal_suggestions")
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "appraisal_suggestions table is unavailable. Run backend/database/005_appraisals.sql first."
            ),
        ) from exc


def _seed_from_employee(employee_id: str) -> int:
    digest = hashlib.sha256(employee_id.encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


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
    role_options = ["Software Engineer", "Sales Executive", "HR Partner", "Designer", "Finance Analyst"]
    department_options = ["Engineering", "Sales", "HR", "Design", "Finance", "Operations", "Marketing", "Product"]

    profile = {
        "employee_id": employee_id,
        "name": f"Demo {employee_id}",
        "department": seeded.choice(department_options),
        "role": seeded.choice(role_options),
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
    return profile


def _candidate_employee_ids_from_department(department: str) -> list[str]:
    supabase = get_supabase_admin()
    candidates: set[str] = set()

    try:
        rows = (
            supabase.table("employee_feedbacks")
            .select("employee_id")
            .eq("department", department)
            .limit(500)
            .execute()
            .data
        ) or []
        for row in rows:
            emp = row.get("employee_id")
            if emp:
                candidates.add(str(emp))
    except Exception:
        pass

    try:
        users = (
            supabase.table("users")
            .select("email")
            .eq("department", department)
            .eq("role", "employee")
            .limit(500)
            .execute()
            .data
        ) or []
        for row in users:
            email = row.get("email")
            if email:
                candidates.add(str(email))
    except Exception:
        pass

    if candidates:
        return sorted(candidates)

    # Fallback deterministic employee IDs for demo runs.
    dep_seed = int(hashlib.sha256(department.encode("utf-8")).hexdigest()[:8], 16)
    rnd = random.Random(dep_seed)
    return [f"EMP{rnd.randint(1000, 9999)}" for _ in range(12)]


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
    table = _appraisals_table()
    response = table.select("composite_score,category,review_flag,promotion_eligible,status,department").execute()
    rows = response.data or []
    if not rows:
        return {
            "total_reviewed": 0,
            "promotion_eligible_count": 0,
            "pip_count": 0,
            "fast_track_count": 0,
            "category_distribution": {},
            "avg_composite_score": 0.0,
            "dept_breakdown": {},
            "draft_count": 0,
        }

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
