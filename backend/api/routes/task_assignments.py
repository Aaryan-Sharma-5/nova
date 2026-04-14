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

        return {
            "status": "approved",
            "assignment_id": assignment_id,
            "assignee": assignment.get("recommended_assignee_name"),
            "approved_by": current_user.email,
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


# ── Settings ──────────────────────────────────────────────────────────────────

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
