"""Mandatory feedback session APIs (HireVue-style flow)."""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from postgrest.exceptions import APIError
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
logger = logging.getLogger(__name__)

RECORDINGS_BUCKET = "feedback-recordings"
CONSENT_VERSION = "v1.0-dpdp-2023"
_LOCAL_FEEDBACK_SESSIONS: dict[str, dict[str, Any]] = {}


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


def _is_missing_feedback_sessions_table(exc: Exception) -> bool:
    if isinstance(exc, APIError):
        payload = exc.args[0] if exc.args and isinstance(exc.args[0], dict) else {}
        code = str(payload.get("code") or "")
        message = str(payload.get("message") or "")
        if code == "PGRST205" and "feedback_sessions" in message:
            return True
    text = str(exc)
    return "PGRST205" in text and "feedback_sessions" in text


def _is_supabase_connectivity_error(exc: Exception) -> bool:
    text = str(exc).lower()
    connectivity_markers = (
        "getaddrinfo failed",
        "temporary failure in name resolution",
        "name or service not known",
        "nodename nor servname provided",
        "httpx.connecterror",
        "httpcore.connecterror",
        "connecterror",
        "errno 11001",
    )
    return any(marker in text for marker in connectivity_markers)


def _should_use_local_feedback_fallback(exc: Exception) -> bool:
    return _is_missing_feedback_sessions_table(exc) or _is_supabase_connectivity_error(exc)


def _local_insert_sessions(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    inserted: list[dict[str, Any]] = []
    for row in rows:
        session_id = str(uuid.uuid4())
        payload = {
            "id": session_id,
            "employee_id": row.get("employee_id"),
            "department": row.get("department"),
            "scheduled_date": row.get("scheduled_date"),
            "status": row.get("status", "scheduled"),
            "is_mandatory": bool(row.get("is_mandatory", True)),
            "hr_reviewed": bool(row.get("hr_reviewed", False)),
            "hr_reviewer_id": row.get("hr_reviewer_id"),
            "created_at": row.get("created_at") or datetime.utcnow().isoformat(),
            "transcript": row.get("transcript") or "",
            "emotion_analysis": row.get("emotion_analysis") or {},
            "derived_scores": row.get("derived_scores") or {},
            "recording_url": row.get("recording_url"),
            "recording_hash": row.get("recording_hash"),
        }
        _LOCAL_FEEDBACK_SESSIONS[session_id] = payload
        inserted.append(payload)
    return inserted


def _local_get_session(session_id: str) -> dict[str, Any] | None:
    return _LOCAL_FEEDBACK_SESSIONS.get(session_id)


def _local_update_session(session_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    session = _LOCAL_FEEDBACK_SESSIONS.get(session_id)
    if not session:
        return None
    session.update(updates)
    _LOCAL_FEEDBACK_SESSIONS[session_id] = session
    return session


def _local_sessions_for_employee(employee_id: str) -> list[dict[str, Any]]:
    rows = [row for row in _LOCAL_FEEDBACK_SESSIONS.values() if row.get("employee_id") == employee_id]
    rows.sort(key=lambda item: str(item.get("scheduled_date") or ""))
    return rows


def _local_pending_sessions() -> list[dict[str, Any]]:
    rows = [
        row
        for row in _LOCAL_FEEDBACK_SESSIONS.values()
        if row.get("status") in {"scheduled", "in_progress", "completed"} and not bool(row.get("hr_reviewed"))
    ]
    rows.sort(key=lambda item: str(item.get("scheduled_date") or ""))
    return rows


def _session_or_404(session_id: str) -> dict[str, Any]:
    supabase = get_supabase_admin()
    try:
        response = supabase.table("feedback_sessions").select("*").eq("id", session_id).limit(1).execute()
        rows = response.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Session not found")
        return rows[0]
    except Exception as exc:
        if not _should_use_local_feedback_fallback(exc):
            raise
        row = _local_get_session(session_id)
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        return row


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
    logger.info("Feedback processing started session_id=%s", session_id)
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
    logger.info(
        "Feedback processing completed session_id=%s transcript_len=%d score_keys=%d",
        session_id,
        len(transcript),
        len(derived_scores.keys()),
    )


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
    logger.info(
        "Schedule feedback requested by=%s employee_id=%s department=%s mandatory=%s",
        current_user.email,
        payload.employee_id,
        payload.department,
        payload.mandatory,
    )
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

    try:
        result = supabase.table("feedback_sessions").insert(rows).execute()
        sessions = result.data or []
    except Exception as exc:
        if not _should_use_local_feedback_fallback(exc):
            raise
        logger.warning(
            "Feedback schedule using local fallback due to Supabase unavailability: %s",
            exc,
        )
        sessions = _local_insert_sessions(rows)

    response = {
        "scheduled_count": len(sessions),
        "mandatory": payload.mandatory,
        "scheduled_by": current_user.email,
        "sessions": sessions,
    }
    logger.info(
        "Schedule feedback completed by=%s scheduled_count=%d",
        current_user.email,
        response["scheduled_count"],
    )
    return response


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
    logger.info("Feedback sessions requested by employee=%s", current_user.email)
    supabase = get_supabase_admin()
    try:
        response = (
            supabase.table("feedback_sessions")
            .select("id, employee_id, scheduled_date, status, is_mandatory, created_at, transcript, hr_reviewed, hr_reviewer_id, emotion_analysis")
            .eq("employee_id", current_user.email)
            .order("scheduled_date", desc=False)
            .execute()
        )
        sessions = response.data or []
        logger.info("Feedback sessions served for employee=%s count=%d", current_user.email, len(sessions))
        return {"sessions": sessions}
    except Exception as exc:
        if not _should_use_local_feedback_fallback(exc):
            raise
        logger.warning(
            "Feedback /my using local fallback for employee=%s due to Supabase unavailability: %s",
            current_user.email,
            exc,
        )
        sessions = _local_sessions_for_employee(current_user.email)
        logger.warning(
            "Feedback sessions fallback storage used for employee=%s count=%d",
            current_user.email,
            len(sessions),
        )
        return {"sessions": sessions}


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
    logger.info(
        "Feedback upload requested by=%s session_id=%s filename=%s",
        current_user.email,
        session_id,
        video_file.filename or "unknown",
    )
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
        logger.exception("Feedback upload failed by=%s session_id=%s", current_user.email, session_id)
        raise HTTPException(status_code=500, detail=f"Failed to store recording: {exc}") from exc

    supabase.table("feedback_sessions").update(
        {
            "recording_url": storage_path,
            "recording_hash": recording_hash,
        }
    ).eq("id", session_id).execute()

    response = {
        "status": "uploaded",
        "session_id": session_id,
        "recording_path": storage_path,
        "recording_hash": recording_hash,
    }
    logger.info(
        "Feedback upload completed by=%s session_id=%s bytes=%d",
        current_user.email,
        session_id,
        len(content),
    )
    return response


@router.post("/{session_id}/process")
async def process_feedback_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role([UserRole.EMPLOYEE, UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    """Trigger async processing pipeline for uploaded recording."""
    logger.info("Feedback process requested by=%s session_id=%s", current_user.email, session_id)
    session = _session_or_404(session_id)
    _ensure_access(session, current_user)

    if not session.get("recording_url"):
        raise HTTPException(status_code=400, detail="Recording must be uploaded before processing")

    background_tasks.add_task(_process_session_async, session_id)
    logger.info("Feedback process queued by=%s session_id=%s", current_user.email, session_id)
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
    logger.info(
        "Feedback ingest requested by=%s session_id=%s notes_len=%d",
        current_user.email,
        session_id,
        len(payload.notes),
    )
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

    updates = {
        "hr_reviewed": True,
        "hr_reviewer_id": current_user.email,
        "emotion_analysis": {
            **_safe_json(session.get("emotion_analysis")),
            "hr_notes": payload.notes,
            "ingested_at": datetime.utcnow().isoformat(),
        },
    }

    try:
        supabase.table("feedback_sessions").update(updates).eq("id", session_id).execute()
    except Exception as exc:
        if not _should_use_local_feedback_fallback(exc):
            raise
        _local_update_session(session_id, updates)

    response = {
        "status": "ingested",
        "session_id": session_id,
        "employee_id": session.get("employee_id"),
        "sentiment_score": pipeline_scores.get("sentiment_score"),
        "engagement_score": pipeline_scores.get("engagement_score"),
        "notes_saved": bool(payload.notes.strip()),
    }
    logger.info(
        "Feedback ingest completed by=%s session_id=%s employee_id=%s",
        current_user.email,
        session_id,
        session.get("employee_id"),
    )
    return response


@router.get("/pending-review")
async def list_sessions_pending_review(
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    """List session queue visible to HR (scheduled, in-progress, and completed pending review)."""
    logger.info("Pending review requested by=%s", current_user.email)
    supabase = get_supabase_admin()
    try:
        rows = (
            supabase.table("feedback_sessions")
            .select("id, employee_id, department, scheduled_date, status, hr_reviewed, created_at, emotion_analysis, derived_scores")
            .in_("status", ["scheduled", "in_progress", "completed"])
            .eq("hr_reviewed", False)
            .order("scheduled_date", desc=False)
            .execute()
        )
        data = rows.data or []
    except Exception as exc:
        if not _should_use_local_feedback_fallback(exc):
            raise
        logger.warning(
            "Pending review using local fallback due to Supabase unavailability: %s",
            exc,
        )
        data = _local_pending_sessions()

    response = {
        "count": len(data),
        "sessions": data,
        "requested_by": current_user.email,
    }
    logger.info("Pending review served for=%s count=%d", current_user.email, response["count"])
    return response


@router.post("/{session_id}/flag-follow-up")
async def flag_session_follow_up(
    session_id: str,
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    logger.info("Follow-up flag requested by=%s session_id=%s", current_user.email, session_id)
    session = _session_or_404(session_id)
    emotion_analysis = _safe_json(session.get("emotion_analysis"))
    emotion_analysis["follow_up_required"] = True
    emotion_analysis["follow_up_flagged_at"] = datetime.utcnow().isoformat()

    try:
        updated = (
            get_supabase_admin()
            .table("feedback_sessions")
            .update({"emotion_analysis": emotion_analysis})
            .eq("id", session_id)
            .execute()
        )
        session_payload = (updated.data or [])[0] if updated.data else {"id": session_id}
    except Exception as exc:
        if not _should_use_local_feedback_fallback(exc):
            raise
        local = _local_update_session(session_id, {"emotion_analysis": emotion_analysis})
        session_payload = local or {"id": session_id}

    response = {
        "status": "follow_up_flagged",
        "session_id": session_id,
        "session": session_payload,
        "flagged_by": current_user.email,
    }
    logger.info("Follow-up flag completed by=%s session_id=%s", current_user.email, session_id)
    return response


@router.post("/seed-demo")
async def seed_demo_feedback_sessions(
    current_user: User = Depends(require_role([UserRole.HR, UserRole.LEADERSHIP])),
) -> dict[str, Any]:
    """Seed demo sessions with mixed states so Sessions to Review is never empty."""
    logger.info("Seed demo sessions requested by=%s", current_user.email)
    supabase = get_supabase_admin()
    now = datetime.utcnow()

    demo_rows = [
        {
            "employee_id": "employee@company.com",
            "department": "Engineering",
            "scheduled_date": (now - timedelta(days=2)).isoformat(),
            "status": "completed",
            "hr_reviewed": False,
            "transcript": (
                "Q1: The last two weeks felt heavier than usual, mostly because sprint scope expanded.\n\n"
                "Q2: My manager is supportive, but our check-ins are too short to cover blockers in depth.\n\n"
                "Q3: Team collaboration is positive, though we have unresolved ownership overlap on on-call tasks.\n\n"
                "Q4: I need clearer growth milestones and feedback on architectural decisions.\n\n"
                "Q5: I am committed, but stress spikes near release windows and recovery time is limited."
            ),
            "emotion_analysis": {
                "dominant_emotion": "stress",
                "timeline": [
                    {"segment": "Q1", "stress": 0.72, "confidence": 0.48, "hesitation": 0.33},
                    {"segment": "Q2", "stress": 0.61, "confidence": 0.55, "hesitation": 0.29},
                    {"segment": "Q3", "stress": 0.52, "confidence": 0.62, "hesitation": 0.2},
                    {"segment": "Q4", "stress": 0.57, "confidence": 0.5, "hesitation": 0.31},
                    {"segment": "Q5", "stress": 0.68, "confidence": 0.46, "hesitation": 0.35},
                ],
                "red_flags": ["stress spikes near release windows"],
                "hesitation_marker_count": 8,
                "duration_seconds": 522,
            },
            "derived_scores": {
                "workload_sentiment": 0.34,
                "manager_relationship": 0.58,
                "team_dynamics": 0.66,
                "growth_satisfaction": 0.41,
            },
        },
        {
            "employee_id": "employee2@company.com",
            "department": "Sales",
            "scheduled_date": (now - timedelta(days=1)).isoformat(),
            "status": "completed",
            "hr_reviewed": False,
            "transcript": (
                "Q1: I am energized by customer conversations but quota pressure has been intense this month.\n\n"
                "Q2: My manager gives good coaching, but I need faster escalation support on stuck deals.\n\n"
                "Q3: Team morale is mixed due to territory changes.\n\n"
                "Q4: I want stronger enablement on enterprise deal strategy.\n\n"
                "Q5: I am motivated, but I need more consistent planning support."
            ),
            "emotion_analysis": {
                "dominant_emotion": "neutral",
                "timeline": [
                    {"segment": "Q1", "stress": 0.49, "confidence": 0.65, "hesitation": 0.2},
                    {"segment": "Q2", "stress": 0.45, "confidence": 0.69, "hesitation": 0.18},
                    {"segment": "Q3", "stress": 0.55, "confidence": 0.54, "hesitation": 0.23},
                    {"segment": "Q4", "stress": 0.4, "confidence": 0.72, "hesitation": 0.14},
                    {"segment": "Q5", "stress": 0.47, "confidence": 0.67, "hesitation": 0.16},
                ],
                "red_flags": ["quota pressure has been intense"],
                "hesitation_marker_count": 5,
                "duration_seconds": 486,
            },
            "derived_scores": {
                "workload_sentiment": 0.49,
                "manager_relationship": 0.63,
                "team_dynamics": 0.51,
                "growth_satisfaction": 0.57,
            },
        },
        {
            "employee_id": "employee3@company.com",
            "department": "Operations",
            "scheduled_date": (now - timedelta(days=4)).isoformat(),
            "status": "completed",
            "hr_reviewed": True,
            "transcript": "Completed and reviewed session.",
            "emotion_analysis": {"dominant_emotion": "positive", "duration_seconds": 451},
            "derived_scores": {
                "workload_sentiment": 0.72,
                "manager_relationship": 0.75,
                "team_dynamics": 0.73,
                "growth_satisfaction": 0.71,
            },
        },
        {
            "employee_id": "employee4@company.com",
            "department": "Marketing",
            "scheduled_date": (now - timedelta(hours=5)).isoformat(),
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

    inserted = []
    for row in demo_rows:
        try:
            response = supabase.table("feedback_sessions").insert({**row, "is_mandatory": True, "created_at": now.isoformat()}).execute()
            inserted.extend(response.data or [])
        except Exception as exc:
            if _should_use_local_feedback_fallback(exc):
                inserted.extend(_local_insert_sessions([{**row, "is_mandatory": True, "created_at": now.isoformat()}]))
                continue
            continue

    response = {
        "status": "seeded",
        "inserted": len(inserted),
        "seeded_by": current_user.email,
    }
    logger.info("Seed demo sessions completed by=%s inserted=%d", current_user.email, response["inserted"])
    return response
