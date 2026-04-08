"""Audit reason and log retrieval endpoints."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from api.deps import require_any_authenticated, require_role
from core.audit import register_access_reason
from core.database import get_supabase_admin
from models.user import User, UserRole

router = APIRouter(prefix="/api/audit", tags=["Audit"])


class AccessReasonRequest(BaseModel):
    action: str = Field(default="read", min_length=1, max_length=32)
    resource_type: str = Field(..., min_length=1, max_length=64)
    resource_id: str = Field(..., min_length=1, max_length=256)
    reason: str = Field(..., min_length=3, max_length=500)


@router.post("/reason")
async def attach_access_reason(
    payload: AccessReasonRequest,
    current_user: User = Depends(require_any_authenticated),
) -> dict:
    await register_access_reason(
        user_id=current_user.email,
        action=payload.action.strip().lower(),
        resource_type=payload.resource_type.strip().lower(),
        resource_id=payload.resource_id.strip(),
        reason=payload.reason.strip(),
    )
    return {"status": "ok", "message": "Reason attached for next matching access event"}


@router.get("/logs")
async def list_audit_logs(
    action: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    start_ts: datetime | None = Query(default=None),
    end_ts: datetime | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    _current_user: User = Depends(require_role([UserRole.LEADERSHIP])),
) -> dict:
    supabase = get_supabase_admin()

    try:
        query = (
            supabase.table("audit_log")
            .select("*")
            .order("timestamp", desc=True)
            .limit(limit)
        )

        if action:
            query = query.eq("action", action)
        if resource_type:
            query = query.eq("resource_type", resource_type)
        if user_id:
            query = query.eq("user_id", user_id)
        if start_ts:
            query = query.gte("timestamp", start_ts.isoformat())
        if end_ts:
            query = query.lte("timestamp", end_ts.isoformat())

        response = query.execute()
        rows = response.data or []
        return {"items": rows, "count": len(rows)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read audit logs: {exc}") from exc
