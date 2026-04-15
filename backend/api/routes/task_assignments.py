"""
Task Assignment Limbo Queue

HR uses these endpoints to approve or reject JIRA-triggered assignments.
Rejected assignments optionally create job postings.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import require_role
from core.database import get_supabase_admin
from models.user import User, UserRole

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/task-assignments", tags=["Task Assignments"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ApproveRequest(BaseModel):
    notes: str | None = None


class RejectRequest(BaseModel):
    reason: str
    create_job_posting: bool = True


class SettingsUpdate(BaseModel):
    auto_approve_assignments: bool | None = None
    auto_approve_threshold: float | None = None
    auto_post_jobs: bool | None = None


class ManualAssignRequest(BaseModel):
    assignee_email: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_assignments(
    status: str | None = None,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
):
    """List all JIRA task assignments. Optionally filter by status."""
    sb = get_supabase_admin()
    try:
        q = sb.table("jira_task_assignments").select("*").order("created_at", desc=True)
        if status:
            q = q.eq("status", status)
        r = q.execute()
        return {"assignments": r.data or [], "total": len(r.data or [])}
    except Exception as exc:
        logger.error("list_assignments error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/pending-count")
async def pending_count(
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
):
    """Quick badge count for sidebar."""
    sb = get_supabase_admin()
    try:
        r = sb.table("jira_task_assignments").select("id", count="exact").eq("status", "pending").execute()
        return {"count": r.count or 0}
    except Exception:
        return {"count": 0}


# ── Settings (must be before /{assignment_id} to avoid being swallowed) ───────

@router.get("/settings/auto-approve")
async def get_auto_approve_settings(
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
):
    sb = get_supabase_admin()
    try:
        r = sb.table("nova_settings").select("key,value").eq("org_id", "default").in_(
            "key", ["auto_approve_assignments", "auto_approve_threshold", "auto_post_jobs"]
        ).execute()
        settings: dict[str, Any] = {}
        for row in r.data or []:
            settings[row["key"]] = row["value"]
        return {
            "auto_approve_assignments": bool(settings.get("auto_approve_assignments", False)),
            "auto_approve_threshold": float(settings.get("auto_approve_threshold", 0.85) or 0.85),
            "auto_post_jobs": bool(settings.get("auto_post_jobs", False)),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/settings/auto-approve")
async def update_auto_approve_settings(
    body: SettingsUpdate,
    current_user: User = Depends(require_role([UserRole.HR])),
):
    sb = get_supabase_admin()
    updates: dict[str, Any] = {}
    if body.auto_approve_assignments is not None:
        updates["auto_approve_assignments"] = body.auto_approve_assignments
    if body.auto_approve_threshold is not None:
        threshold = max(0.0, min(1.0, body.auto_approve_threshold))
        updates["auto_approve_threshold"] = threshold
    if body.auto_post_jobs is not None:
        updates["auto_post_jobs"] = body.auto_post_jobs

    try:
        for key, value in updates.items():
            sb.table("nova_settings").upsert({
                "org_id": "default",
                "key": key,
                "value": value,
                "updated_by": current_user.email,
                "updated_at": _now(),
            }, on_conflict="org_id,key").execute()
        return {"status": "updated", "settings": updates}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Per-assignment actions ─────────────────────────────────────────────────────

@router.get("/{assignment_id}")
async def get_assignment(
    assignment_id: str,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
):
    sb = get_supabase_admin()
    try:
        r = sb.table("jira_task_assignments").select("*").eq("id", assignment_id).execute()
        if not r.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        return r.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{assignment_id}/assign")
async def assign_employee(
    assignment_id: str,
    body: ManualAssignRequest,
    current_user: User = Depends(require_role([UserRole.HR])),
):
    """
    HR manually assigns (or reassigns) an employee to a task.
    Bypasses the AI recommendation and immediately approves the assignment.
    """
    sb = get_supabase_admin()
    try:
        r = sb.table("jira_task_assignments").select("id,status").eq("id", assignment_id).execute()
        if not r.data:
            raise HTTPException(status_code=404, detail="Assignment not found")

        user_r = sb.table("users").select("email,full_name").eq("email", body.assignee_email).execute()
        if not user_r.data:
            raise HTTPException(status_code=404, detail=f"User '{body.assignee_email}' not found")

        full_name = user_r.data[0].get("full_name") or body.assignee_email

        sb.table("jira_task_assignments").update({
            "recommended_assignee_email": body.assignee_email,
            "recommended_assignee_name": full_name,
            "match_score": 1.0,
            "ai_reasoning": f"Manually assigned by HR ({current_user.email})",
            "status": "approved",
            "approved_by": current_user.email,
            "approved_at": _now(),
            "updated_at": _now(),
        }).eq("id", assignment_id).execute()

        # Sync to JIRA if employee has a jira_account_id
        jira_synced = False
        try:
            from ai.jira_client import assign_jira_issue
            jira_r = sb.table("employee_work_profiles").select("jira_account_id").eq(
                "employee_email", body.assignee_email
            ).execute()
            jira_account_id = (jira_r.data[0].get("jira_account_id") or "") if jira_r.data else ""
            issue_key = r.data[0].get("jira_issue_key", "")
            if jira_account_id and issue_key:
                jira_synced = await assign_jira_issue(issue_key, jira_account_id)
        except Exception as exc:
            logger.warning("JIRA sync failed (non-fatal): %s", exc)

        return {
            "status": "approved",
            "assignment_id": assignment_id,
            "assignee_email": body.assignee_email,
            "assignee_name": full_name,
            "jira_synced": jira_synced,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{assignment_id}/approve")
async def approve_assignment(
    assignment_id: str,
    body: ApproveRequest,
    current_user: User = Depends(require_role([UserRole.HR])),
):
    """HR approves a recommended assignment."""
    sb = get_supabase_admin()
    try:
        r = sb.table("jira_task_assignments").select("*").eq("id", assignment_id).execute()
        if not r.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        assignment = r.data[0]
        if assignment["status"] not in ("pending",):
            raise HTTPException(status_code=400, detail=f"Assignment is already '{assignment['status']}'")

        sb.table("jira_task_assignments").update({
            "status": "approved",
            "approved_by": current_user.email,
            "approved_at": _now(),
            "updated_at": _now(),
        }).eq("id", assignment_id).execute()

        # Sync to JIRA if employee has a jira_account_id
        jira_synced = False
        try:
            from ai.jira_client import assign_jira_issue
            assignee_email = assignment.get("recommended_assignee_email", "")
            jira_r = sb.table("employee_work_profiles").select("jira_account_id").eq(
                "employee_email", assignee_email
            ).execute()
            jira_account_id = (jira_r.data[0].get("jira_account_id") or "") if jira_r.data else ""
            issue_key = assignment.get("jira_issue_key", "")
            if jira_account_id and issue_key:
                jira_synced = await assign_jira_issue(issue_key, jira_account_id)
        except Exception as exc:
            logger.warning("JIRA sync failed (non-fatal): %s", exc)

        return {
            "status": "approved",
            "assignment_id": assignment_id,
            "assignee": assignment.get("recommended_assignee_name"),
            "approved_by": current_user.email,
            "jira_synced": jira_synced,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{assignment_id}/reject")
async def reject_assignment(
    assignment_id: str,
    body: RejectRequest,
    current_user: User = Depends(require_role([UserRole.HR])),
):
    """
    HR rejects a recommended assignment.
    Optionally creates a job posting in limbo.
    """
    from ai.skill_matcher import generate_job_posting

    sb = get_supabase_admin()
    try:
        r = sb.table("jira_task_assignments").select("*").eq("id", assignment_id).execute()
        if not r.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        assignment = r.data[0]
        if assignment["status"] not in ("pending",):
            raise HTTPException(status_code=400, detail=f"Assignment is already '{assignment['status']}'")

        sb.table("jira_task_assignments").update({
            "status": "rejected",
            "rejection_reason": body.reason,
            "approved_by": current_user.email,
            "approved_at": _now(),
            "updated_at": _now(),
        }).eq("id", assignment_id).execute()

        job_posting_id = None
        if body.create_job_posting:
            required_skills = assignment.get("required_skills") or []
            posting = await generate_job_posting(
                assignment.get("jira_issue_title", ""),
                assignment.get("jira_issue_description", ""),
                required_skills,
                rejection_reason=body.reason,
            )
            row = {
                "jira_issue_key": assignment.get("jira_issue_key"),
                "jira_task_assignment_id": assignment_id,
                "title": posting["title"],
                "description": posting["description"],
                "required_skills": required_skills,
                "workplace_type": "HYBRID",
                "employment_type": "FULL_TIME",
                "status": "limbo",
                "ai_reasoning": posting["reasoning"],
                "created_at": _now(),
                "updated_at": _now(),
            }
            try:
                pr = sb.table("job_postings").insert(row).execute()
                if pr.data:
                    job_posting_id = pr.data[0]["id"]
            except Exception as exc:
                logger.error("Failed to create job posting: %s", exc)

        return {
            "status": "rejected",
            "assignment_id": assignment_id,
            "job_posting_created": job_posting_id is not None,
            "job_posting_id": job_posting_id,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{assignment_id}/reassign")
async def reassign_with_ai(
    assignment_id: str,
    current_user: User = Depends(require_role([UserRole.HR])),
):
    """
    Re-run AI matching on an existing assignment.
    Fetches current work profiles and runs the full skill-match + LLM evaluation
    pipeline, then updates the assignment with the new recommendation and reasoning.
    Status is reset to 'pending' so HR still has to approve.
    """
    from ai.skill_matcher import evaluate_best_candidate, find_matching_employees

    sb = get_supabase_admin()
    try:
        r = sb.table("jira_task_assignments").select("*").eq("id", assignment_id).execute()
        if not r.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        assignment = r.data[0]

        title = assignment.get("jira_issue_title", "")
        description = assignment.get("jira_issue_description", "") or title
        required_skills = assignment.get("required_skills") or []

        # Fetch all current work profiles, enriched with full_name from users
        profiles_r = sb.table("employee_work_profiles").select("*").execute()
        profiles = profiles_r.data or []
        if not profiles:
            raise HTTPException(status_code=422, detail="No employee work profiles to match against")
        emails = [p["employee_email"] for p in profiles]
        users_r = sb.table("users").select("email,full_name").in_("email", emails).execute()
        name_map = {u["email"]: u.get("full_name") or "" for u in (users_r.data or [])}
        for p in profiles:
            p["full_name"] = name_map.get(p["employee_email"], "")

        candidates = find_matching_employees(required_skills, f"{title}. {description}", profiles, top_n=5)
        if not candidates:
            raise HTTPException(status_code=422, detail="No employees matched the required skills")

        evaluation = await evaluate_best_candidate(candidates, title, description, required_skills)
        selected_email = evaluation.get("selected_email")
        selected_name = evaluation.get("selected_name")
        confidence = float(evaluation.get("confidence", 0.0))
        reasoning = evaluation.get("reasoning", "")

        if not selected_email:
            raise HTTPException(status_code=422, detail=f"AI could not select a candidate: {reasoning}")

        # Resolve display name — look up from users table if LLM returned null
        if not selected_name:
            try:
                ur = sb.table("users").select("full_name").eq("email", selected_email).execute()
                selected_name = (ur.data[0].get("full_name") or selected_email) if ur.data else selected_email
            except Exception:
                selected_name = selected_email

        best = next(
            (c for c in candidates if (c.get("employee_email") or c.get("email")) == selected_email),
            candidates[0],
        )
        match_score = best.get("match_score", confidence)

        sb.table("jira_task_assignments").update({
            "recommended_assignee_email": selected_email,
            "recommended_assignee_name": selected_name,
            "match_score": round(match_score, 4),
            "ai_reasoning": reasoning,
            "status": "pending",
            "approved_by": None,
            "approved_at": None,
            "updated_at": _now(),
        }).eq("id", assignment_id).execute()

        return {
            "status": "reassigned",
            "assignment_id": assignment_id,
            "recommended_assignee_email": selected_email,
            "recommended_assignee_name": selected_name,
            "match_score": round(match_score, 4),
            "ai_reasoning": reasoning,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
