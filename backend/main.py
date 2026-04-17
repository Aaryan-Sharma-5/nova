import logging
import time
import uuid
import asyncio
from datetime import datetime
from typing import Tuple
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from core.audit import audit_log, consume_access_reason, set_audit_context
from core.config import settings
from core.database import get_supabase_admin, get_supabase_hostname, is_supabase_host_resolvable
from core.security import decode_access_token
from api.routes import auth, hr, manager, leadership, employee
from api.routes.ai import router as ai_router
from api.routes.intervention import router as intervention_router
from api.routes.events import router as events_router
from api.routes.graph import router as graph_router
from api.routes.simulate import router as simulate_router
from api.routes.ml import router as ml_router
from api.routes.audit import router as audit_router
from api.routes.me import router as me_router
from api.routes.feedback_sessions import router as feedback_sessions_router
from api.routes.schema import router as schema_router
from api.routes.insights import router as insights_router
from api.routes.explain import router as explain_router
from api.routes.reports import router as reports_router
from api.routes.benchmarks import router as benchmarks_router
from api.routes.integrations import router as integrations_router
from api.routes.manager_feedback import router as manager_feedback_router
from api.routes.onboarding import router as onboarding_router
from api.routes.org import router as org_router
from api.routes.meetings import router as meetings_router
from api.routes.messages import router as messages_router
from api.routes.recognition import router as recognition_router
from api.routes.departments import router as departments_router
from api.routes.org_tree import router as org_tree_router
from api.routes.hr_feedback import router as hr_feedback_router
from api.routes.appraisals import router as appraisals_router
from api.routes.voice_agent import router as voice_agent_router
from api.routes.webhooks import router as webhooks_router
from api.routes.task_assignments import router as task_assignments_router
from api.routes.job_board import router as job_board_router
from api.routes.work_profiles import router as work_profiles_router
from api.routes.composio_admin import router as composio_admin_router
from api.routes.composio_sync import router as composio_sync_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI application
app = FastAPI(
    title="NOVA API",
    description="Backend API for NOVA - AI Analytics",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

logger.info("🚀 Initializing NOVA API Server...")

# Configure CORS
logger.info("📡 Configuring CORS middleware...")
cors_origins = settings.get_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
logger.info("🔌 Registering API routes...")
app.include_router(auth.router)
logger.info("  ✓ Auth routes registered at /auth")
app.include_router(hr.router)
logger.info("  ✓ HR routes registered at /hr")
app.include_router(manager.router)
logger.info("  ✓ Manager routes registered at /manager")
app.include_router(leadership.router)
logger.info("  ✓ Leadership routes registered at /leadership")
app.include_router(employee.router)
logger.info("  ✓ Employee routes registered at /employee")
app.include_router(ai_router, prefix="/api/ai", tags=["AI Insights"])
app.include_router(intervention_router, prefix="/api/interventions", tags=["Interventions"])
app.include_router(events_router)
app.include_router(graph_router, prefix="/api/graph", tags=["Graph Analytics"])
app.include_router(simulate_router)
app.include_router(ml_router)
app.include_router(audit_router)
app.include_router(me_router)
app.include_router(feedback_sessions_router, prefix="/api/feedback", tags=["Feedback Sessions"])
app.include_router(schema_router)
app.include_router(insights_router)
app.include_router(explain_router)
app.include_router(reports_router)
app.include_router(benchmarks_router)
app.include_router(integrations_router)
app.include_router(manager_feedback_router)
app.include_router(onboarding_router)
app.include_router(org_router)
app.include_router(meetings_router)
app.include_router(messages_router)
app.include_router(recognition_router)
app.include_router(departments_router)
app.include_router(org_tree_router)
app.include_router(hr_feedback_router)
app.include_router(appraisals_router)
app.include_router(voice_agent_router)
app.include_router(webhooks_router)
app.include_router(task_assignments_router)
app.include_router(job_board_router)
app.include_router(work_profiles_router)
app.include_router(composio_admin_router)
app.include_router(composio_sync_router)


_SENSITIVE_GET_PREFIXES = (
    "/employee",
    "/hr",
    "/manager",
    "/leadership",
    "/api/interventions",
    "/api/ml",
    "/api/graph",
    "/api/simulate",
    "/api/ai/insights",
    "/api/ai/burnout-risk",
    "/api/ai/retention-risk",
    "/api/ai/performance-prediction",
    "/api/ai/sentiment",
    "/api/work-profiles",
    "/api/task-assignments",
    "/api/job-board",
)


def _is_sensitive_get_path(path: str) -> bool:
    for prefix in _SENSITIVE_GET_PREFIXES:
        if path == prefix or path.startswith(f"{prefix}/"):
            return True
    return False


def _infer_resource(path: str) -> Tuple[str, str]:
    segments = [segment for segment in path.split("/") if segment]
    if not segments:
        return "system", "root"

    if segments[0] == "employee":
        return "employees", segments[-1]
    if segments[0] in {"hr", "manager", "leadership"}:
        return "employees", segments[-1]
    if len(segments) >= 2 and segments[0] == "api" and segments[1] == "interventions":
        return "interventions", segments[-1]
    if len(segments) >= 2 and segments[0] == "api" and segments[1] in {"ml", "graph", "simulate", "ai"}:
        return "scores", segments[-1]
    return "resource", segments[-1]


def _resolve_request_user(request: Request) -> Tuple[str, str]:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        token_data = decode_access_token(token)
        if token_data and token_data.email:
            return token_data.email, str(token_data.role or "unknown")
    return "anonymous", "unknown"


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Log request start/end with latency and status code."""
    request_id = str(uuid.uuid4())[:8]
    client_ip = request.client.host if request.client else "unknown"
    user_id, user_role = _resolve_request_user(request)
    set_audit_context(user_id=user_id, user_role=user_role, ip_address=client_ip)
    start_time = time.perf_counter()

    logger.info(
        "➡️ [%s] %s %s from %s",
        request_id,
        request.method,
        request.url.path,
        client_ip,
    )

    try:
        response = await call_next(request)
    except HTTPException as exc:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.warning(
            "⬅️ [%s] %s %s -> %s in %.2fms (%s)",
            request_id,
            request.method,
            request.url.path,
            exc.status_code,
            duration_ms,
            exc.detail,
        )
        response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.exception(
            "💥 [%s] %s %s failed in %.2fms",
            request_id,
            request.method,
            request.url.path,
            duration_ms,
        )
        raise

    duration_ms = (time.perf_counter() - start_time) * 1000
    logger.info(
        "⬅️ [%s] %s %s -> %s in %.2fms",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )

    if (
        request.method.upper() == "GET"
        and response.status_code < 400
        and _is_sensitive_get_path(request.url.path)
    ):
        resource_type, resource_id = _infer_resource(request.url.path)
        reason = await consume_access_reason(
            user_id=user_id,
            action="read",
            resource_type=resource_type,
            resource_id=resource_id,
        )
        await audit_log(
            action="read",
            resource_type=resource_type,
            resource_id=resource_id,
            reason=reason,
        )

    response.headers["X-Request-ID"] = request_id
    return response


async def _process_sentiment_buffer() -> None:
    """Every 2 min: batch-analyze buffered messages per employee, delete after."""
    from collections import defaultdict
    from datetime import timezone
    from ai.schemas import SentimentRequest
    from ai.sentiment import analyze_sentiment
    from services.ingestion_service import IngestionService

    sb = get_supabase_admin()
    try:
        rows = (
            sb.table("message_buffer")
            .select("id, org_id, employee_email, message_text")
            .order("created_at")
            .limit(500)
            .execute()
        ).data or []
    except Exception as exc:
        logger.error("[SentimentBuffer] fetch failed: %s", exc)
        return

    if not rows:
        return

    logger.info("[SentimentBuffer] Fetched %d buffered messages to process", len(rows))

    buckets: dict[tuple, list[str]] = defaultdict(list)
    ids_by_key: dict[tuple, list[str]] = defaultdict(list)
    for row in rows:
        key = (row["org_id"], row["employee_email"])
        buckets[key].append(row["message_text"])
        ids_by_key[key].append(row["id"])

    for (org_id, email), msg_list in buckets.items():
        logger.info(
            "[SentimentBuffer] Bucket — org=%s email=%s message_count=%d",
            org_id, email, len(msg_list),
        )

    for (org_id, email), texts in buckets.items():
        try:
            logger.info(
                "[SentimentBuffer] Running sentiment — org=%s email=%s messages=%d",
                org_id, email, len(texts),
            )
            result = await analyze_sentiment(SentimentRequest(employee_id=email, texts=texts))
            emotions = (
                result.emotions
                if isinstance(result.emotions, dict)
                else result.emotions.model_dump()
            )
            svc = IngestionService(org_id=org_id, entity_id=org_id)
            svc._store_signal_row(
                employee_email=email,
                source="slack",
                signal_type="sentiment_batch",
                occurred_at=datetime.now(tz=timezone.utc),
                metadata={
                    "sentiment_score": result.score,
                    "label": result.label,
                    "dominant_emotion": result.dominant_emotion,
                    "emotions": emotions,
                    "sarcasm_detected": result.sarcasm_detected,
                    "confidence": result.confidence,
                    "message_count": len(texts),
                },
            )
            sb.table("message_buffer").delete().in_("id", ids_by_key[(org_id, email)]).execute()
            logger.info("[SentimentBuffer] processed %d msgs → %s (score=%.2f)", len(texts), email, result.score)
        except Exception as exc:
            logger.error("[SentimentBuffer] failed for %s: %s", email, exc)


async def _composio_nightly_sync() -> None:
    """Pull last 24h of signals for every active Composio-connected org."""
    from services.ingestion_service import IngestionService
    sb = get_supabase_admin()
    try:
        connections = (
            sb.table("composio_connections")
            .select("org_id, composio_entity_id, app_name")
            .eq("is_active", True)
            .execute()
        ).data or []
    except Exception as exc:
        logger.error("[Composio] Nightly sync: could not fetch connections: %s", exc)
        return

    # Group by org
    org_map: dict[str, dict] = {}
    for row in connections:
        oid = row["org_id"]
        if oid not in org_map:
            org_map[oid] = {"entity_id": row["composio_entity_id"], "apps": []}
        org_map[oid]["apps"].append(row["app_name"])

    for org_id, info in org_map.items():
        svc = IngestionService(org_id=org_id, entity_id=info["entity_id"])
        for app in info["apps"]:
            try:
                if app == "slack":
                    await svc.sync_slack_with_sentiment(since_hours=24)
                elif app == "gmail":
                    await svc.sync_gmail(since_hours=24)
            except Exception as exc:
                logger.error("[Composio] Nightly sync failed org=%s app=%s: %s", org_id, app, exc)

        try:
            sb.table("composio_connections").update({"last_synced_at": "now()"}).eq(
                "org_id", org_id
            ).execute()
        except Exception:
            pass


@app.on_event("startup")
async def startup_event():
    """Log startup information."""
    startup_t0 = time.perf_counter()
    supabase_host = get_supabase_hostname()
    dns_timeout_seconds = max(float(settings.STARTUP_DNS_CHECK_TIMEOUT_SECONDS), 0.1)
    try:
        supabase_dns_ok = await asyncio.wait_for(
            run_in_threadpool(is_supabase_host_resolvable),
            timeout=dns_timeout_seconds,
        )
    except asyncio.TimeoutError:
        supabase_dns_ok = False
        logger.warning(
            "⚠️ Supabase DNS check timed out after %.1fs (host=%s). Continuing startup.",
            dns_timeout_seconds,
            supabase_host,
        )
    except Exception as exc:
        supabase_dns_ok = False
        logger.warning("⚠️ Supabase DNS check failed for host=%s: %s", supabase_host, exc)

    from core.scheduler import get_scheduler
    scheduler = get_scheduler()
    scheduler.register_job(
        "sentiment_buffer_flush",
        _process_sentiment_buffer,
        interval_seconds=120,  # every 2 minutes
    )
    scheduler.register_job(
        "composio_nightly_sync",
        _composio_nightly_sync,
        interval_seconds=86400,
    )

    if not settings.SCHEDULER_RUN_JOBS_ON_STARTUP:
        now = datetime.utcnow()
        for job_id in ("sentiment_buffer_flush", "composio_nightly_sync"):
            job = scheduler.jobs.get(job_id)
            if job and job.last_run is None:
                job.last_run = now

    await scheduler.start()

    logger.info("=" * 60)
    logger.info("🎉 NOVA API Server Started Successfully!")
    logger.info("=" * 60)
    logger.info(f"📍 Host: {settings.HOST}:{settings.PORT}")
    logger.info(f"🌐 Frontend URL: {settings.FRONTEND_URL}")
    logger.info("🌐 CORS origins: %s", ", ".join(cors_origins))
    logger.info(f"📚 API Docs: http://{settings.HOST}:{settings.PORT}/docs")
    if supabase_dns_ok:
        logger.info("🔐 Supabase DNS: reachable (%s)", supabase_host)
    else:
        logger.warning("⚠️ Supabase DNS: unreachable (%s). Database auth may fail.", supabase_host)
    logger.info("=" * 60)
    logger.info("Available endpoints:")
    logger.info("  POST /auth/login - Login with email/password")
    logger.info("  POST /auth/register - Register new user")
    logger.info("  GET  /auth/me - Get current user info")
    logger.info("  POST /auth/logout - Logout (invalidate token)")
    logger.info("  GET  /hr/* - HR role endpoints")
    logger.info("  GET  /manager/* - Manager role endpoints")
    logger.info("  GET  /leadership/* - Leadership role endpoints")
    logger.info("  GET  /employee/* - Employee endpoints")
    logger.info(
        "⏱️ Startup completed in %.2fms",
        (time.perf_counter() - startup_t0) * 1000,
    )
    logger.info("=" * 60)


@app.on_event("shutdown")
async def shutdown_event():
    """Log shutdown information."""
    logger.info("👋 NOVA API Server shutting down...")
    from core.scheduler import stop_scheduler
    await stop_scheduler()
    logger.info("🧹 Cleanup complete. Goodbye.")


@app.get("/")
async def root():
    """Root endpoint - API health check."""
    logger.info("📍 Root endpoint accessed")
    return {
        "message": "NOVA API",
        "version": "1.0.0",
        "status": "operational",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
    logger.debug("💚 Health check endpoint accessed")
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
