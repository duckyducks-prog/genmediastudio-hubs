import asyncio
import json
from functools import lru_cache
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas import (
    ImageRequest, ImageResponse,
    VideoRequest, StatusRequest, VideoStatusResponse,
    TextRequest, TextResponse,
    UpscaleRequest, UpscaleResponse,
    MusicRequest, MusicResponse
)
from app.auth import get_current_user
from app.services.generation import GenerationService
from app.services.library_firestore import LibraryServiceFirestore
from app.logging_config import setup_logger
from app.exceptions import AppError
import base64
import httpx
import re

logger = setup_logger(__name__)
router = APIRouter()

@lru_cache
def get_library_service() -> LibraryServiceFirestore:
    """
    Cached factory for LibraryServiceFirestore used in asset resolution.

    To revert: Remove this function and change resolve_asset_to_base64
    back to creating LibraryServiceFirestore() inline.
    """
    return LibraryServiceFirestore()

async def resolve_asset_to_base64(asset_id: str, user_id: str) -> str:
    """Resolve an asset ID to base64 image data by fetching from GCS.

    Validates that the user owns the asset before allowing access.
    """
    try:
        # Get asset with ownership check
        library_service = get_library_service()
        asset = await library_service.get_asset(asset_id, user_id)

        if not asset or not asset.url:
            raise ValueError(f"Asset {asset_id} not found or has no URL")

        # Download the image from GCS URL with timeout to prevent hanging
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            response = await client.get(asset.url)
            response.raise_for_status()
            image_bytes = response.content

        # Convert to base64
        return base64.b64encode(image_bytes).decode('utf-8')
    except httpx.TimeoutException as e:
        logger.error(f"Timeout downloading asset {asset_id}: {e}")
        raise ValueError(f"Timeout downloading asset {asset_id}. The file may be too large or GCS is slow.")
    except Exception as e:
        logger.error(f"Failed to resolve asset {asset_id}: {e}")
        raise

def is_asset_id(value: str) -> bool:
    """Check if a string looks like an asset ID (UUID format)"""
    # UUID pattern: 8-4-4-4-12 hex characters
    uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    return bool(re.match(uuid_pattern, value, re.IGNORECASE))

def is_gcs_url(value: str) -> bool:
    """Check if a string is a GCS URL"""
    return value.startswith("https://storage.googleapis.com/") or value.startswith("gs://")

async def resolve_gcs_url_to_base64(gcs_url: str) -> str:
    """Fetch image from GCS URL and return as base64.

    This handles the case where frontend sends a GCS URL instead of base64 data,
    which can happen when loading saved workflows.
    """
    try:
        logger.info(f"Fetching image from GCS URL: {gcs_url[:80]}...")
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            response = await client.get(gcs_url)
            response.raise_for_status()
            image_bytes = response.content

        result = base64.b64encode(image_bytes).decode('utf-8')
        logger.info(f"Converted GCS URL to base64: {len(result)} chars, {len(image_bytes)} bytes")
        return result
    except httpx.TimeoutException as e:
        logger.error(f"Timeout fetching GCS URL {gcs_url}: {e}")
        raise ValueError(f"Timeout fetching image from GCS. The file may be too large.")
    except Exception as e:
        logger.error(f"Failed to fetch GCS URL {gcs_url}: {e}")
        raise ValueError(f"Failed to fetch image: {e}")

@lru_cache
def get_generation_service() -> GenerationService:
    """
    Cached factory for GenerationService.

    Uses @lru_cache to ensure only one instance is created and reused
    across all requests, avoiding repeated initialization of the GenAI
    client and LibraryServiceFirestore.

    To revert: Remove @lru_cache decorator from this function.
    """
    return GenerationService()

@router.post("/image", response_model=ImageResponse)
async def generate_image(
    request: ImageRequest,
    user: dict = Depends(get_current_user),
    service: GenerationService = Depends(get_generation_service)
):
    """Generate images using Gemini 3 Pro Image"""
    try:
        ref_count = len(request.reference_images) if request.reference_images else 0
        logger.info(f"Image generation request from user {user['email']}, prompt={request.prompt[:50]}..., reference_images={ref_count}")

        # Resolve asset IDs and GCS URLs to base64 image data
        reference_images_data = None

        if request.reference_images:
            async_tasks = []
            task_mapping = []  # Track which reference images need async resolution
            reference_images_data = [None] * len(request.reference_images)

            for i, ref_img in enumerate(request.reference_images):
                if is_asset_id(ref_img):
                    logger.info(f"Resolving reference_image asset ID: {ref_img}")
                    async_tasks.append(resolve_asset_to_base64(ref_img, user["uid"]))
                    task_mapping.append(i)
                elif is_gcs_url(ref_img):
                    # Handle GCS URLs from saved workflows
                    logger.info(f"Resolving reference_image GCS URL: {ref_img[:80]}...")
                    async_tasks.append(resolve_gcs_url_to_base64(ref_img))
                    task_mapping.append(i)
                else:
                    # Already base64 data
                    reference_images_data[i] = ref_img
                    if len(ref_img) < 200:
                        logger.info(f"Reference image {i} appears to be raw data: {ref_img[:100]}...")
                    else:
                        logger.info(f"Reference image {i} is base64 data: {len(ref_img)} chars")

            # Execute all asset resolutions in parallel
            if async_tasks:
                logger.info(f"Resolving {len(async_tasks)} reference image assets in parallel")
                results = await asyncio.gather(*async_tasks, return_exceptions=True)

                for idx, target_idx in enumerate(task_mapping):
                    result = results[idx]
                    if isinstance(result, Exception):
                        logger.error(f"Failed to resolve reference image asset: {result}")
                        raise result
                    reference_images_data[target_idx] = result
                    logger.info(f"Resolved reference image {target_idx}: {len(result)} chars")

        return await service.generate_image(
            prompt=request.prompt,
            user_id=user["uid"],
            reference_images=reference_images_data,
            aspect_ratio=request.aspect_ratio,
            resolution=request.resolution
        )
    except AppError:
        # Let custom exceptions (RateLimitError, NoContentGeneratedError, etc.) propagate
        raise
    except Exception as e:
        logger.error(f"Image generation failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/video")
async def generate_video(
    request: VideoRequest,
    user: dict = Depends(get_current_user),
    service: GenerationService = Depends(get_generation_service)
):
    """Generate video using Veo 3.1"""
    try:
        logger.info(f"Video generation request from user {user['email']}")
        logger.info(f"Video params: prompt={request.prompt[:50] if request.prompt else 'None'}..., first_frame={'Yes' if request.first_frame else 'No'}, aspect_ratio={request.aspect_ratio}, duration={request.duration_seconds}, seed={request.seed}")
        
        # Resolve asset IDs to base64 image data in parallel
        # All inputs to a single generation request are independent
        first_frame_data = None
        last_frame_data = None
        reference_images_data = None

        # Collect all async tasks for parallel execution
        async_tasks = []
        task_mapping = []  # Track what each task is for

        # First frame resolution
        if request.first_frame:
            if is_asset_id(request.first_frame):
                logger.info(f"Resolving first_frame asset ID: {request.first_frame}")
                async_tasks.append(resolve_asset_to_base64(request.first_frame, user["uid"]))
                task_mapping.append(("first_frame", 0))
            elif is_gcs_url(request.first_frame):
                # Handle GCS URLs from saved workflows
                logger.info(f"Resolving first_frame GCS URL: {request.first_frame[:80]}...")
                async_tasks.append(resolve_gcs_url_to_base64(request.first_frame))
                task_mapping.append(("first_frame", 0))
            else:
                first_frame_data = request.first_frame
                frame_preview = first_frame_data[:100] if len(first_frame_data) > 100 else first_frame_data
                logger.info(f"First frame data length: {len(first_frame_data)}, preview: {frame_preview}")

        # Last frame resolution
        if request.last_frame:
            if is_asset_id(request.last_frame):
                logger.info(f"Resolving last_frame asset ID: {request.last_frame}")
                async_tasks.append(resolve_asset_to_base64(request.last_frame, user["uid"]))
                task_mapping.append(("last_frame", 0))
            elif is_gcs_url(request.last_frame):
                # Handle GCS URLs from saved workflows
                logger.info(f"Resolving last_frame GCS URL: {request.last_frame[:80]}...")
                async_tasks.append(resolve_gcs_url_to_base64(request.last_frame))
                task_mapping.append(("last_frame", 0))
            else:
                last_frame_data = request.last_frame
                frame_preview = last_frame_data[:100] if len(last_frame_data) > 100 else last_frame_data
                logger.info(f"Last frame data length: {len(last_frame_data)}, preview: {frame_preview}")

        # Reference images resolution - collect tasks for parallel execution
        ref_img_indices = []  # Track which reference images need async resolution
        if request.reference_images:
            reference_images_data = [None] * len(request.reference_images)
            for i, ref_img in enumerate(request.reference_images):
                if is_asset_id(ref_img):
                    logger.info(f"Resolving reference_image asset ID: {ref_img}")
                    async_tasks.append(resolve_asset_to_base64(ref_img, user["uid"]))
                    task_mapping.append(("ref_img", i))
                    ref_img_indices.append(i)
                elif is_gcs_url(ref_img):
                    # Handle GCS URLs from saved workflows
                    logger.info(f"Resolving reference_image GCS URL: {ref_img[:80]}...")
                    async_tasks.append(resolve_gcs_url_to_base64(ref_img))
                    task_mapping.append(("ref_img", i))
                    ref_img_indices.append(i)
                else:
                    reference_images_data[i] = ref_img

        # Execute all asset resolutions in parallel (single round of concurrent HTTP calls)
        if async_tasks:
            logger.info(f"Resolving {len(async_tasks)} assets in parallel")
            results = await asyncio.gather(*async_tasks, return_exceptions=True)

            # Map results back to their destinations
            for idx, (task_type, target_idx) in enumerate(task_mapping):
                result = results[idx]
                if isinstance(result, Exception):
                    logger.error(f"Failed to resolve asset: {result}")
                    raise result
                if task_type == "first_frame":
                    first_frame_data = result
                elif task_type == "last_frame":
                    last_frame_data = result
                elif task_type == "ref_img":
                    reference_images_data[target_idx] = result

        return await service.generate_video(
            prompt=request.prompt,
            user_id=user["uid"],
            first_frame=first_frame_data,
            last_frame=last_frame_data,
            reference_images=reference_images_data,
            aspect_ratio=request.aspect_ratio,
            duration_seconds=request.duration_seconds,
            generate_audio=request.generate_audio,
            seed=request.seed
        )
    except AppError:
        # Let custom exceptions propagate to global handler
        raise
    except Exception as e:
        logger.error(f"Video generation failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/text", response_model=TextResponse)
async def generate_text(
    request: TextRequest,
    user: dict = Depends(get_current_user),
    service: GenerationService = Depends(get_generation_service)
):
    """Generate text using Gemini 3 Pro"""
    try:
        logger.info(f"Text generation request from user {user['email']}")
        return await service.generate_text(
            prompt=request.prompt,
            system_prompt=request.system_prompt,
            context=request.context,
            temperature=request.temperature
        )
    except AppError:
        raise
    except Exception as e:
        logger.error(f"Text generation failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/video/status", response_model=VideoStatusResponse)
async def check_video_status(
    operation_id: str,
    prompt: Optional[str] = None,
    user: dict = Depends(get_current_user),
    service: GenerationService = Depends(get_generation_service)
):
    """Check video generation status"""
    try:
        # URL-decode the operation_id in case it was encoded
        from urllib.parse import unquote
        decoded_operation_id = unquote(operation_id)

        # Log request details for debugging
        logger.info(f"Video status check: user={user['email']}, operation_id={decoded_operation_id[:80]}...")

        result = await service.check_video_status(
            operation_name=decoded_operation_id,
            user_id=user["uid"],
            prompt=prompt
        )

        # Log result for debugging
        logger.info(f"Video status result: status={result.status}, has_video={bool(result.video_base64)}, has_url={bool(result.video_url)}")
        return result

    except AppError:
        raise
    except Exception as e:
        # Log full exception details including stack trace
        logger.error(
            f"Video status check failed: user={user['email']}, "
            f"operation_id={operation_id[:50]}..., "
            f"error={type(e).__name__}: {str(e)}",
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Video status check failed: {type(e).__name__}: {str(e)}"
        )

@router.get("/video/stream")
async def stream_video_status(
    operation_id: str,
    prompt: Optional[str] = None,
    user: dict = Depends(get_current_user),
    service: GenerationService = Depends(get_generation_service),
):
    """Stream video generation status via Server-Sent Events"""
    from urllib.parse import unquote
    decoded_operation_id = unquote(operation_id)
    logger.info(f"SSE video stream started: user={user['email']}, operation_id={decoded_operation_id[:80]}...")

    async def event_generator():
        max_attempts = 30
        for attempt in range(1, max_attempts + 1):
            try:
                result = await service.check_video_status(
                    operation_name=decoded_operation_id,
                    user_id=user["uid"],
                    prompt=prompt,
                )

                if result.status == "complete":
                    logger.info(f"SSE: Video complete (attempt {attempt})")
                    yield f"data: {result.model_dump_json()}\n\n"
                    return
                elif result.status == "error":
                    logger.warning(f"SSE: Video error (attempt {attempt}): {result.error}")
                    yield f"data: {result.model_dump_json()}\n\n"
                    return
                else:
                    yield f"data: {json.dumps({'status': 'processing', 'attempt': attempt})}\n\n"
            except Exception as e:
                logger.error(f"SSE: Exception during status check (attempt {attempt}): {e}", exc_info=True)
                yield f"data: {json.dumps({'status': 'error', 'error': str(e)})}\n\n"
                return

            await asyncio.sleep(10)

        logger.warning(f"SSE: Video generation timed out after {max_attempts} attempts")
        yield f"data: {json.dumps({'status': 'error', 'error': 'Timed out after 5 minutes'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

@router.post("/upscale", response_model=UpscaleResponse)
async def upscale_image(
    request: UpscaleRequest,
    user: dict = Depends(get_current_user),
    service: GenerationService = Depends(get_generation_service)
):
    """Upscale an image using Imagen 4.0"""
    try:
        logger.info(f"Image upscale request from user {user['email']}")
        return await service.upscale_image(
            image=request.image,
            upscale_factor=request.upscale_factor,
            output_mime_type=request.output_mime_type,
            user_id=user["uid"],
        )
    except AppError:
        raise
    except Exception as e:
        logger.error(f"Image upscale failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/music", response_model=MusicResponse)
async def generate_music(
    request: MusicRequest,
    user: dict = Depends(get_current_user),
    service: GenerationService = Depends(get_generation_service)
):
    """Generate music using Google Lyria"""
    try:
        logger.info(f"Music generation request from user {user['email']}, prompt={request.prompt[:50]}...")
        return await service.generate_music(
            prompt=request.prompt,
            user_id=user["uid"]
        )
    except AppError:
        raise
    except Exception as e:
        logger.error(f"Music generation failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
