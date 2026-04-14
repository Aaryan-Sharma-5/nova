from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from statistics import mean
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ai.groq_client import groq_chat
from ai.schemas import SentimentRequest
from ai.sentiment import analyze_sentiment
from api.deps import require_role
from core.database import get_supabase_admin
from models.user import User, UserRole
from scripts.apply_employee_feedbacks_migration import apply_migration, notify_postgrest_schema_reload
from scripts.seed_feedbacks import seed_feedbacks

router = APIRouter(prefix="/api/hr/feedbacks", tags=["HR Feedback Analyzer"])

THEME_KEYWORDS: dict[str, list[str]] = {
    "workload": ["workload", "deadline", "pressure", "capacity", "overtime", "9 pm", "burnout"],
    "management": ["manager", "leadership", "approval", "decision", "1:1", "feedback"],
    "growth": ["growth", "promotion", "career", "mentor", "stagnant", "learning"],
    "culture": ["culture", "team", "collaboration", "respect", "inclusion", "trust"],
    "compensation": ["salary", "pay", "raise", "compensation"],
    "work_life": ["work-life", "weekend", "late", "time off", "pto"],
}

EMOTION_KEYS = ["stress", "frustration", "disengagement", "satisfaction", "enthusiasm", "anxiety"]


class BatchAnalyzeRequest(BaseModel):
    feedback_ids: list[str] = Field(min_length=1)


class AppraisalContextRequest(BaseModel):
    note: str | None = None


class BootstrapRequest(BaseModel):
    force_seed: bool = False


def _feedback_table_or_503() -> Any:
    supabase = get_supabase_admin()
    try:
        # Cheap existence probe.
        supabase.table("employee_feedbacks").select("id").limit(1).execute()
        return supabase.table("employee_feedbacks")
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "employee_feedbacks table is unavailable. Run backend/database/004_employee_feedbacks.sql "
                "and then seed with backend/scripts/seed_feedbacks.py"
            ),
        ) from exc


def _feedback_table_exists() -> bool:
    try:
        get_supabase_admin().table("employee_feedbacks").select("id").limit(1).execute()
        return True
    except Exception:
        return False


def _feedback_count() -> int:
    resp = get_supabase_admin().table("employee_feedbacks").select("id", count="exact").limit(1).execute()
    return int(resp.count or 0)


def _infer_themes(text: str) -> list[str]:
    lower = text.lower()
    themes: list[str] = []
    for theme, keywords in THEME_KEYWORDS.items():
        if any(keyword in lower for keyword in keywords):
            themes.append(theme)
    return themes[:5] if themes else ["general"]


def _risk_level(score: float, emotions: dict[str, float], sarcasm: bool) -> str:
    stress = float(emotions.get("stress", 0.0))
    frustration = float(emotions.get("frustration", 0.0))
    anxiety = float(emotions.get("anxiety", 0.0))

    if score <= -0.7 or stress >= 0.8 or frustration >= 0.8:
        return "critical"
    if score <= -0.45 or stress >= 0.65 or anxiety >= 0.65 or sarcasm:
        return "high"
    if score <= -0.15 or stress >= 0.4:
        return "medium"
    return "low"


def _extract_key_phrases(text: str) -> list[str]:
    # Grab short meaningful phrases to highlight in UI.
    chunks = re.split(r"[.!?]\s+", text)
    candidates: list[str] = []
    for chunk in chunks:
        cleaned = chunk.strip().strip('"\'')
        if 18 <= len(cleaned) <= 90:
            candidates.append(cleaned)
        if len(candidates) >= 5:
            break
    if candidates:
        return candidates

    words = [w for w in re.findall(r"[a-zA-Z][a-zA-Z'-]+", text.lower()) if len(w) > 5]
    return list(dict.fromkeys(words))[:5]


async def _suggest_hr_action(text: str, themes: list[str], risk_level: str) -> str:
    fallback = {
        "critical": "Schedule an immediate confidential check-in within 24 hours, reduce load, and align manager + HR support plan.",
        "high": "Run a focused manager + HR follow-up this week and define measurable workload and growth actions.",
        "medium": "Add this employee to proactive monitoring and review workload balance in next 1:1 cycle.",
        "low": "Acknowledge the feedback and continue periodic listening with light-touch follow-up.",
    }

    prompt = {
        "feedback_text": text,
        "themes": themes,
        "risk_level": risk_level,
        "task": "Provide one concise, actionable HR response in <= 35 words.",
    }

    try:
        response = await groq_chat(
            messages=[
                {
                    "role": "system",
                    "content": "You are an HR operations advisor. Return plain text only, one practical action sentence.",
                },
                {"role": "user", "content": json.dumps(prompt)},
            ]
        )
        content = response.choices[0].message.content if response and response.choices else ""
        action = (content or "").strip()
        return action[:220] if action else fallback[risk_level]
    except Exception:
        return fallback[risk_level]


def _normalize_date(value: datetime | None, *, end_of_day: bool = False) -> str | None:
    if not value:
        return None
    if end_of_day:
        return value.replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()
    return value.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def _department_from_row(row: dict[str, Any]) -> str:
    return str(row.get("department") or "Unknown")


@router.get("")
async def list_feedbacks(
    department: list[str] | None = Query(default=None),
    feedback_type: list[str] | None = Query(default=None),
    sentiment_range: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    is_anonymous: bool | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    table = _feedback_table_or_503()

    query = table.select("*", count="exact")

    if department:
        departments = [d for d in department if d]
        if departments:
            query = query.in_("department", departments)

    if feedback_type:
        types = [t for t in feedback_type if t]
        if types:
            query = query.in_("feedback_type", types)

    if sentiment_range:
        key = sentiment_range.lower()
        if key in {"pos", "positive"}:
            query = query.gt("sentiment_score", 0.2)
        elif key in {"neg", "negative"}:
            query = query.lt("sentiment_score", -0.2)
        elif key == "neutral":
            query = query.gte("sentiment_score", -0.2).lte("sentiment_score", 0.2)
        elif key == "critical":
            query = query.lt("sentiment_score", -0.6)

    if date_from:
        query = query.gte("submitted_at", _normalize_date(date_from))
    if date_to:
        query = query.lte("submitted_at", _normalize_date(date_to, end_of_day=True))

    if is_anonymous is not None:
        query = query.eq("is_anonymous", is_anonymous)

    if search:
        query = query.ilike("raw_text", f"%{search.strip()}%")

    start = (page - 1) * page_size
    end = start + page_size - 1
    response = query.order("submitted_at", desc=True).range(start, end).execute()

    items = response.data or []
    total = int(response.count or 0)

    return {
        "items": items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": max(1, (total + page_size - 1) // page_size),
        },
    }


@router.post("/analyze-batch")
async def analyze_feedback_batch(
    payload: BatchAnalyzeRequest,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    table = _feedback_table_or_503()
    rows_resp = table.select("*").in_("id", payload.feedback_ids).execute()
    feedback_rows = rows_resp.data or []
    if not feedback_rows:
        raise HTTPException(status_code=404, detail="No feedback records found for provided IDs")

    results: list[dict[str, Any]] = []
    theme_counter: Counter[str] = Counter()
    sarcasm_count = 0
    risk_counter: Counter[str] = Counter()
    dept_negative_counter: Counter[str] = Counter()

    for row in feedback_rows:
        sentiment = await analyze_sentiment(
            SentimentRequest(
                employee_id=str(row.get("employee_id") or "unknown"),
                texts=[str(row.get("raw_text") or "")],
            )
        )
        themes = _infer_themes(str(row.get("raw_text") or ""))
        for theme in themes:
            theme_counter[theme] += 1

        sarcasm = bool(sentiment.sarcasm_detected)
        if sarcasm:
            sarcasm_count += 1

        score = float(sentiment.sarcasm_adjusted_polarity)
        emotions = dict(sentiment.emotions.model_dump())
        risk = _risk_level(score, emotions, sarcasm)
        risk_counter[risk] += 1
        if score < -0.2:
            dept_negative_counter[_department_from_row(row)] += 1

        analyzed_at = datetime.utcnow().isoformat()
        table.update(
            {
                "sentiment_score": score,
                "emotion_tags": {
                    **emotions,
                    "sarcasm_detected": sarcasm,
                    "sarcasm_confidence": float(sentiment.sarcasm_confidence),
                },
                "themes": themes,
                "analyzed_at": analyzed_at,
                "analyzed_by_ai": True,
            }
        ).eq("id", row["id"]).execute()

        results.append(
            {
                "id": row["id"],
                "employee_id": row.get("employee_id"),
                "department": row.get("department"),
                "feedback_type": row.get("feedback_type"),
                "raw_text": row.get("raw_text"),
                "sentiment": {
                    "score": float(sentiment.score),
                    "label": sentiment.label,
                    "surface_polarity": float(sentiment.polarity),
                    "adjusted_polarity": score,
                },
                "emotions": emotions,
                "sarcasm_detected": sarcasm,
                "sarcasm_confidence": float(sentiment.sarcasm_confidence),
                "themes": themes,
                "risk_level": risk,
            }
        )

    analyzed_count = len(results)
    avg_sentiment = round(mean([r["sentiment"]["adjusted_polarity"] for r in results]), 3)
    dominant_theme = theme_counter.most_common(1)[0][0] if theme_counter else "general"
    most_affected_department = dept_negative_counter.most_common(1)[0][0] if dept_negative_counter else "None"

    return {
        "results": results,
        "batch_summary": {
            "dominant_theme": dominant_theme,
            "avg_sentiment": avg_sentiment,
            "sarcasm_count": sarcasm_count,
            "critical_count": risk_counter.get("critical", 0),
            "theme_frequency": dict(theme_counter.most_common()),
            "sentiment_distribution": {
                "positive": sum(1 for r in results if r["sentiment"]["adjusted_polarity"] > 0.2),
                "neutral": sum(1 for r in results if -0.2 <= r["sentiment"]["adjusted_polarity"] <= 0.2),
                "negative": sum(1 for r in results if r["sentiment"]["adjusted_polarity"] < -0.2),
            },
            "department_most_affected": most_affected_department,
            "analyzed_count": analyzed_count,
            "analyzed_by": current_user.email,
        },
    }


@router.post("/analyze-single/{feedback_id}")
async def analyze_single_feedback(
    feedback_id: str,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    table = _feedback_table_or_503()
    response = table.select("*").eq("id", feedback_id).limit(1).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Feedback not found")

    row = rows[0]
    text = str(row.get("raw_text") or "")
    sentiment = await analyze_sentiment(
        SentimentRequest(employee_id=str(row.get("employee_id") or "unknown"), texts=[text])
    )

    themes = _infer_themes(text)
    emotions = dict(sentiment.emotions.model_dump())
    sarcasm_detected = bool(sentiment.sarcasm_detected)
    adjusted_score = float(sentiment.sarcasm_adjusted_polarity)
    risk = _risk_level(adjusted_score, emotions, sarcasm_detected)
    key_phrases = _extract_key_phrases(text)
    action = await _suggest_hr_action(text, themes, risk)

    analyzed_at = datetime.utcnow().isoformat()
    table.update(
        {
            "sentiment_score": adjusted_score,
            "emotion_tags": {
                **emotions,
                "sarcasm_detected": sarcasm_detected,
                "sarcasm_confidence": float(sentiment.sarcasm_confidence),
            },
            "themes": themes,
            "analyzed_at": analyzed_at,
            "analyzed_by_ai": True,
        }
    ).eq("id", feedback_id).execute()

    return {
        **row,
        "sentiment": {
            "label": sentiment.label,
            "surface_polarity": float(sentiment.polarity),
            "sarcasm_adjusted_polarity": adjusted_score,
        },
        "sarcasm_detected": sarcasm_detected,
        "sarcasm_confidence": float(sentiment.sarcasm_confidence),
        "themes": themes,
        "emotion_breakdown": emotions,
        "key_phrases": key_phrases,
        "suggested_hr_action": action,
        "risk_level": risk,
        "analyzed_at": analyzed_at,
        "analyzed_by_ai": True,
        "analyzed_by": current_user.email,
    }


@router.get("/org-themes")
async def org_themes(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    table = _feedback_table_or_503()
    response = table.select("department,sentiment_score,themes,emotion_tags").execute()
    rows = response.data or []
    if not rows:
        return {
            "top_themes": [],
            "sentiment_distribution": {"positive": 0.0, "negative": 0.0, "neutral": 0.0},
            "sarcasm_rate": 0.0,
            "critical_feedback_count": 0,
        }

    theme_depts: dict[str, set[str]] = defaultdict(set)
    theme_scores: dict[str, list[float]] = defaultdict(list)
    theme_counts: Counter[str] = Counter()

    positive = 0
    neutral = 0
    negative = 0
    sarcasm_hits = 0
    critical_count = 0

    for row in rows:
        score = float(row.get("sentiment_score") or 0.0)
        if score > 0.2:
            positive += 1
        elif score < -0.2:
            negative += 1
        else:
            neutral += 1

        emotions = row.get("emotion_tags") or {}
        if bool(emotions.get("sarcasm_detected")):
            sarcasm_hits += 1

        if score <= -0.6:
            critical_count += 1

        department = _department_from_row(row)
        themes = row.get("themes") or []
        if not isinstance(themes, list):
            themes = ["general"]

        for theme in themes:
            name = str(theme)
            theme_counts[name] += 1
            theme_depts[name].add(department)
            theme_scores[name].append(score)

    total = len(rows)
    top_themes = []
    for theme, count in theme_counts.most_common(12):
        top_themes.append(
            {
                "theme": theme,
                "count": count,
                "avg_sentiment": round(mean(theme_scores[theme]), 3) if theme_scores[theme] else 0.0,
                "departments_affected": sorted(theme_depts[theme]),
            }
        )

    return {
        "top_themes": top_themes,
        "sentiment_distribution": {
            "positive": round((positive / total) * 100, 2),
            "neutral": round((neutral / total) * 100, 2),
            "negative": round((negative / total) * 100, 2),
        },
        "sarcasm_rate": round(sarcasm_hits / total, 3),
        "critical_feedback_count": critical_count,
        "total_feedbacks": total,
    }


@router.post("/appraisal-context/{feedback_id}")
async def add_feedback_to_appraisal_context(
    feedback_id: str,
    payload: AppraisalContextRequest,
    current_user: User = Depends(require_role([UserRole.HR])),
) -> dict[str, Any]:
    table = _feedback_table_or_503()
    feedback_resp = table.select("*").eq("id", feedback_id).limit(1).execute()
    rows = feedback_resp.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Feedback not found")

    row = rows[0]
    note = payload.note or "Added from HR Feedback Analyzer"

    get_supabase_admin().table("employee_feedback").insert(
        {
            "user_id": str(row.get("employee_id") or "unknown"),
            "user_role": "hr",
            "category": "appraisal_context",
            "message": f"{note}: {str(row.get('raw_text') or '')[:300]}",
        }
    ).execute()

    return {
        "status": "ok",
        "feedback_id": feedback_id,
        "employee_id": row.get("employee_id"),
        "added_by": current_user.email,
    }


@router.post("/bootstrap")
async def bootstrap_feedback_analyzer(
    payload: BootstrapRequest,
    current_user: User = Depends(require_role([UserRole.HR])),
) -> dict[str, Any]:
    actions: list[str] = []

    table_ready = _feedback_table_exists()
    if not table_ready:
        apply_migration()
        notify_postgrest_schema_reload()
        actions.append("migration_applied")
        table_ready = _feedback_table_exists()

    if not table_ready:
        raise HTTPException(
            status_code=500,
            detail="employee_feedbacks table still unavailable after migration attempt",
        )

    current_count = _feedback_count()
    seeded = 0
    if payload.force_seed or current_count == 0:
        seeded = int(seed_feedbacks())
        actions.append("seeded")
        notify_postgrest_schema_reload()
        current_count = _feedback_count()

    return {
        "ready": table_ready and current_count > 0,
        "table_ready": table_ready,
        "total_feedbacks": current_count,
        "seeded_count": seeded,
        "actions": actions,
        "triggered_by": current_user.email,
    }
