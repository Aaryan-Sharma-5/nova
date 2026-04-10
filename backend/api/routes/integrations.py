from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import require_role
from core.database import get_supabase_admin
from integrations.jira_connector import JiraConnectionConfig, JiraMetrics, fetch_jira_metrics
from models.user import User, UserRole

router = APIRouter(prefix="/api/integrations", tags=["Integrations"])


class IntegrationConfigRequest(BaseModel):
    org_id: str = "demo-org"
    integration_type: str
    config: dict
    is_active: bool = True


@router.get("/jira/metrics/{employee_id}", response_model=JiraMetrics)
async def jira_metrics(
    employee_id: str,
    _current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.HR, UserRole.LEADERSHIP])),
) -> JiraMetrics:
    return fetch_jira_metrics(employee_id)


@router.get("/jira/team/{department}")
async def jira_team_health(
    department: str,
    _current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    members = [f"{department}-emp-{i}" for i in range(1, 8)]
    metrics = [fetch_jira_metrics(member) for member in members]
    if not metrics:
        return {"department": department, "team_size": 0}

    return {
        "department": department,
        "team_size": len(metrics),
        "avg_sprint_velocity": round(sum(m.sprint_velocity for m in metrics) / len(metrics), 2),
        "total_overdue": sum(m.tickets_overdue for m in metrics),
        "avg_resolution_hours": round(sum(m.avg_ticket_resolution_hours for m in metrics) / len(metrics), 2),
        "avg_pr_participation": round(sum(m.pr_review_participation_rate for m in metrics) / len(metrics), 2),
        "signals": [m.model_dump() for m in metrics],
    }


@router.post("/config")
async def save_integration_config(
    payload: IntegrationConfigRequest,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    supabase = get_supabase_admin()

    if payload.integration_type.lower() == "jira":
        JiraConnectionConfig.model_validate(payload.config)

    row = {
        "org_id": payload.org_id,
        "integration_type": payload.integration_type.lower(),
        "config": payload.config,
        "is_active": payload.is_active,
        "created_by": current_user.email,
        "last_sync_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        supabase.table("integration_configs").insert(row).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to save integration config: {exc}") from exc

    return {"status": "saved", "integration_type": payload.integration_type.lower()}


@router.get("/status")
async def integration_status(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict:
    supabase = get_supabase_admin()
    statuses = {
        "jira": {"connected": False, "last_sync_at": None, "mode": "mock"},
        "slack": {"connected": False, "last_sync_at": None, "mode": "coming_soon"},
        "google_calendar": {"connected": False, "last_sync_at": None, "mode": "coming_soon"},
        "hrms_sap": {"connected": False, "last_sync_at": None, "mode": "coming_soon"},
    }

    try:
        response = (
            supabase.table("integration_configs")
            .select("integration_type,is_active,last_sync_at")
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        for row in response.data or []:
            key = str(row.get("integration_type", "")).lower()
            if key in statuses:
                statuses[key]["connected"] = bool(row.get("is_active"))
                statuses[key]["last_sync_at"] = row.get("last_sync_at")
    except Exception:
        pass

    return statuses


@router.post("/jira/sync")
async def trigger_jira_sync(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    return {
        "status": "started",
        "integration": "jira",
        "mode": "mock",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "message": "Mock Jira sync started. Replace connector with real API for production.",
    }
