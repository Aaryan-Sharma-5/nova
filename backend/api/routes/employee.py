from fastapi import APIRouter, Depends
from models.user import User
from api.deps import require_any_authenticated
import random

router = APIRouter(prefix="/employee", tags=["Employee"])


@router.get("/profile")
async def get_profile(current_user: User = Depends(require_any_authenticated)):
    """
    Get current employee's profile information.
    
    **Access:** All authenticated users
    """
    return {
        "message": "Employee profile",
        "profile": {
            "id": current_user.email,
            "email": current_user.email,
            "full_name": current_user.full_name,
            "role": current_user.role,
            "department": "Engineering",
            "job_title": "Software Engineer",
            "hire_date": "2022-03-15"
        }
    }


@router.get("/benefits")
async def get_benefits(current_user: User = Depends(require_any_authenticated)):
    """
    Get employee benefits and perks information.
    
    **Access:** All authenticated users
    """
    return {
        "message": "Employee benefits",
        "accessed_by": current_user.email,
        "benefits": {
            "health_insurance": "Active",
            "vacation_days": {"total": 20, "used": 8, "remaining": 12},
            "pto_balance": 5,
            "retirement_401k": {"contribution": "5%", "match": "100% up to 5%"}
        }
    }


@router.get("/learning-resources")
async def get_learning_resources(current_user: User = Depends(require_any_authenticated)):
    """
    Get available learning and development resources.
    
    **Access:** All authenticated users
    """
    return {
        "message": "Learning resources",
        "accessed_by": current_user.email,
        "resources": [
            {
                "title": "Leadership Fundamentals",
                "type": "course",
                "duration": "4 hours",
                "status": "available"
            },
            {
                "title": "Technical Skills Bootcamp",
                "type": "workshop",
                "duration": "2 days",
                "status": "enrolled"
            }
        ]
    }


@router.get("/performance-summary")
async def get_performance_summary(current_user: User = Depends(require_any_authenticated)):
    """
    Get employee's own performance summary.
    
    **Access:** All authenticated users (can only see their own data)
    """
    return {
        "message": "Performance summary",
        "accessed_by": current_user.email,
        "summary": {
            "current_rating": 4.2,
            "goals_completed": 8,
            "goals_in_progress": 3,
            "recent_feedback": "Excellent collaboration and technical skills",
            "next_review_date": "2026-06-30"
        }
    }


@router.get("/onboarding")
async def get_onboarding_employees(current_user: User = Depends(require_any_authenticated)):
    """Return onboarding employees (<90 days) with onboarding-cohort adjusted risk signals."""
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
        })

    return {
        "requested_by": current_user.email,
        "count": len(employees),
        "employees": employees,
        "note": "Scores reflect onboarding cohort baseline, not org-wide average",
    }
