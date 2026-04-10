from __future__ import annotations

import random

from fastapi import APIRouter, Depends

from api.deps import require_role
from models.user import User, UserRole

router = APIRouter(prefix="/api/employees", tags=["Onboarding"])


@router.get("/onboarding")
async def onboarding_watchlist(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict:
    random.seed(42)
    employees = []
    for index in range(1, 9):
        onboarding_day = random.randint(5, 89)
        peer_connections = random.randint(0, 6)
        manager_1_1_days_ago = random.randint(3, 24)
        performance_percentile = round(random.uniform(0.25, 0.85), 2)

        flags = []
        if onboarding_day > 30 and peer_connections < 3:
            flags.append("Integration Risk")
        if performance_percentile < 0.5:
            flags.append("Ramp Risk")
        if manager_1_1_days_ago > 14:
            flags.append("Isolation Risk")

        adjusted_risk = min(100, round(35 + (0.5 - performance_percentile) * 40 + len(flags) * 9, 1))
        employees.append({
            "employee_id": f"NEW{index:03d}",
            "name": f"New Hire {index}",
            "department": random.choice(["Engineering", "Sales", "Operations", "Marketing"]),
            "onboarding_day": onboarding_day,
            "is_onboarding": True,
            "adjusted_risk_score": adjusted_risk,
            "risk_flags": flags,
            "peer_network_connections": peer_connections,
            "manager_one_on_one_days_ago": manager_1_1_days_ago,
            "onboarding_performance_percentile": performance_percentile,
            "tooltip": "Scores reflect onboarding cohort baseline, not org-wide average",
        })

    return {
        "count": len(employees),
        "employees": employees,
        "note": "Scores reflect onboarding cohort baseline, not org-wide average",
    }
