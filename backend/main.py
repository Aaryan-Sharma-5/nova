import logging
import time
import uuid
from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.database import get_supabase_hostname, is_supabase_host_resolvable
from api.routes import auth, hr, manager, leadership, employee
from api.routes.ai import router as ai_router

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


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Log request start/end with latency and status code."""
    request_id = str(uuid.uuid4())[:8]
    client_ip = request.client.host if request.client else "unknown"
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
