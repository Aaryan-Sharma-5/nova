from __future__ import annotations

import hashlib
import random
from typing import Any

from fastapi import APIRouter, Depends

from api.deps import require_role
from core.employee_directory import get_employee_directory, get_employee_record
from models.user import User, UserRole

router = APIRouter(prefix="/api/employees", tags=["Onboarding"])


REQUIRED_DATA_FIELDS = [
    "attendance_rate",
    "avg_weekly_hours",
    "leaves_taken_30d",
    "kpi_score",
    "last_1on1_days_ago",
    "feedback_submissions_count",
    "after_hours_sessions_weekly",
    "tenure_days",
    "reports_to",
    "org_level",
    "title",
]


def _seed_from_employee(employee_id: str) -> int:
    digest = hashlib.sha256(employee_id.encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


def _build_employee_detail(employee_id: str) -> dict[str, Any]:
    seeded = random.Random(_seed_from_employee(employee_id))
    base = get_employee_record(employee_id)

    if base is None:
        base = {
            "employee_id": employee_id,
            "name": f"Employee {employee_id}",
            "department": seeded.choice(["Engineering", "Sales", "HR", "Design", "Finance", "Operations"]),
            "role": "Employee",
            "title": "Employee",
            "reports_to": None,
            "org_level": 4,
        }

    payload: dict[str, Any] = {
        **base,
        "attendance_rate": round(seeded.uniform(0.75, 1.0), 2),
        "avg_weekly_hours": round(seeded.uniform(38, 58), 1),
        "leaves_taken_30d": seeded.randint(0, 5),
        "kpi_score": round(seeded.uniform(0.4, 1.0), 2),
        "last_1on1_days_ago": seeded.randint(3, 45),
        "feedback_submissions_count": seeded.randint(0, 8),
        "after_hours_sessions_weekly": seeded.randint(0, 6),
        "tenure_days": seeded.randint(30, 1800),
    }

    present = sum(1 for field in REQUIRED_DATA_FIELDS if payload.get(field) is not None)
    payload["data_quality_score"] = round((present / len(REQUIRED_DATA_FIELDS)) * 100, 1)
    payload["data_quality_fields"] = REQUIRED_DATA_FIELDS
    return payload


@router.get("")
async def list_employees(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict[str, Any]:
    employees = [_build_employee_detail(record["employee_id"]) for record in get_employee_directory()]
    return {"count": len(employees), "employees": employees}


@router.get("/onboarding")
async def onboarding_watchlist(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict:
    profile_plan = [
        ("NEW001", "Mila Chen", "Engineering", ["Integration Risk"]),
        ("NEW002", "Ari Wilson", "Engineering", ["Ramp Risk"]),
        ("NEW003", "Noah Garcia", "Sales", ["Isolation Risk"]),
        ("NEW004", "Zara Lee", "Sales", ["Integration Risk"]),
        ("NEW005", "Rhea Thomas", "HR", ["Ramp Risk"]),
        ("NEW006", "Dev Brown", "HR", ["Isolation Risk"]),
        ("NEW007", "Ivy Clark", "Design", ["Integration Risk"]),
        ("NEW008", "Owen Scott", "Finance", ["Integration Risk", "Ramp Risk", "Isolation Risk"]),
    ]

    employees = []
    for idx, (employee_id, name, department, flags) in enumerate(profile_plan, start=1):
        random.seed(idx * 73)
        onboarding_day = random.randint(7, 85)
        peer_connections = random.randint(0, 6)
        manager_1_1_days_ago = random.randint(3, 30)
        performance_percentile = round(random.uniform(0.35, 0.82), 2)

        if "Integration Risk" in flags:
            peer_connections = min(peer_connections, 2)
        if "Ramp Risk" in flags:
            performance_percentile = min(performance_percentile, 0.49)
        if "Isolation Risk" in flags:
            manager_1_1_days_ago = max(manager_1_1_days_ago, 21)

        adjusted_risk = min(100, round(38 + (0.5 - performance_percentile) * 42 + len(flags) * 10, 1))
        employees.append({
            "employee_id": employee_id,
            "name": name,
            "department": department,
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


@router.get("/{employee_id}")
async def employee_detail(
    employee_id: str,
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP, UserRole.MANAGER])),
) -> dict:
    """Return deterministic employee detail payload with server-computed data_quality_score."""
    return _build_employee_detail(employee_id)
