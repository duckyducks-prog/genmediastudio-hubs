import os
from uuid import uuid4
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routers import generation, library, health, workflow, elevenlabs, video_processing, folders, shared, scene_elements, workflow_metadata
from app.logging_config import setup_logger
from app.exceptions import AppError

logger = setup_logger(__name__)

# CORS configuration - restrict to known origins
# Set ALLOWED_ORIGINS env var as comma-separated list to override defaults
# Defined early so exception handlers can use it
DEFAULT_ORIGINS = [
    "https://a5df8c929ca74fbc80fe95abcebf06ed-br-2c5574706fc84239af4efff8b.fly.dev",
    "https://genmedia-frontend-otfo2ctxma-uc.a.run.app",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:8000",
    "http://localhost:8080",
    "http://localhost:8081",
]
# Parse ALLOWED_ORIGINS, falling back to defaults if env var is empty or unset
_origins_env = os.getenv("ALLOWED_ORIGINS", "").strip()
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()] if _origins_env else DEFAULT_ORIGINS

# Log CORS configuration at startup for debugging
logger.info(f"CORS allowed origins: {ALLOWED_ORIGINS}")


def _get_cors_headers(request: Request, allowed_origins: list[str]) -> dict:
    """
    Build CORS headers for a response based on the request origin.

    This ensures error responses include proper CORS headers, which the
    CORSMiddleware may not add when exceptions are raised.
    """
    origin = request.headers.get("origin")
    if origin and origin in allowed_origins:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
        }
    # Log when CORS headers are not added (helps debug CORS issues)
    if origin:
        logger.warning(f"CORS: Origin '{origin}' not in allowed list. Allowed: {allowed_origins}")
    return {}

app = FastAPI(title="GenMedia API")


# ============== REQUEST TRACING MIDDLEWARE ==============
# Adds X-Request-ID header to all requests for distributed tracing
# To revert: Remove this middleware function and uuid4 import

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """
    Add request ID for tracing requests across logs.

    - Uses X-Request-ID from incoming request if provided (from frontend/load balancer)
    - Generates a new UUID if not provided
    - Returns the request ID in response headers
    - Stores request_id in request.state for use in route handlers

    Frontend can read the X-Request-ID from response headers to correlate logs.
    """
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    # Store in request state for access in route handlers
    request.state.request_id = request_id

    # Log the request with its ID
    logger.info(f"[{request_id}] {request.method} {request.url.path}")

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# ============== EXCEPTION HANDLERS ==============
# Custom exception handlers with CORS headers for error responses.
# Without explicit CORS headers on error responses, browsers block the
# response and mask the actual error with a CORS error message.

@app.exception_handler(AppError)
async def handle_app_error(request: Request, exc: AppError):
    """
    Handle all custom application errors with consistent JSON responses.

    Returns structured error response:
    {
        "error": "Human-readable message",
        "code": "MACHINE_READABLE_CODE",
        "details": {...}  // Optional additional context
    }
    """
    logger.warning(f"AppError {exc.code}: {exc.message} (status={exc.status})")
    return JSONResponse(
        status_code=exc.status,
        content=exc.to_dict(),
        headers=_get_cors_headers(request, ALLOWED_ORIGINS)
    )


@app.exception_handler(HTTPException)
async def handle_http_exception(request: Request, exc: HTTPException):
    """
    Handle HTTPException with CORS headers.

    When routes raise HTTPException (e.g., 500 errors), the CORSMiddleware
    may not add CORS headers to the error response. This causes browsers to
    report a CORS error, masking the actual HTTP error from the frontend.

    This handler ensures all HTTP errors include proper CORS headers so the
    frontend can read the actual error status and message.
    """
    logger.warning(f"HTTPException: status={exc.status_code}, detail={exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=_get_cors_headers(request, ALLOWED_ORIGINS)
    )


@app.exception_handler(Exception)
async def handle_unhandled_exception(request: Request, exc: Exception):
    """
    Catch-all handler for unhandled exceptions.

    Ensures even unexpected errors return proper CORS headers and a
    structured error response instead of crashing without CORS headers.
    """
    logger.error(f"Unhandled exception: {type(exc).__name__}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"Internal server error: {type(exc).__name__}",
            "error": str(exc)
        },
        headers=_get_cors_headers(request, ALLOWED_ORIGINS)
    )

logger.info("Starting GenMedia API application")

# Add CORS middleware using the configuration defined at top of file
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],  # Allow frontend to read this header
)

# Mount routers
# Health check at root level (no versioning needed)
app.include_router(health.router, tags=["health"])

# API v1 routes
# To add v2 in future: create new router files and mount with prefix="/v2/..."
app.include_router(generation.router, prefix="/v1/generate", tags=["generation"])
app.include_router(library.router, prefix="/v1/assets", tags=["assets"])
app.include_router(folders.router, prefix="/v1/folders", tags=["folders"])
app.include_router(workflow.router, prefix="/v1/workflows", tags=["workflows"])
app.include_router(shared.router, prefix="/v1/shared", tags=["shared"])
app.include_router(scene_elements.router, prefix="/v1/scene-elements", tags=["scene-elements"])
app.include_router(workflow_metadata.router, prefix="/v1/workflow-metadata", tags=["workflow-metadata"])
app.include_router(elevenlabs.router, tags=["elevenlabs"])
app.include_router(video_processing.router, tags=["video-processing"])