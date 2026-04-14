from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
import sys

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from core.database import get_supabase_admin


def seed_feedback_sessions() -> int:
    supabase = get_supabase_admin()
    now = datetime.utcnow()

    sessions = [
        {
            "employee_id": "employee@company.com",
            "department": "Engineering",
            "scheduled_date": (now - timedelta(days=2)).isoformat(),
            "status": "completed",
            "hr_reviewed": False,
            "transcript": "The last two weeks were heavy due to release pressure. I feel supported but stretched.",
            "emotion_analysis": {"dominant_emotion": "stress", "timeline": [{"segment": "Q1", "stress": 0.72, "confidence": 0.45, "hesitation": 0.31}], "duration_seconds": 522},
            "derived_scores": {"workload_sentiment": 0.34, "manager_relationship": 0.58, "team_dynamics": 0.66, "growth_satisfaction": 0.41},
        },
        {
            "employee_id": "employee2@company.com",
            "department": "Sales",
            "scheduled_date": (now - timedelta(days=1)).isoformat(),
            "status": "completed",
            "hr_reviewed": False,
            "transcript": "Quota pressure is high. Team support exists but prioritization feels unstable.",
            "emotion_analysis": {"dominant_emotion": "neutral", "timeline": [{"segment": "Q1", "stress": 0.49, "confidence": 0.65, "hesitation": 0.2}], "duration_seconds": 486},
            "derived_scores": {"workload_sentiment": 0.49, "manager_relationship": 0.63, "team_dynamics": 0.51, "growth_satisfaction": 0.57},
        },
        {
            "employee_id": "employee3@company.com",
            "department": "Operations",
            "scheduled_date": (now - timedelta(days=4)).isoformat(),
            "status": "completed",
            "hr_reviewed": True,
            "transcript": "Reviewed session.",
            "emotion_analysis": {"dominant_emotion": "positive", "duration_seconds": 451},
            "derived_scores": {"workload_sentiment": 0.72, "manager_relationship": 0.75, "team_dynamics": 0.73, "growth_satisfaction": 0.71},
        },
        {
            "employee_id": "employee4@company.com",
            "department": "Marketing",
            "scheduled_date": (now - timedelta(hours=6)).isoformat(),
            "status": "in_progress",
            "hr_reviewed": False,
            "emotion_analysis": {"dominant_emotion": "neutral", "duration_seconds": 193},
            "derived_scores": {},
        },
        {
            "employee_id": "employee5@company.com",
            "department": "Product",
            "scheduled_date": (now + timedelta(days=2)).isoformat(),
            "status": "scheduled",
            "hr_reviewed": False,
            "emotion_analysis": {"dominant_emotion": "neutral"},
            "derived_scores": {},
        },
    ]

    inserted = 0
    for row in sessions:
        try:
            result = supabase.table("feedback_sessions").insert({**row, "is_mandatory": True, "created_at": now.isoformat()}).execute()
            inserted += len(result.data or [])
        except Exception:
            continue
    return inserted


if __name__ == "__main__":
    count = seed_feedback_sessions()
    print(f"Seeded {count} feedback sessions")
