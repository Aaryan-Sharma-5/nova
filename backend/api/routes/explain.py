"""XAI explainability endpoints for dashboard score figures."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ai.explainability import explain_score
from api.deps import require_role
from models.user import User, UserRole

router = APIRouter(prefix="/api/explain", tags=["Explainability"])


@router.get("/burnout/{employee_id}")
async def explain_burnout(
    employee_id: str,
    _current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    return explain_score(employee_id, "burnout")


@router.get("/attrition/{employee_id}")
async def explain_attrition(
    employee_id: str,
    _current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    return explain_score(employee_id, "attrition")


@router.get("/engagement/{employee_id}")
async def explain_engagement(
    employee_id: str,
    _current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    return explain_score(employee_id, "engagement")
