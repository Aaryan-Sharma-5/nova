"""Mandatory feedback session APIs (HireVue-style flow)."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from ai.session_analyzer import (
    analyze_session_emotion,
    derive_scores,
    generate_hr_summary,
    transcribe_session,
)
from api.deps import require_role
from core.database import get_supabase_admin
from models.user import User, UserRole

router = APIRouter(prefix="/sessions", tags=["Feedback Sessions"])

RECORDINGS_BUCKET = "feedback-recordings"
CONSENT_VERSION = "v1.0-dpdp-2023"


class ScheduleSessionRequest(BaseModel):
    employee_id: str | None = None
    department: str | None = None
    scheduled_date: datetime
    mandatory: bool = True


class ConsentRequest(BaseModel):
    consented: bool = True
    consent_version: str = CONSENT_VERSION


class HRIngestRequest(BaseModel):
    notes: str = Field(default="", max_length=3000)


def _session_or_404(session_id: str) -> dict[str, Any]:
    supabase = get_supabase_admin()
    response = supabase.table("feedback_sessions").select("*").eq("id", session_id).limit(1).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Session not found")
    return rows[0]


def _ensure_access(session: dict[str, Any], current_user: User) -> None:
    if current_user.role in (UserRole.HR, UserRole.LEADERSHIP):
        return
    if current_user.role == UserRole.EMPLOYEE and session.get("employee_id") == current_user.email:
        return
    raise HTTPException(status_code=403, detail="Access denied for this session")


def _recording_path(employee_id: str, session_id: str, filename: str) -> str:
    ext = "webm"
    if "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower() or "webm"
    return f"recordings/{employee_id}/{session_id}.{ext}"


def _safe_json(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    return {}


def _ensure_recordings_bucket_exists() -> None:
    supabase = get_supabase_admin()
    try:
        buckets = supabase.storage.list_buckets()
        names = {bucket.get("name") for bucket in (buckets or []) if isinstance(bucket, dict)}
        if RECORDINGS_BUCKET not in names:
            supabase.storage.create_bucket(RECORDINGS_BUCKET, {"public": False})
    except Exception:
        # Non-fatal; upload path will still surface specific storage errors if creation failed.
        return


def _log_decline_notification(employee_id: str, session_id: str) -> None:
    supabase = get_supabase_admin()
    note = (
        f"Employee {employee_id} declined mandatory feedback session {session_id}. "
        "Manager follow-up is required."
    )
    try:
        supabase.table("employee_feedback").insert(
            {
                "user_id": employee_id,
                "user_role": "employee",
                "category": "feedback_session_declined",
                "message": note,
            }
        ).execute()
    except Exception:
        pass


async def _process_session_async(session_id: str) -> None:
    supabase = get_supabase_admin()
    session = _session_or_404(session_id)

    recording_path = session.get("recording_url")
    if not recording_path:
        return

    audio_blob = b""
    try:
        audio_blob = supabase.storage.from_(RECORDINGS_BUCKET).download(recording_path)
    except Exception:
        audio_blob = b""

    transcript = await transcribe_session(audio_blob)
    emotion_analysis = await analyze_session_emotion(transcript)
    derived_scores = derive_scores(emotion_analysis, transcript)

    supabase.table("feedback_sessions").update(
        {
            "status": "completed",
            "transcript": transcript,
            "emotion_analysis": emotion_analysis,
            "derived_scores": derived_scores,
        }
    ).eq("id", session_id).execute()


def _upsert_feedback_metrics(employee_id: str, derived_scores: dict[str, float]) -> dict[str, float]:
    supabase = get_supabase_admin()

    engagement_proxy = round(
        max(
            0.0,
            min(
                1.0,
                (derived_scores.get("team_dynamics", 0.0) + derived_scores.get("manager_relationship", 0.0)) / 2,
            ),
        ),
        3,
    )

    sentiment_proxy = round(
        max(
            -1.0,
            min(
                1.0,
                (
                    derived_scores.get("workload_sentiment", 0.5)
                    + derived_scores.get("manager_relationship", 0.5)
                    + derived_scores.get("team_dynamics", 0.5)
                    + derived_scores.get("growth_satisfaction", 0.5)
                )
                / 2
                - 1,
            ),
        ),
        3,
    )

    payload = {
        "employee_id": employee_id,
        "sentiment_score": float(sentiment_proxy),
        "engagement_score": float(engagement_proxy),
        "updated_at": datetime.utcnow().isoformat(),
    }

    for table_name in ("employee_metrics", "employee_feature_store", "employee_features"):
        try:
            supabase.table(table_name).upsert(payload, on_conflict="employee_id").execute()
            return {
                "sentiment_score": sentiment_proxy,
                "engagement_score": engagement_proxy,
            }
        except Exception:
            continue

    return {
        "sentiment_score": sentiment_proxy,
        "engagement_score": engagement_proxy,
    }


@router.post("/schedule")
async def schedule_feedback_session(
    payload: ScheduleSessionRequest,
    current_user: User = Depends(require_role([UserRole.HR])),
) -> dict[str, Any]:
    """Schedule mandatory feedback sessions for one employee or a department."""
    supabase = get_supabase_admin()

    employee_ids: list[str] = []
    if payload.employee_id:
        employee_ids = [payload.employee_id]
    elif payload.department:
        users = (
            supabase.table("users")
            .select("email")
            .eq("department", payload.department)
            .eq("role", "employee")
            .execute()
        )
        employee_ids = [row.get("email") for row in (users.data or []) if row.get("email")]

    if not employee_ids:
        raise HTTPException(status_code=400, detail="No target employees resolved for scheduling")

    rows = [
        {
            "employee_id": eid,
            "department": payload.department,
            "scheduled_date": payload.scheduled_date.isoformat(),
            "status": "scheduled",
            "is_mandatory": payload.mandatory,
            "hr_reviewed": False,
            "created_at": datetime.utcnow().isoformat(),
        }
        for eid in employee_ids
    ]

    result = supabase.table("feedback_sessions").insert(rows).execute()
    return {
        "scheduled_count": len(result.data or []),
        "mandatory": payload.mandatory,
        "scheduled_by": current_user.email,
        "sessions": result.data or [],
    }


@router.post("/admin/bootstrap-storage")
async def bootstrap_feedback_storage(
    _current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    """Optional admin helper to ensure recording bucket exists."""
    _ensure_recordings_bucket_exists()
    return {
        "status": "ok",
        "bucket": RECORDINGS_BUCKET,
        "message": "Feedback recording storage bootstrap attempted.",
    }


@router.get("/my")
async def get_my_feedback_sessions(
    current_user: User = Depends(require_role([UserRole.EMPLOYEE])),
) -> dict[str, Any]:
    """Employee view of their own scheduled/completed sessions."""
    supabase = get_supabase_admin()
    response = (
        supabase.table("feedback_sessions")
        .select("id, employee_id, scheduled_date, status, is_mandatory, created_at, transcript")
        .eq("employee_id", current_user.email)
        .order("scheduled_date", desc=False)
        .execute()
    )
    return {"sessions": response.data or []}


@router.post("/{session_id}/consent")
async def log_session_consent(
    session_id: str,
    payload: ConsentRequest,
    request: Request,
    current_user: User = Depends(require_role([UserRole.EMPLOYEE])),
) -> dict[str, Any]:
    """Log explicit consent before recording session starts."""
    session = _session_or_404(session_id)
    _ensure_access(session, current_user)

    supabase = get_supabase_admin()
    ip_address = request.client.host if request.client else "unknown"

    if payload.consented:
        supabase.table("session_consent_log").insert(
            {
                "session_id": session_id,
                "employee_id": current_user.email,
                "consent_version": payload.consent_version,
                "ip_address": ip_address,
                "consented_at": datetime.utcnow().isoformat(),
            }
        ).execute()
        return {"status": "consented", "session_id": session_id}

    supabase.table("feedback_sessions").update({"status": "skipped"}).eq("id", session_id).execute()
    _log_decline_notification(current_user.email, session_id)
    return {
        "status": "declined",
        "session_id": session_id,
        "message": "Session marked as declined - your manager will be notified.",
    }


@router.post("/{session_id}/upload")
async def upload_feedback_recording(
    session_id: str,
    video_file: UploadFile = File(...),
    current_user: User = Depends(require_role([UserRole.EMPLOYEE])),
) -> dict[str, Any]:
    """Upload employee recording to Supabase Storage under recordings/{employee}/{session}."""
    session = _session_or_404(session_id)
    _ensure_access(session, current_user)

    if session.get("status") != "scheduled":
        raise HTTPException(status_code=400, detail="Session is not in scheduled state")

    supabase = get_supabase_admin()
    consent = (
        supabase.table("session_consent_log")
        .select("session_id")
        .eq("session_id", session_id)
        .eq("employee_id", current_user.email)
        .limit(1)
        .execute()
    )
    if not (consent.data or []):
        raise HTTPException(status_code=400, detail="Consent is required before recording upload")

    content = await video_file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded recording is empty")

    recording_hash = hashlib.sha256(content).hexdigest()
    storage_path = _recording_path(current_user.email, session_id, video_file.filename or "session.webm")
    _ensure_recordings_bucket_exists()

    try:
        supabase.storage.from_(RECORDINGS_BUCKET).upload(
            storage_path,
            content,
            {"content-type": video_file.content_type or "video/webm", "upsert": "true"},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to store recording: {exc}") from exc

    supabase.table("feedback_sessions").update(
        {
            "recording_url": storage_path,
            "recording_hash": recording_hash,
        }
    ).eq("id", session_id).execute()

    return {
        "status": "uploaded",
        "session_id": session_id,
        "recording_path": storage_path,
        "recording_hash": recording_hash,
    }


@router.post("/{session_id}/process")
async def process_feedback_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role([UserRole.EMPLOYEE, UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    """Trigger async processing pipeline for uploaded recording."""
    session = _session_or_404(session_id)
    _ensure_access(session, current_user)

    if not session.get("recording_url"):
        raise HTTPException(status_code=400, detail="Recording must be uploaded before processing")

    background_tasks.add_task(_process_session_async, session_id)
    return {"status": "processing_started", "session_id": session_id}


@router.get("/{session_id}/results")
async def get_feedback_session_results(
    session_id: str,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    """HR-only full review payload including transcript, timeline, scores, and summary."""
    session = _session_or_404(session_id)

    transcript = str(session.get("transcript") or "")
    emotion_analysis = _safe_json(session.get("emotion_analysis"))
    derived_scores = _safe_json(session.get("derived_scores"))
    hr_summary = await generate_hr_summary(transcript, emotion_analysis)

    signed_url = None
    recording_path = session.get("recording_url")
    if recording_path:
        try:
            signed = get_supabase_admin().storage.from_(RECORDINGS_BUCKET).create_signed_url(recording_path, 3600)
            signed_url = signed.get("signedURL") or signed.get("signedUrl")
        except Exception:
            signed_url = None

    return {
        "id": session.get("id"),
        "employee_id": session.get("employee_id"),
        "status": session.get("status"),
        "recording_url": signed_url,
        "transcript": transcript,
        "emotion_analysis": emotion_analysis,
        "emotion_timeline": emotion_analysis.get("timeline", []),
        "derived_scores": derived_scores,
        "hr_summary": hr_summary,
        "recording_hash": session.get("recording_hash"),
    }


@router.post("/{session_id}/hr-ingest")
async def hr_ingest_feedback_results(
    session_id: str,
    payload: HRIngestRequest,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    """HR confirms review and ingests derived scores into NOVA analytics signals."""
    supabase = get_supabase_admin()
    session = _session_or_404(session_id)

    if session.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Session must be completed before ingestion")

    transcript = str(session.get("transcript") or "")
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript missing for ingestion")

    derived_scores = _safe_json(session.get("derived_scores"))

    pipeline_scores = _upsert_feedback_metrics(
        employee_id=session.get("employee_id"),
        derived_scores={k: float(v) for k, v in derived_scores.items() if isinstance(v, (int, float))},
    )

    supabase.table("feedback_sessions").update(
        {
            "hr_reviewed": True,
            "hr_reviewer_id": current_user.email,
            "emotion_analysis": {
                **_safe_json(session.get("emotion_analysis")),
                "hr_notes": payload.notes,
                "ingested_at": datetime.utcnow().isoformat(),
            },
        }
    ).eq("id", session_id).execute()

    return {
        "status": "ingested",
        "session_id": session_id,
        "employee_id": session.get("employee_id"),
        "sentiment_score": pipeline_scores.get("sentiment_score"),
        "engagement_score": pipeline_scores.get("engagement_score"),
        "notes_saved": bool(payload.notes.strip()),
    }


@router.get("/pending-review")
async def list_sessions_pending_review(
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    """List completed sessions awaiting HR review/ingestion."""
    supabase = get_supabase_admin()
    rows = (
        supabase.table("feedback_sessions")
        .select("id, employee_id, department, scheduled_date, status, hr_reviewed, created_at")
        .eq("status", "completed")
        .eq("hr_reviewed", False)
        .order("scheduled_date", desc=False)
        .execute()
    )

    data = rows.data or []
    return {
        "count": len(data),
        "sessions": data,
        "requested_by": current_user.email,
    }
