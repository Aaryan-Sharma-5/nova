"""Dataset parameter schema metadata endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from api.deps import require_role
from core.data_schema import parameter_definitions
from models.user import User, UserRole

router = APIRouter(prefix="/api/schema", tags=["Schema"])


@router.get("/parameters")
async def get_parameter_schema(
    _current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    """Return canonical employee parameter list and documentation metadata."""
    params = parameter_definitions()
    return {
        "parameters": params,
        "parameter_count": len(params),
        "notes": "Use these definitions to render Data Sources and completeness panels in UI.",
    }
