from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from api.deps import require_role
from core.employee_directory import get_employee_directory, get_org_hierarchy_tree, get_org_level_counts
from models.user import User, UserRole

router = APIRouter(prefix="/api/org", tags=["Org"])


@router.get("/hierarchy")
async def get_org_hierarchy(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict[str, Any]:
    return {
        "root": get_org_hierarchy_tree(),
        "counts": get_org_level_counts(),
        "total_employees": len(get_employee_directory()),
    }