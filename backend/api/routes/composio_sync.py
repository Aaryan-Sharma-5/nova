"""
Manual sync trigger — HR / Leadership only.

POST /api/composio/sync/trigger  — kick off async data pull for selected apps
GET  /api/composio/sync/signals  — query stored signals for an employee
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator

from api.deps import require_role
from core.database import get_supabase_admin
from integrations.composio.app_registry import SUPPORTED_APPS
from integrations.composio.client import get_connection_state
from models.user import User, UserRole
from services.ingestion_service import IngestionService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/composio/sync", tags=["Composio"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class SyncRequest(BaseModel):
    org_id: str
    entity_id: str
    apps: list[str]
    since_hours: int = 24

    @field_validator("apps")
    @classmethod
    def validate_apps(cls, v: list[str]) -> list[str]:
        invalid = [a for a in v if a.lower() not in SUPPORTED_APPS]
        if invalid:
            raise ValueError(f"Unsupported apps: {invalid}. Supported: {sorted(SUPPORTED_APPS)}")
        return [a.lower() for a in v]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/trigger")
async def trigger_sync(
    payload: SyncRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
):
    """
    Enqueues an async data pull from the requested apps.
    Returns immediately; sync runs in the background.
    """
    blocked_apps: list[str] = []
    for app in payload.apps:
        state = get_connection_state(payload.entity_id, app)
        # If lookup fails, do not block the request; background task may still succeed.
        if state.get("lookup_error"):
            continue
        if not state.get("is_active"):
            status = str(state.get("status") or "MISSING").upper()
            if state.get("is_pending"):
                blocked_apps.append(f"{app} (authorization pending)")
            else:
                blocked_apps.append(f"{app} ({status.lower()})")

    if blocked_apps:
        raise HTTPException(
            status_code=412,
            detail=(
                "Composio app connection is not active: "
                + ", ".join(blocked_apps)
                + ". Complete OAuth and refresh status before syncing."
            ),
        )

    background_tasks.add_task(
        _run_sync,
        payload.org_id,
        payload.entity_id,
        payload.apps,
        payload.since_hours,
    )
    return {
        "status": "sync_started",
        "org_id": payload.org_id,
        "apps": payload.apps,
        "since_hours": payload.since_hours,
    }


@router.get("/signals")
async def get_signals(
    org_id: str = Query(...),
    employee_email: str = Query(...),
    days: int = Query(default=14, ge=1, le=90),
    current_user: User = Depends(
        require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])
    ),
):
    """
    Returns aggregated signal counts for an employee.
    Only metadata counts are returned — no raw content.
    """
    svc = IngestionService(org_id=org_id, entity_id=org_id)
    aggregates = svc.compute_signal_aggregates(employee_email, days=days)

    sb = get_supabase_admin()
    from datetime import datetime, timedelta, timezone
    since = (datetime.now(tz=timezone.utc) - timedelta(days=days)).isoformat()
    try:
        rows = (
            sb.table("external_signals")
            .select("source, signal_type, occurred_at, after_hours")
            .eq("org_id", org_id)
            .eq("employee_email", employee_email)
            .gte("occurred_at", since)
            .order("occurred_at", desc=True)
            .limit(200)
            .execute()
        ).data or []
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {
        "employee_email": employee_email,
        "days": days,
        "aggregates": aggregates,
        "signals": rows,
    }


# ── Background task ───────────────────────────────────────────────────────────

async def _run_sync(org_id: str, entity_id: str, apps: list[str], since_hours: int) -> None:
    svc = IngestionService(org_id=org_id, entity_id=entity_id)
    results: dict[str, object] = {}
    for app in apps:
        state = get_connection_state(entity_id, app)
        if not state.get("lookup_error") and not state.get("is_active"):
            status = str(state.get("status") or "MISSING").upper()
            results[app] = f"skipped: connection not active ({status.lower()})"
            logger.warning(
                "[Composio] skipping sync org=%s app=%s because connection status=%s",
                org_id,
                app,
                status,
            )
            continue

        try:
            if app == "slack":
                results["slack"] = await svc.sync_slack_with_sentiment(since_hours)
            elif app == "gmail":
                results["gmail"] = await svc.sync_gmail(since_hours)
            elif app == "gcal":
                # gcal requires employee email — skip here, use scheduler per-employee
                results["gcal"] = "skipped (use per-employee sync)"
            elif app == "github":
                results["github"] = "skipped (use per-employee sync with repos list)"
        except Exception as exc:
            results[app] = f"error: {exc}"
            logger.error("[Composio] sync error org=%s app=%s: %s", org_id, app, exc)

    logger.info("[Composio] Sync complete org=%s results=%s", org_id, results)
