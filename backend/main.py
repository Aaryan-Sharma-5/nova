import logging
import time
import uuid
from typing import Tuple
from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from core.audit import audit_log, consume_access_reason, set_audit_context
from core.config import settings
from core.database import get_supabase_hostname, is_supabase_host_resolvable
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
from api.routes.meetings import router as meetings_router
from api.routes.messages import router as messages_router
from api.routes.recognition import router as recognition_router
from api.routes.departments import router as departments_router
from api.routes.org_tree import router as org_tree_router
from api.routes.hr_feedback import router as hr_feedback_router
from api.routes.appraisals import router as appraisals_router

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
app.include_router(meetings_router)
app.include_router(messages_router)
app.include_router(recognition_router)
app.include_router(departments_router)
app.include_router(org_tree_router)
app.include_router(hr_feedback_router)
app.include_router(appraisals_router)


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


@app.on_event("startup")
async def startup_event():
    """Log startup information."""
    supabase_host = get_supabase_hostname()
    supabase_dns_ok = is_supabase_host_resolvable()

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
    logger.info("=" * 60)


@app.on_event("shutdown")
async def shutdown_event():
    """Log shutdown information."""
    logger.info("👋 NOVA API Server shutting down...")
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
