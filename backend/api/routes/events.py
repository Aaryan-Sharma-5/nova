"""Events and causality API endpoints."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from ai.events_causality import (
    EventCorrelation,
    EventCreate,
    EventRecord,
    create_event,
    get_event_correlations,
    list_events,
)
from api.deps import require_role
from models.user import User, UserRole

router = APIRouter(prefix="/events", tags=["Events"])


def _analytics_role_dependency() -> Depends:
    return Depends(require_role([UserRole.HR, UserRole.MANAGER, UserRole.LEADERSHIP]))


@router.post("", response_model=EventRecord)
async def create_event_endpoint(
    payload: EventCreate,
    _current_user: User = _analytics_role_dependency(),
) -> EventRecord:
    try:
        return create_event(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create event: {exc}") from exc


@router.get("", response_model=list[EventRecord])
async def list_events_endpoint(
    event_type: str | None = Query(default=None),
    affected_department: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    _current_user: User = _analytics_role_dependency(),
) -> list[EventRecord]:
    try:
        return list_events(
            event_type=event_type,
            affected_department=affected_department,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list events: {exc}") from exc


@router.get("/correlations", response_model=list[EventCorrelation])
async def get_event_correlations_endpoint(
    event_type: str | None = Query(default=None),
    affected_department: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    _current_user: User = _analytics_role_dependency(),
) -> list[EventCorrelation]:
    try:
        return get_event_correlations(
            event_type=event_type,
            affected_department=affected_department,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to compute correlations: {exc}") from exc
