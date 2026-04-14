"""
NOVA Webhook Routes

POST /api/webhook/jira   — receives Jira issue_created / sprint events
POST /api/webhook/github — receives GitHub push events

Both endpoints are intentionally unauthenticated (Jira/GitHub sign the
payload; you can add HMAC validation later via X-Hub-Signature-256).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from ai.commit_analyzer import analyze_commit
from ai.skill_matcher import (
    evaluate_best_candidate,
    extract_required_skills,
    find_matching_employees,
    generate_job_posting,
)
from core.database import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhook", tags=["Webhooks"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_setting(sb, key: str, default: Any = None) -> Any:
    try:
        r = sb.table("nova_settings").select("value").eq("org_id", "default").eq("key", key).execute()
        if r.data:
            return r.data[0]["value"]
    except Exception:
        pass
    return default


def _get_all_work_profiles(sb) -> list[dict]:
    try:
        r = sb.table("employee_work_profiles").select("*").execute()
        return r.data or []
    except Exception:
        return []


async def _create_job_posting(sb, jira_key: str, assignment_id: str | None,
                               task_title: str, task_desc: str,
                               required_skills: list[str], reasoning: str) -> str | None:
    posting = await generate_job_posting(task_title, task_desc, required_skills)
    row = {
        "jira_issue_key": jira_key,
        "jira_task_assignment_id": assignment_id,
        "title": posting["title"],
        "description": posting["description"],
        "required_skills": required_skills,
        "workplace_type": "HYBRID",
        "employment_type": "FULL_TIME",
        "status": "limbo",
        "ai_reasoning": reasoning or posting["reasoning"],
        "created_at": _now(),
        "updated_at": _now(),
    }
    try:
        r = sb.table("job_postings").insert(row).execute()
        return r.data[0]["id"] if r.data else None
    except Exception as exc:
        logger.error("Failed to create job posting: %s", exc)
        return None


# ── JIRA Webhook ──────────────────────────────────────────────────────────────

@router.post("/jira")
async def handle_jira_webhook(request: Request):
    """
    Handles Jira webhooks.

    Supported events:
    - jira:issue_created  →  extract skills → match employees → put in HR limbo
                             if no match → create job posting in limbo
    - sprint_created / sprint_started → acknowledged
    """
    try:
        body = await request.body()
        data: dict = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = data.get("webhookEvent", "unknown")
    logger.info("Jira webhook received: %s", event)

    sb = get_supabase_admin()

    if event == "jira:issue_created":
        return await _handle_issue_created(data, sb)

    if event in ("sprint_created", "sprint_started"):
        sprint = data.get("sprint", {})
        return {"status": "acknowledged", "event": event, "sprint": sprint.get("name")}

    return {"status": "acknowledged", "event": event, "message": "Event not processed"}


async def _handle_issue_created(data: dict, sb) -> dict:
    issue = data.get("issue", {})
    fields = issue.get("fields", {})

    issue_key = issue.get("key", "UNKNOWN")
    title = fields.get("summary", "Untitled")
    description = fields.get("description") or title
    priority = (fields.get("priority") or {}).get("name", "Medium")
    issue_type = (fields.get("issuetype") or {}).get("name", "Task")
    project_name = (fields.get("project") or {}).get("name", "Unknown Project")

    logger.info("Processing Jira issue: %s — %s", issue_key, title)

    # 1. Extract required skills
    required_skills = await extract_required_skills(title, description, project_name)
    logger.info("Required skills: %s", required_skills)

    # 2. Fetch all employee work profiles for matching
    profiles = _get_all_work_profiles(sb)

    # 3. Check auto-approve settings
    auto_approve = _get_setting(sb, "auto_approve_assignments", False)
    auto_threshold = float(_get_setting(sb, "auto_approve_threshold", 0.85) or 0.85)

    if not profiles:
        # No employees at all — straight to job posting
        posting_id = await _create_job_posting(
            sb, issue_key, None, title, description, required_skills,
            "No employee work profiles found in the system."
        )
        return {
            "status": "job_posting_created",
            "issue_key": issue_key,
            "reason": "no_employees",
            "job_posting_id": posting_id,
        }

    # 4. Find matching employees
    candidates = find_matching_employees(required_skills, f"{title}. {description}", profiles, top_n=5)

    if not candidates:
        posting_id = await _create_job_posting(
            sb, issue_key, None, title, description, required_skills,
            "No employees with relevant skills found."
        )
        return {
            "status": "job_posting_created",
            "issue_key": issue_key,
            "reason": "no_skill_match",
            "job_posting_id": posting_id,
        }

    # 5. LLM evaluation
    evaluation = await evaluate_best_candidate(candidates, title, description, required_skills)
    selected_email = evaluation.get("selected_email")
    selected_name = evaluation.get("selected_name")
    confidence = evaluation.get("confidence", 0.0)
    reasoning = evaluation.get("reasoning", "")

    if not selected_email:
        # LLM rejected all candidates
        posting_id = await _create_job_posting(
            sb, issue_key, None, title, description, required_skills,
            f"LLM rejected all candidates: {reasoning}"
        )
        return {
            "status": "job_posting_created",
            "issue_key": issue_key,
            "reason": "llm_rejected_all",
            "llm_reasoning": reasoning,
            "job_posting_id": posting_id,
        }

    # 6. Create assignment record in limbo
    best = next((c for c in candidates if (c.get("employee_email") or c.get("email")) == selected_email), candidates[0])
    match_score = best.get("match_score", confidence)

    assignment_status = "pending"
    if auto_approve and match_score >= auto_threshold:
        assignment_status = "auto_approved"

    assignment_row = {
        "jira_issue_key": issue_key,
        "jira_issue_title": title,
        "jira_issue_description": description[:2000],
        "project_name": project_name,
        "issue_type": issue_type,
        "priority": priority,
        "required_skills": required_skills,
        "recommended_assignee_email": selected_email,
        "recommended_assignee_name": selected_name,
        "match_score": round(match_score, 4),
        "ai_reasoning": reasoning,
        "status": assignment_status,
        "raw_webhook_data": data,
        "created_at": _now(),
        "updated_at": _now(),
    }

    assignment_id = None
    try:
        r = sb.table("jira_task_assignments").insert(assignment_row).execute()
        if r.data:
            assignment_id = r.data[0]["id"]
    except Exception as exc:
        logger.error("Failed to save assignment: %s", exc)

    return {
        "status": assignment_status,
        "issue_key": issue_key,
        "assignment_id": assignment_id,
        "recommended_assignee": selected_name,
        "recommended_assignee_email": selected_email,
        "match_score": match_score,
        "confidence": confidence,
        "required_skills": required_skills,
        "auto_approved": assignment_status == "auto_approved",
    }


# ── GitHub Webhook ────────────────────────────────────────────────────────────

@router.post("/github")
async def handle_github_webhook(request: Request):
    """
    Handles GitHub webhooks.

    Supported events (via X-GitHub-Event header):
    - push  →  analyse diff → update employee work profile
    - pull_request → acknowledged

    The pusher's GitHub username must match a row in employee_work_profiles.
    """
    event_type = request.headers.get("X-GitHub-Event", "unknown")

    try:
        body = await request.body()
        data: dict = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    logger.info("GitHub webhook received: %s", event_type)

    if event_type == "push":
        return await _handle_push(data)

    if event_type == "pull_request":
        pr = data.get("pull_request", {})
        return {"status": "acknowledged", "event": event_type, "pr": pr.get("number")}

    return {"status": "acknowledged", "event": event_type}


async def _handle_push(data: dict) -> dict:
    sb = get_supabase_admin()

    github_username: str | None = (data.get("pusher") or {}).get("name")
    if not github_username:
        return {"status": "ignored", "reason": "no_github_username"}

    # Look up employee by github_username
    try:
        r = sb.table("employee_work_profiles").select("*").eq("github_username", github_username).execute()
        profile = r.data[0] if r.data else None
    except Exception:
        profile = None

    if not profile:
        logger.info("No work profile for GitHub user '%s' — ignored", github_username)
        return {"status": "ignored", "reason": f"No NOVA employee linked to GitHub user '{github_username}'"}

    employee_email: str = profile["employee_email"]
    repo_data = data.get("repository", {})
    repository = repo_data.get("name", "unknown")
    ref = data.get("ref", "refs/heads/main")
    branch = ref.split("/")[-1] if "/" in ref else ref
    commits: list[dict] = data.get("commits", [])

    if not commits:
        return {"status": "acknowledged", "reason": "no_commits"}

    # Aggregate all commit diffs
    all_diffs: list[str] = [c.get("diff", "") for c in commits if c.get("diff")]
    all_messages = [c.get("message", "") for c in commits]
    combined_diff = "\n|||---|||\n".join(all_diffs)
    combined_message = "\n".join(all_messages)

    lines_added = sum(1 for line in combined_diff.split("\n") if line.startswith("+") and not line.startswith("+++"))
    lines_deleted = sum(1 for line in combined_diff.split("\n") if line.startswith("-") and not line.startswith("---"))
    files_changed = len(commits)

    # AI analysis
    analysis = await analyze_commit(combined_message, combined_diff, repository)

    # Persist commit analysis
    commit_row = {
        "employee_email": employee_email,
        "github_username": github_username,
        "commit_hash": (commits[-1].get("id") or commits[-1].get("sha") or "unknown")[:40],
        "commit_message": combined_message[:1000],
        "repository": repository,
        "branch": branch,
        "diff_summary": analysis["summary"],
        "skills_demonstrated": analysis["skills_demonstrated"],
        "code_quality_score": analysis["code_quality_score"],
        "code_quality_label": analysis["code_quality_label"],
        "complexity": analysis["complexity"],
        "impact": analysis["impact"],
        "quality_reasoning": analysis["quality_reasoning"],
        "lines_added": lines_added,
        "lines_deleted": lines_deleted,
        "files_changed": files_changed,
        "committed_at": commits[-1].get("timestamp") or _now(),
        "created_at": _now(),
    }

    try:
        sb.table("commit_analyses").insert(commit_row).execute()
    except Exception as exc:
        logger.error("Failed to save commit analysis: %s", exc)

    # Update the employee's work profile
    profile_updated = await _update_work_profile(sb, employee_email, profile, analysis)

    return {
        "status": "processed",
        "employee_email": employee_email,
        "github_username": github_username,
        "repository": repository,
        "branch": branch,
        "commits_analysed": len(commits),
        "analysis": {
            "summary": analysis["summary"],
            "skills_demonstrated": analysis["skills_demonstrated"],
            "code_quality_score": analysis["code_quality_score"],
            "code_quality_label": analysis["code_quality_label"],
        },
        "profile_updated": profile_updated,
    }


async def _update_work_profile(sb, email: str, profile: dict, analysis: dict) -> dict:
    """
    Merge new skills from commit into the employee's work profile.
    Recalculate avg_code_quality as a rolling average.
    """
    from ai.skill_matcher import _embed

    current_skills: list[str] = profile.get("skills") or []
    new_skills: list[str] = analysis.get("skills_demonstrated") or []
    new_quality: float = analysis.get("code_quality_score", 50.0)
    total_commits: int = int(profile.get("total_commits") or 0)
    avg_quality: float = float(profile.get("avg_code_quality") or 50.0)

    # Merge skills (dedup, preserve order)
    merged_skills = list(dict.fromkeys(current_skills + [s for s in new_skills if s not in current_skills]))

    # Rolling average quality
    new_total = total_commits + 1
    new_avg_quality = ((avg_quality * total_commits) + new_quality) / new_total

    # Recompute embedding for merged skills
    skills_text = ", ".join(merged_skills)
    new_embedding = _embed(skills_text)

    skills_added = [s for s in new_skills if s not in current_skills]

    update = {
        "skills": merged_skills,
        "skill_embeddings": new_embedding,
        "total_commits": new_total,
        "avg_code_quality": round(new_avg_quality, 2),
        "last_commit_at": _now(),
        "updated_at": _now(),
    }

    try:
        sb.table("employee_work_profiles").update(update).eq("employee_email", email).execute()
        # Mark the commit as having triggered profile update if skills were added
        if skills_added:
            try:
                sb.table("commit_analyses").update({"triggered_profile_update": True}).eq(
                    "employee_email", email
                ).order("created_at", desc=True).limit(1).execute()
            except Exception:
                pass
    except Exception as exc:
        logger.error("Failed to update work profile for %s: %s", email, exc)
        return {"updated": False, "error": str(exc)}

    return {
        "updated": True,
        "skills_added": skills_added,
        "total_commits": new_total,
        "new_avg_quality": round(new_avg_quality, 2),
    }
