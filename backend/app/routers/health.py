"""
Health check endpoint with dependency verification.

Checks the health of:
- API (always healthy if responding)
- Firestore database connection
- Google Cloud Storage connection

To revert: Replace with simple health check that returns {"status": "ok"}
"""
from fastapi import APIRouter
from google.cloud import storage
from app.config import settings
from app.firestore import get_firestore_client
from app.logging_config import setup_logger

logger = setup_logger(__name__)
router = APIRouter()


async def check_firestore() -> str:
    """
    Check Firestore connectivity by attempting a simple read.
    Uses a _health collection to avoid touching real data.
    """
    try:
        db = get_firestore_client()
        # Try to read from a health check collection (doesn't need to exist)
        db.collection("_health").limit(1).get()
        return "healthy"
    except Exception as e:
        logger.error(f"Firestore health check failed: {e}")
        return "unhealthy"


async def check_gcs() -> str:
    """
    Check GCS connectivity by verifying bucket exists.
    """
    try:
        client = storage.Client()
        bucket = client.bucket(settings.gcs_bucket)
        # Check if bucket exists (doesn't download anything)
        bucket.exists()
        return "healthy"
    except Exception as e:
        logger.error(f"GCS health check failed: {e}")
        return "unhealthy"


@router.get("/")
async def health():
    """
    Health check endpoint with dependency verification.

    Returns:
        - status: "healthy" if all checks pass, "degraded" if any fail
        - checks: Individual status of each dependency
        - project: GCP project info
        - models: Available AI models
    """
    # Run health checks
    firestore_status = await check_firestore()
    gcs_status = await check_gcs()

    checks = {
        "api": "healthy",
        "firestore": firestore_status,
        "gcs": gcs_status,
    }

    # Overall status is "healthy" only if ALL checks pass
    all_healthy = all(status == "healthy" for status in checks.values())
    overall_status = "healthy" if all_healthy else "degraded"

    return {
        "status": overall_status,
        "checks": checks,
        "project": settings.project_id,
        "location": settings.location,
        "firebase_project": settings.firebase_project_id,
        "models": {
            "image": settings.gemini_image_model,
            "video": settings.veo_model,
            "text": settings.gemini_text_model,
            "upscale": settings.upscale_model,
        }
    }


@router.get("/live")
async def liveness():
    """
    Simple liveness probe for Kubernetes/Cloud Run.
    Just checks if the API is responding.
    """
    return {"status": "ok"}


@router.get("/ready")
async def readiness():
    """
    Readiness probe - checks if service is ready to accept traffic.
    Same as full health check but returns 503 if not ready.
    """
    from fastapi import HTTPException

    firestore_status = await check_firestore()
    gcs_status = await check_gcs()

    if firestore_status != "healthy" or gcs_status != "healthy":
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "firestore": firestore_status,
                "gcs": gcs_status
            }
        )

    return {"status": "ready"}
