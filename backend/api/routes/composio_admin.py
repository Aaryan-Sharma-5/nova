"""
Composio app connection management — HR / Leadership only.

POST   /api/composio/connect            — initiate OAuth for an external app
DELETE /api/composio/disconnect/{org}/{app} — deactivate a connection
GET    /api/composio/status/{org_id}    — list connection states for an org
"""
from __future__ import annotations

import asyncio
import logging
import time

from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from api.deps import require_role
from core.config import settings
from core.database import get_supabase_admin
from integrations.composio.app_registry import SUPPORTED_APPS
from integrations.composio.client import get_admin_toolset, get_connection_state
from models.user import User, UserRole

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/composio", tags=["Composio"])


def _initiate_connection(org_id: str, app_name: str):
    toolset = get_admin_toolset()
    entity = toolset.get_entity(id=org_id)
    return entity.initiate_connection(app_name=app_name)


async def _initiate_connection_with_retry(org_id: str, app_name: str):
    """Retry transient timeouts when initiating external OAuth connection."""
    attempts = max(1, int(settings.COMPOSIO_CONNECT_MAX_ATTEMPTS))
    timeout_seconds = max(5, int(settings.COMPOSIO_CONNECT_TIMEOUT_SECONDS))
    last_timeout_error: asyncio.TimeoutError | None = None

    for attempt in range(1, attempts + 1):
        started_at = time.perf_counter()
        try:
            result = await asyncio.wait_for(
                run_in_threadpool(_initiate_connection, org_id, app_name),
                timeout=timeout_seconds,
            )
            elapsed = round(time.perf_counter() - started_at, 2)
            logger.info(
                "[Composio] initiate_connection succeeded org=%s app=%s attempt=%s elapsed_s=%s",
                org_id,
                app_name,
                attempt,
                elapsed,
            )
            return result
        except asyncio.TimeoutError as exc:
            last_timeout_error = exc
            elapsed = round(time.perf_counter() - started_at, 2)
            logger.warning(
                "[Composio] initiate_connection timeout org=%s app=%s attempt=%s/%s timeout_s=%s elapsed_s=%s",
                org_id,
                app_name,
                attempt,
                attempts,
                timeout_seconds,
                elapsed,
            )

    raise last_timeout_error if last_timeout_error is not None else asyncio.TimeoutError()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConnectAppRequest(BaseModel):
    app_name: str
    org_id: str

    @field_validator("app_name")
    @classmethod
    def validate_app(cls, v: str) -> str:
        v = v.lower()
        if v not in SUPPORTED_APPS:
            raise ValueError(f"Unsupported app '{v}'. Supported: {sorted(SUPPORTED_APPS)}")
        return v


class ConnectAppResponse(BaseModel):
    redirect_url: str
    connection_id: str
    message: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/connect", response_model=ConnectAppResponse)
async def connect_app(
    payload: ConnectAppRequest,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
):
    """
    Initiates the Composio OAuth flow for an external app.
    Returns a redirect_url — the HR admin opens it to complete authorization.
    If an active connection already exists, returns it immediately without creating a new one.
    If a pending connection exists (redirect_url available), returns that so the user can resume.
    """
    # Check if already connected or pending — avoid creating duplicate OAuth flows
    try:
        existing = get_connection_state(payload.org_id, payload.app_name)
        if existing.get("is_active"):
            return ConnectAppResponse(
                redirect_url="",
                connection_id=existing.get("connection_id") or "",
                message=f"{payload.app_name} is already connected and active.",
            )
        if existing.get("is_pending") and existing.get("redirect_url"):
            return ConnectAppResponse(
                redirect_url=existing["redirect_url"],
                connection_id=existing.get("connection_id") or "",
                message=f"Existing {payload.app_name} authorization in progress. Open redirect_url to complete.",
            )
    except Exception as _check_exc:
        logger.debug("[Composio] pre-connect state check failed (non-fatal): %s", _check_exc)

    try:
        conn_request = await _initiate_connection_with_retry(payload.org_id, payload.app_name)
    except asyncio.TimeoutError:
        logger.warning(
            "[Composio] initiate_connection timed out org=%s app=%s attempts=%s timeout_s=%s",
            payload.org_id,
            payload.app_name,
            settings.COMPOSIO_CONNECT_MAX_ATTEMPTS,
            settings.COMPOSIO_CONNECT_TIMEOUT_SECONDS,
        )
        raise HTTPException(
            status_code=504,
            detail=(
                "Composio request timed out. "
                "Please retry in a few seconds and verify outbound network access to Composio."
            ),
        )
    except RuntimeError as exc:
        logger.warning("[Composio] configuration error: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        message = "Composio service is currently unavailable"
        exc_text = str(exc).lower()
        if "apikey" in exc.__class__.__name__.lower() or "api key" in exc_text:
            message = "Composio authentication failed. Verify COMPOSIO_API_KEY"
        logger.warning("[Composio] initiate_connection failed: %s", exc)
        raise HTTPException(status_code=502, detail=message)

    redirect_url = getattr(conn_request, "redirectUrl", None) or ""
    connection_id = getattr(conn_request, "connectedAccountId", None) or ""

    sb = get_supabase_admin()
    try:
        sb.table("composio_connections").upsert(
            {
                "org_id":             payload.org_id,
                "app_name":           payload.app_name,
                "composio_entity_id": payload.org_id,
                "connection_id":      connection_id,
                "connected_by":       None,   # UUID not available without id field on User
                "is_active":          False,
            },
            on_conflict="org_id,app_name",
        ).execute()
    except Exception as exc:
        logger.warning("[Composio] Failed to persist connection record: %s", exc)

    return ConnectAppResponse(
        redirect_url=redirect_url,
        connection_id=connection_id,
        message=f"Open redirect_url to complete {payload.app_name} authorization.",
    )


@router.delete("/disconnect/{org_id}/{app_name}")
async def disconnect_app(
    org_id: str,
    app_name: str,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
):
    """Deactivates a Composio connection. Does not revoke the OAuth token at source."""
    if app_name.lower() not in SUPPORTED_APPS:
        raise HTTPException(status_code=400, detail=f"Unknown app '{app_name}'")

    sb = get_supabase_admin()
    sb.table("composio_connections").update({"is_active": False}).eq("org_id", org_id).eq(
        "app_name", app_name.lower()
    ).execute()
    return {"status": "disconnected", "org_id": org_id, "app_name": app_name}


@router.get("/status/{org_id}")
async def connection_status(
    org_id: str,
    current_user: User = Depends(
        require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])
    ),
):
    """Returns all Composio connection states for the given org."""
    sb = get_supabase_admin()
    rows = (
        sb.table("composio_connections")
        .select("app_name, is_active, last_synced_at, connected_at, connection_id")
        .eq("org_id", org_id)
        .execute()
    ).data or []

    enriched: list[dict] = []
    for row in rows:
        app_name = (row.get("app_name") or "").lower()
        if not app_name:
            continue

        state = get_connection_state(org_id, app_name)
        merged = dict(row)

        # If live lookup fails, keep DB-backed state but expose UNKNOWN status.
        if state.get("lookup_error"):
            merged["connection_status"] = "UNKNOWN"
            merged["is_pending"] = False
            enriched.append(merged)
            continue

        merged["is_active"] = bool(state.get("is_active"))
        merged["connection_status"] = state.get("status")
        merged["is_pending"] = bool(state.get("is_pending"))
        if state.get("connection_id"):
            merged["connection_id"] = state.get("connection_id")
        if state.get("redirect_url"):
            merged["redirect_url"] = state.get("redirect_url")

        try:
            update_payload: dict = {"is_active": merged["is_active"]}
            if merged.get("connection_id"):
                update_payload["connection_id"] = merged["connection_id"]
            sb.table("composio_connections").update(update_payload).eq("org_id", org_id).eq(
                "app_name", app_name
            ).execute()
        except Exception as exc:
            logger.warning("[Composio] Failed to refresh connection state for %s: %s", app_name, exc)

        enriched.append(merged)

    return {"org_id": org_id, "connections": enriched}
