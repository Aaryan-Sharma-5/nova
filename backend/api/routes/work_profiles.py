"""
Employee Work Profiles

HR/managers can view AI-built profiles from commit activity.
Employees can register their GitHub username.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_current_active_user, require_role
from core.database import get_supabase_admin
from models.user import User, UserRole

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/work-profiles", tags=["Work Profiles"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterGitHubRequest(BaseModel):
    github_username: str
    target_email: str | None = None  # HR can set for other employees


class RegisterJiraRequest(BaseModel):
    jira_account_id: str
    target_email: str | None = None  # HR can set for other employees


class ManualSkillsUpdate(BaseModel):
    skills: list[str]


class ProfileUpdate(BaseModel):
    github_username: str | None = None
    jira_account_id: str | None = None
    skills: list[str] | None = None
    profile_summary: str | None = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_work_profiles(
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
):
    """List all employee work profiles."""
    sb = get_supabase_admin()
    try:
        r = sb.table("employee_work_profiles").select(
            "id,employee_email,github_username,jira_account_id,skills,total_commits,avg_code_quality,profile_summary,last_commit_at,updated_at"
        ).order("updated_at", desc=True).execute()
        return {"profiles": r.data or [], "total": len(r.data or [])}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/me")
async def get_my_profile(
    current_user: User = Depends(get_current_active_user),
):
    """Get the current user's own work profile."""
    sb = get_supabase_admin()
    try:
        r = sb.table("employee_work_profiles").select("*").eq("employee_email", current_user.email).execute()
        if not r.data:
            return {"profile": None, "message": "No work profile yet. Register your GitHub username to get started."}
        profile = r.data[0]
        # Exclude heavy embedding vector from response
        profile.pop("skill_embeddings", None)
        return {"profile": profile}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/employees")
async def list_employees_for_assignment(
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
):
    """Return all users for the HR assignment dropdown."""
    sb = get_supabase_admin()
    try:
        r = sb.table("users").select("email,full_name,role").order("full_name").execute()
        return {"employees": r.data or []}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{email}")
async def get_work_profile(
    email: str,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
):
    """Get a specific employee's work profile."""
    sb = get_supabase_admin()
    try:
        r = sb.table("employee_work_profiles").select(
            "id,employee_email,github_username,jira_account_id,skills,total_commits,avg_code_quality,profile_summary,last_commit_at,updated_at"
        ).eq("employee_email", email).execute()
        if not r.data:
            raise HTTPException(status_code=404, detail="Work profile not found for this employee")
        return r.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/me/commits")
async def get_my_commits(
    limit: int = 20,
    current_user: User = Depends(get_current_active_user),
):
    """Get the current user's own commit history."""
    sb = get_supabase_admin()
    try:
        r = sb.table("commit_analyses").select(
            "id,commit_hash,commit_message,repository,branch,diff_summary,"
            "skills_demonstrated,code_quality_score,code_quality_label,"
            "complexity,impact,quality_reasoning,lines_added,lines_deleted,"
            "files_changed,committed_at,triggered_profile_update,created_at"
        ).eq("employee_email", current_user.email).order("created_at", desc=True).limit(limit).execute()
        return {"commits": r.data or [], "total": len(r.data or [])}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{email}/commits")
async def get_employee_commits(
    email: str,
    limit: int = 20,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
):
    """Get commit history and analyses for an employee."""
    sb = get_supabase_admin()
    try:
        r = sb.table("commit_analyses").select(
            "id,commit_hash,commit_message,repository,branch,diff_summary,"
            "skills_demonstrated,code_quality_score,code_quality_label,"
            "complexity,impact,quality_reasoning,lines_added,lines_deleted,"
            "files_changed,committed_at,triggered_profile_update,created_at"
        ).eq("employee_email", email).order("created_at", desc=True).limit(limit).execute()
        return {"commits": r.data or [], "total": len(r.data or [])}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/register-github")
async def register_github_username(
    body: RegisterGitHubRequest,
    current_user: User = Depends(get_current_active_user),
):
    """
    Link a GitHub username to an employee.
    Employees register themselves. HR can register on behalf of others.
    """
    from ai.skill_matcher import _embed

    sb = get_supabase_admin()

    # Determine whose profile to update
    target_email = current_user.email
    if body.target_email and current_user.role in (UserRole.HR, UserRole.LEADERSHIP):
        target_email = body.target_email

    # Verify target user exists
    try:
        user_r = sb.table("users").select("email,full_name").eq("email", target_email).execute()
        if not user_r.data:
            raise HTTPException(status_code=404, detail=f"User '{target_email}' not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    # Check if another profile already has this github_username (case-insensitive)
    try:
        existing = sb.table("employee_work_profiles").select("employee_email").ilike(
            "github_username", body.github_username
        ).execute()
        if existing.data and existing.data[0]["employee_email"] != target_email:
            raise HTTPException(
                status_code=409,
                detail=f"GitHub username '{body.github_username}' is already linked to another employee",
            )
    except HTTPException:
        raise
    except Exception:
        pass

    # Upsert work profile
    row = {
        "employee_email": target_email,
        "github_username": body.github_username,
        "skills": [],
        "skill_embeddings": _embed(""),
        "total_commits": 0,
        "avg_code_quality": 0.0,
        "updated_at": _now(),
    }

    try:
        r = sb.table("employee_work_profiles").select("id").eq("employee_email", target_email).execute()
        if r.data:
            sb.table("employee_work_profiles").update({
                "github_username": body.github_username,
                "updated_at": _now(),
            }).eq("employee_email", target_email).execute()
            return {"status": "updated", "employee_email": target_email, "github_username": body.github_username}
        else:
            row["created_at"] = _now()
            sb.table("employee_work_profiles").insert(row).execute()
            return {"status": "created", "employee_email": target_email, "github_username": body.github_username}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/register-jira")
async def register_jira_account_id(
    body: RegisterJiraRequest,
    current_user: User = Depends(get_current_active_user),
):
    """
    Link a JIRA account ID to an employee profile.
    Employees register themselves. HR/Leadership can register on behalf of others.
    The JIRA account ID is used to assign tickets on JIRA when an assignment is approved.
    """
    sb = get_supabase_admin()

    target_email = current_user.email
    if body.target_email and current_user.role in (UserRole.HR, UserRole.LEADERSHIP):
        target_email = body.target_email

    # Verify target user exists
    try:
        user_r = sb.table("users").select("email").eq("email", target_email).execute()
        if not user_r.data:
            raise HTTPException(status_code=404, detail=f"User '{target_email}' not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    try:
        r = sb.table("employee_work_profiles").select("id").eq("employee_email", target_email).execute()
        if r.data:
            sb.table("employee_work_profiles").update({
                "jira_account_id": body.jira_account_id,
                "updated_at": _now(),
            }).eq("employee_email", target_email).execute()
            return {"status": "updated", "employee_email": target_email, "jira_account_id": body.jira_account_id}
        else:
            from ai.skill_matcher import _embed
            sb.table("employee_work_profiles").insert({
                "employee_email": target_email,
                "jira_account_id": body.jira_account_id,
                "skills": [],
                "skill_embeddings": _embed(""),
                "total_commits": 0,
                "avg_code_quality": 0.0,
                "created_at": _now(),
                "updated_at": _now(),
            }).execute()
            return {"status": "created", "employee_email": target_email, "jira_account_id": body.jira_account_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/{email}/skills")
async def update_skills_manually(
    email: str,
    body: ManualSkillsUpdate,
    current_user: User = Depends(require_role([UserRole.HR])),
):
    """HR can manually set an employee's skills (e.g. for employees without GitHub)."""
    from ai.skill_matcher import _embed

    sb = get_supabase_admin()
    try:
        skills_text = ", ".join(body.skills)
        new_emb = _embed(skills_text)

        r = sb.table("employee_work_profiles").select("id").eq("employee_email", email).execute()
        if r.data:
            sb.table("employee_work_profiles").update({
                "skills": body.skills,
                "skill_embeddings": new_emb,
                "updated_at": _now(),
            }).eq("employee_email", email).execute()
        else:
            sb.table("employee_work_profiles").insert({
                "employee_email": email,
                "github_username": None,
                "skills": body.skills,
                "skill_embeddings": new_emb,
                "total_commits": 0,
                "avg_code_quality": 0.0,
                "created_at": _now(),
                "updated_at": _now(),
            }).execute()

        return {"status": "updated", "employee_email": email, "skills": body.skills}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/{email}")
async def update_work_profile(
    email: str,
    body: ProfileUpdate,
    current_user: User = Depends(require_role([UserRole.HR])),
):
    """
    HR can update any employee's work profile.
    Embeddings are regenerated automatically when skills change.
    """
    from ai.skill_matcher import _embed

    sb = get_supabase_admin()

    updates: dict = {"updated_at": _now()}
    updated_fields: list[str] = []

    if body.github_username is not None:
        updates["github_username"] = body.github_username
        updated_fields.append("github_username")

    if body.jira_account_id is not None:
        updates["jira_account_id"] = body.jira_account_id
        updated_fields.append("jira_account_id")

    if body.skills is not None:
        updates["skills"] = body.skills
        # Regenerate embedding whenever the skill list changes
        skills_text = ", ".join(body.skills)
        updates["skill_embeddings"] = _embed(skills_text)
        updated_fields.append("skills")
        updated_fields.append("skill_embeddings")

    if body.profile_summary is not None:
        updates["profile_summary"] = body.profile_summary
        updated_fields.append("profile_summary")

    try:
        r = sb.table("employee_work_profiles").select("id").eq("employee_email", email).execute()
        if r.data:
            sb.table("employee_work_profiles").update(updates).eq("employee_email", email).execute()
        else:
            # Bootstrap a new profile for employees without one yet
            updates["employee_email"] = email
            if "skills" not in updates:
                updates["skills"] = []
                updates["skill_embeddings"] = _embed("")
            updates["total_commits"] = 0
            updates["avg_code_quality"] = 0.0
            updates["created_at"] = _now()
            sb.table("employee_work_profiles").insert(updates).execute()

        return {"status": "updated", "employee_email": email, "updated_fields": updated_fields}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
