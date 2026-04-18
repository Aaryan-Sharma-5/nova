from __future__ import annotations

from datetime import timedelta
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import requests

from api.deps import require_role
from core.database import get_supabase_admin
from integrations.jira_connector import JiraConnectionConfig, JiraMetrics, fetch_jira_metrics
from models.user import User, UserRole

router = APIRouter(prefix="/api/integrations", tags=["Integrations"])


def _is_live_jira_config(config: dict) -> bool:
    return bool(
        (config.get("base_url") or config.get("cloud_url"))
        and config.get("email")
        and config.get("api_token")
    )


class IntegrationConfigRequest(BaseModel):
    org_id: str = "demo-org"
    integration_type: str
    config: dict
    is_active: bool = True


class GoogleCalendarConnectRequest(BaseModel):
    org_id: str = "demo-org"
    access_token: str
    expires_in: int | None = None
    scope: str | None = None
    token_type: str | None = None


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _is_live_google_calendar_config(config: dict) -> bool:
    access_token = str(config.get("access_token") or "").strip()
    if not access_token:
        return False

    expires_at = _parse_iso_datetime(config.get("expires_at"))
    if expires_at is not None and expires_at <= datetime.now(timezone.utc):
        return False

    return True


def _validate_google_calendar_token(access_token: str) -> dict[str, Any]:
    response = requests.get(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        params={"maxResults": 1},
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )

    if response.status_code >= 400:
        detail = "Unable to validate Google Calendar access token."
        try:
            payload = response.json()
            if isinstance(payload, dict):
                detail = str(payload.get("error", {}).get("message") or payload.get("error_description") or detail)
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=detail)

    try:
        payload = response.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid Google Calendar validation response: {exc}") from exc

    items = payload.get("items") if isinstance(payload, dict) else []
    return {
        "calendar_count": len(items) if isinstance(items, list) else 0,
    }


def _latest_integration_row(supabase, integration_type: str, org_id: str) -> dict | None:
    response = (
        supabase.table("integration_configs")
        .select("integration_type,is_active,last_sync_at,config,created_at,created_by,org_id")
        .eq("integration_type", integration_type)
        .eq("org_id", org_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def _google_calendar_status_from_row(row: dict | None) -> dict[str, Any]:
    if not row:
        return {
            "connected": False,
            "last_sync_at": None,
            "mode": "google_oauth_not_connected",
            "expires_at": None,
            "calendar_count": 0,
            "scope": None,
        }

    config = row.get("config") or {}
    connected = bool(row.get("is_active")) and _is_live_google_calendar_config(config)
    expires_at = config.get("expires_at") if isinstance(config, dict) else None
    return {
        "connected": connected,
        "last_sync_at": row.get("last_sync_at"),
        "mode": "google_oauth_token" if connected else "google_oauth_expired",
        "expires_at": expires_at,
        "calendar_count": int(config.get("calendar_count") or 0) if isinstance(config, dict) else 0,
        "scope": config.get("scope") if isinstance(config, dict) else None,
    }


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
        "google_calendar": {"connected": False, "last_sync_at": None, "mode": "google_oauth_not_connected"},
        "hrms_sap": {"connected": False, "last_sync_at": None, "mode": "coming_soon"},
    }

    try:
        response = (
            supabase.table("integration_configs")
            .select("integration_type,is_active,last_sync_at,config")
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        for row in response.data or []:
            key = str(row.get("integration_type", "")).lower()
            if key in statuses:
                statuses[key]["connected"] = bool(row.get("is_active"))
                statuses[key]["last_sync_at"] = row.get("last_sync_at")
                if key == "jira" and _is_live_jira_config(row.get("config") or {}):
                    statuses[key]["mode"] = "live_configured"
            if key == "google_calendar":
                statuses[key] = _google_calendar_status_from_row(row)
    except Exception:
        pass

    return statuses


@router.get("/google-calendar/status")
async def google_calendar_status(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict:
    supabase = get_supabase_admin()
    row = _latest_integration_row(supabase, "google_calendar", "default-org")
    return _google_calendar_status_from_row(row)


@router.post("/google-calendar/connect")
async def connect_google_calendar(
    payload: GoogleCalendarConnectRequest,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict:
    if not payload.access_token.strip():
        raise HTTPException(status_code=400, detail="Google Calendar access token is required.")

    validation = _validate_google_calendar_token(payload.access_token)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=payload.expires_in)
        if payload.expires_in and payload.expires_in > 0
        else None
    )

    config = {
        "access_token": payload.access_token,
        "scope": payload.scope,
        "token_type": payload.token_type or "Bearer",
        "expires_at": expires_at.isoformat() if expires_at else None,
        "calendar_count": validation["calendar_count"],
    }

    row = {
        "org_id": payload.org_id,
        "integration_type": "google_calendar",
        "config": config,
        "is_active": True,
        "created_by": current_user.email,
        "last_sync_at": datetime.now(timezone.utc).isoformat(),
    }

    supabase = get_supabase_admin()
    try:
        supabase.table("integration_configs").insert(row).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to save Google Calendar connection: {exc}") from exc

    return {
        "status": "connected",
        "integration": "google_calendar",
        "connected_at": row["last_sync_at"],
        "last_sync_at": row["last_sync_at"],
        "expires_at": config["expires_at"],
        "calendar_count": config["calendar_count"],
        "scope": config["scope"],
        "mode": "google_oauth_token",
    }


@router.post("/jira/sync")
async def trigger_jira_sync(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    supabase = get_supabase_admin()
    mode = "mock"
    message = "Mock Jira sync started. Configure Jira cloud URL, email, and API token for live mode."

    try:
        latest = (
            supabase.table("integration_configs")
            .select("config,is_active")
            .eq("integration_type", "jira")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        row = (latest.data or [None])[0]
        if row and bool(row.get("is_active")) and _is_live_jira_config(row.get("config") or {}):
            mode = "live_configured"
            message = "Jira sync requested using saved live credentials."
    except Exception:
        pass

    return {
        "status": "started",
        "integration": "jira",
        "mode": mode,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "message": message,
    }
