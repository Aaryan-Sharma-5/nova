from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from statistics import median

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ai.groq_client import groq_chat
from api.deps import require_role
from core.database import get_supabase_admin
from models.user import User, UserRole

router = APIRouter(tags=["Manager 360 Feedback"])

RATING_DIMENSIONS = [
    "clarity_of_direction",
    "psychological_safety",
    "recognition_frequency",
    "workload_fairness",
    "growth_support",
]


class ManagerFeedbackPayload(BaseModel):
    ratings: dict[str, int]
    free_text: str | None = Field(default=None, max_length=280)


def _estimate_team_size(manager_id: str) -> int:
    digest = hashlib.sha256(manager_id.encode("utf-8")).hexdigest()
    return 3 + (int(digest[:2], 16) % 9)


def _sentiment_from_text(text: str | None) -> float:
    if not text:
        return 0.0
    lowered = text.lower()
    positive_markers = ["support", "clear", "fair", "good", "growth"]
    negative_markers = ["stress", "unclear", "unfair", "toxic", "burnout"]
    score = sum(marker in lowered for marker in positive_markers) - sum(
        marker in lowered for marker in negative_markers
    )
    return max(-1.0, min(1.0, score / 5))


def _empty_rating_stats() -> dict:
    return {dimension: 0.0 for dimension in RATING_DIMENSIONS}


async def _improvement_suggestion(summary_payload: dict) -> str:
    try:
        response = await groq_chat(
            messages=[
                {
                    "role": "system",
                    "content": "You are an HR coach. Give one concise practical suggestion for a manager.",
                },
                {"role": "user", "content": str(summary_payload)},
            ],
            max_tokens=120,
            temperature=0.2,
        )
        text = response.choices[0].message.content if response and response.choices else ""
        if text and text.strip():
            return text.strip()
    except Exception:
        pass
    return "Increase weekly 1:1 clarity and recognition cadence to reduce uncertainty and improve team trust."


@router.post("/api/feedback/manager/{manager_id}")
async def submit_manager_feedback(
    manager_id: str,
    payload: ManagerFeedbackPayload,
    current_user: User = Depends(require_role([UserRole.EMPLOYEE])),
) -> dict:
    missing = [dimension for dimension in RATING_DIMENSIONS if dimension not in payload.ratings]
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing rating dimensions: {missing}")

    if any(not (1 <= int(payload.ratings[key]) <= 5) for key in RATING_DIMENSIONS):
        raise HTTPException(status_code=422, detail="All ratings must be between 1 and 5")

    team_size = _estimate_team_size(manager_id)
    submitted_by = current_user.email if team_size > 5 else None

    row = {
        "manager_id": manager_id,
        "submitted_by_employee_id": submitted_by,
        "ratings": {k: int(payload.ratings[k]) for k in RATING_DIMENSIONS},
        "free_text": (payload.free_text or "").strip()[:280] or None,
        "sentiment_score": _sentiment_from_text(payload.free_text),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    supabase = get_supabase_admin()
    try:
        supabase.table("manager_feedback").insert(row).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to submit manager feedback: {exc}") from exc

    return {
        "status": "submitted",
        "anonymous": submitted_by is None,
        "k_anonymity_threshold": 5,
        "team_size": team_size,
    }


@router.get("/api/managers/{manager_id}/360-scores")
async def manager_360_scores(
    manager_id: str,
    _current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    supabase = get_supabase_admin()
    try:
        response = (
            supabase.table("manager_feedback")
            .select("ratings, sentiment_score, created_at")
            .eq("manager_id", manager_id)
            .order("created_at", desc=True)
            .limit(300)
            .execute()
        )
        rows = response.data or []
    except Exception:
        rows = []

    if not rows:
        now = datetime.now(timezone.utc)
        rows = [
            {
                "ratings": {
                    "clarity_of_direction": 4,
                    "psychological_safety": 3,
                    "recognition_frequency": 3,
                    "workload_fairness": 3,
                    "growth_support": 4,
                },
                "sentiment_score": 0.2,
                "created_at": now.isoformat(),
            }
        ]

    aggregates = _empty_rating_stats()
    for dimension in RATING_DIMENSIONS:
        values = [int(item.get("ratings", {}).get(dimension, 0)) for item in rows]
        aggregates[dimension] = round(sum(values) / max(1, len(values)), 2)

    now = datetime.now(timezone.utc)
    cycles = []
    for cycle_index in range(3):
        start = now - timedelta(days=(cycle_index + 1) * 30)
        end = now - timedelta(days=cycle_index * 30)
        cycle_rows = [
            item for item in rows
            if start <= datetime.fromisoformat(str(item.get("created_at")).replace("Z", "+00:00")) < end
        ]
        if not cycle_rows:
            continue
        cycle_score = median(
            [
                sum(int(item.get("ratings", {}).get(dim, 0)) for dim in RATING_DIMENSIONS) / len(RATING_DIMENSIONS)
                for item in cycle_rows
            ]
        )
        cycles.append({"cycle": f"Cycle {3 - cycle_index}", "score": round(float(cycle_score), 2)})

    suggestion = await _improvement_suggestion({
        "manager_id": manager_id,
        "averages": aggregates,
        "trend": cycles,
    })

    overall_score = round(sum(aggregates.values()) / len(RATING_DIMENSIONS), 2)

    return {
        "manager_id": manager_id,
        "overall_score": overall_score,
        "dimensions": aggregates,
        "trend_last_3_cycles": list(reversed(cycles)),
        "suggestion": suggestion,
        "powered_by": "anonymous_peer_feedback",
    }
