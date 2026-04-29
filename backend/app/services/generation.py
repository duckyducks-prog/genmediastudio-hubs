import base64
import httpx
import asyncio
import re
import google.auth
import google.auth.transport.requests
from google import genai
from google.genai import types
from typing import Optional, List
from app.config import settings
from app.schemas import ImageResponse, TextResponse, UpscaleResponse, VideoStatusResponse, MusicResponse
from app.services.library_firestore import LibraryServiceFirestore
from app.logging_config import setup_logger
from app.exceptions import (
    RateLimitError,
    NoContentGeneratedError,
    UpstreamAPIError,
    RequestTimeoutError
)

logger = setup_logger(__name__)

# Retry configuration
MAX_RETRIES = 5
INITIAL_RETRY_DELAY = 5  # seconds (longer initial delay)
MAX_RETRY_DELAY = 60  # seconds

# Shared HTTP client with connection pooling for Vertex AI REST calls
# Reuses connections across requests, saving ~50-100ms per request
# To revert: Remove this and change _get_http_client() to create new AsyncClient() each time
_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    """
    Get or create shared HTTP client with connection pooling.

    Benefits:
    - Reuses TCP connections (saves ~50-100ms per request)
    - For workflows with 20+ nodes, saves 1-2 seconds total

    To revert: Return `httpx.AsyncClient()` directly (no pooling)
    """
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(600.0, connect=30.0),  # 10min request, 30s connect (video generation can be slow)
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10)
        )
    return _http_client


# Initialize the client
client = genai.Client(
    vertexai=True,
    project=settings.project_id,
    location=settings.location
)

image_client = genai.Client(
    vertexai=True,
    project=settings.project_id,
    location=settings.gemini_image_location  # Gemini 3 Pro Image requires global endpoint
)


class GenerationService:
    def __init__(self, library_service: Optional[LibraryServiceFirestore] = None):
        self.library = library_service or LibraryServiceFirestore()
    
    def _strip_base64_prefix(self, data: str) -> str:
        """Remove data URL prefix, clean invalid characters, and ensure valid base64.

        This method:
        1. Strips data URL prefix (data:image/...;base64,)
        2. Removes whitespace, newlines, and carriage returns
        3. Removes any non-base64 characters
        4. Fixes padding to ensure length is multiple of 4
        5. Validates the result can be decoded
        """
        if not data:
            return data

        # Remove data URL prefix if present
        if ',' in data and data.startswith('data:'):
            data = data.split(',', 1)[1]

        # Remove all whitespace (spaces, tabs, newlines, carriage returns)
        # This is crucial - base64 from some sources includes line breaks
        data = re.sub(r'\s', '', data)

        # Remove any characters that aren't valid base64
        # Valid base64 chars: A-Z, a-z, 0-9, +, /, =
        data = re.sub(r'[^A-Za-z0-9+/=]', '', data)

        # Remove any existing padding to recalculate
        data = data.rstrip('=')

        # Add correct padding (base64 strings must be multiple of 4)
        missing_padding = len(data) % 4
        if missing_padding:
            data += '=' * (4 - missing_padding)

        # Validate the base64 can be decoded
        try:
            base64.b64decode(data)
            logger.debug(f"Base64 validation passed, length: {len(data)}")
        except Exception as e:
            logger.error(f"Base64 validation failed after cleaning: {e}")
            logger.error(f"Data preview (first 100 chars): {data[:100]}")
            # Return the data anyway - let the API give a more specific error
            # rather than failing silently here

        return data

    def _detect_mime_type(self, data: str) -> str:
        """Detect MIME type from base64 encoded image data by checking file headers.

        Returns 'image/png' for PNG files, 'image/jpeg' for JPEG files.
        Defaults to 'image/png' if unable to detect.
        """
        if not data:
            return "image/png"

        try:
            # Strip prefix if present
            clean_data = self._strip_base64_prefix(data)

            # Decode enough bytes to check the header (first 16 bytes is plenty)
            # We only need first 8 bytes for PNG and 2 bytes for JPEG
            header_b64 = clean_data[:24]  # 24 base64 chars = 18 bytes
            header_bytes = base64.b64decode(header_b64)

            # Check for PNG signature: 89 50 4E 47 0D 0A 1A 0A
            if header_bytes[:8] == b'\x89PNG\r\n\x1a\n':
                logger.debug("Detected MIME type: image/png")
                return "image/png"

            # Check for JPEG signature: FF D8
            if header_bytes[:2] == b'\xff\xd8':
                logger.debug("Detected MIME type: image/jpeg")
                return "image/jpeg"

            # Check for WebP signature: RIFF....WEBP
            if header_bytes[:4] == b'RIFF' and len(header_bytes) >= 12 and header_bytes[8:12] == b'WEBP':
                logger.debug("Detected MIME type: image/webp")
                return "image/webp"

            logger.warning(f"Could not detect MIME type from header bytes: {header_bytes[:8].hex()}, defaulting to image/png")
            return "image/png"

        except Exception as e:
            logger.warning(f"Error detecting MIME type: {e}, defaulting to image/png")
            return "image/png"
    
    def _get_auth_headers(self) -> dict:
        """Get authentication headers for REST API calls"""
        credentials, _ = google.auth.default()
        auth_req = google.auth.transport.requests.Request()
        credentials.refresh(auth_req)
        return {
            "Authorization": f"Bearer {credentials.token}",
            "Content-Type": "application/json"
        }
    
    async def _retry_with_backoff(self, operation, operation_name: str):
        """Execute an operation with exponential backoff retry on rate limit and timeout errors"""
        last_exception = None

        for attempt in range(MAX_RETRIES):
            try:
                return await operation()
            except RateLimitError as e:
                # Custom rate limit exception - always retry
                delay = min(INITIAL_RETRY_DELAY * (2 ** attempt), MAX_RETRY_DELAY)
                logger.warning(f"{operation_name}: Rate limited (attempt {attempt + 1}/{MAX_RETRIES}). Retrying in {delay}s...")
                await asyncio.sleep(delay)
                last_exception = e
            except httpx.TimeoutException as e:
                # Timeout errors - retry with longer delays
                delay = min(INITIAL_RETRY_DELAY * (2 ** attempt), MAX_RETRY_DELAY)
                logger.warning(f"{operation_name}: Request timed out (attempt {attempt + 1}/{MAX_RETRIES}). Retrying in {delay}s...")
                await asyncio.sleep(delay)
                last_exception = e
            except Exception as e:
                error_str = str(e)
                # Legacy check for string-based rate limit errors
                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    delay = min(INITIAL_RETRY_DELAY * (2 ** attempt), MAX_RETRY_DELAY)
                    logger.warning(f"{operation_name}: Rate limited (attempt {attempt + 1}/{MAX_RETRIES}). Retrying in {delay}s...")
                    await asyncio.sleep(delay)
                    last_exception = e
                else:
                    # Not a rate limit error, raise immediately
                    raise

        # All retries exhausted
        logger.error(f"{operation_name}: All {MAX_RETRIES} retries exhausted")
        # Wrap timeout exceptions with user-friendly error
        if isinstance(last_exception, httpx.TimeoutException):
            raise RequestTimeoutError(operation_name)
        raise last_exception

    async def generate_image(
        self,
        prompt: str,
        user_id: str,
        reference_images: Optional[List[str]] = None,
        aspect_ratio: str = "1:1",
        resolution: str = "1K"
    ) -> ImageResponse:
        """Generate images using Gemini with retry on rate limits"""

        async def _do_generate():
            contents = []

            # Add reference images if provided - use as visual ingredients
            if reference_images:
                logger.info(f"Processing {len(reference_images)} reference images as ingredients")
                valid_images = []

                for i, ref_image in enumerate(reference_images):
                    try:
                        clean_image = self._strip_base64_prefix(ref_image)
                        image_bytes = base64.b64decode(clean_image)

                        # Validate image size (Gemini requires reasonable sized images)
                        if len(image_bytes) < 100:
                            logger.warning(f"Reference image {i+1} too small ({len(image_bytes)} bytes), skipping")
                            continue

                        # Check for valid PNG/JPEG header
                        is_png = image_bytes[:8] == b'\x89PNG\r\n\x1a\n'
                        is_jpeg = image_bytes[:2] == b'\xff\xd8'

                        if not (is_png or is_jpeg):
                            logger.warning(f"Reference image {i+1} has invalid format (not PNG/JPEG), skipping")
                            continue

                        mime_type = "image/png" if is_png else "image/jpeg"
                        contents.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
                        valid_images.append(i+1)
                        logger.info(f"Added reference image {i+1}: {len(image_bytes)} bytes, format: {mime_type}")

                    except Exception as e:
                        logger.error(f"Failed to process reference image {i+1}: {e}")
                        continue

                if valid_images:
                    # Enhanced prompt that treats reference images as ingredients/components
                    ingredient_prompt = (
                        f"IMPORTANT: Use the provided reference image(s) as visual ingredients and components. "
                        f"Extract and incorporate their key visual elements (subjects, objects, colors, textures, style) "
                        f"into the generated image.\n\n"
                        f"Generation request: {prompt}\n\n"
                        f"Create a new image that incorporates visual elements from the reference image(s) "
                        f"while following the generation request above."
                    )
                    contents.append(ingredient_prompt)
                    logger.info(f"Using {len(valid_images)} valid reference images: {valid_images}")
                else:
                    logger.warning("No valid reference images found, generating without references")
                    contents = [prompt]
            else:
                contents.append(prompt)

            # Build config with appropriate settings
            config = types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"]
            )
            
            response = await image_client.aio.models.generate_content(
                model=settings.gemini_image_model,
                contents=contents,
                config=config
            )
            
            images = []
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    images.append(base64.b64encode(part.inline_data.data).decode())
            
            if not images:
                raise NoContentGeneratedError("image")
            
            logger.info(f"Generated {len(images)} image(s) successfully")
            return images
        
        # Execute with retry
        images = await self._retry_with_backoff(_do_generate, "Image generation")
        
        # Save to library (don't retry this part)
        save_errors = []
        saved_asset_id = None
        for img_data in images:
            try:
                asset_response = await self.library.save_asset(
                    data=img_data,
                    asset_type="image",
                    user_id=user_id,
                    prompt=prompt
                )
                if saved_asset_id is None:
                    saved_asset_id = asset_response.id
            except Exception as e:
                error_msg = f"{type(e).__name__}: {e}"
                logger.error(f"Failed to save image to library: {error_msg}")
                save_errors.append(error_msg)

        # Report save status to user
        if save_errors:
            return ImageResponse(
                images=images,
                saved_to_library=False,
                save_error=f"Failed to save {len(save_errors)} image(s): {save_errors[0]}",
                saved_asset_id=saved_asset_id,
            )

        return ImageResponse(images=images, saved_to_library=True, saved_asset_id=saved_asset_id)

    async def generate_video(
        self,
        prompt: str,
        user_id: str,
        first_frame: Optional[str] = None,
        last_frame: Optional[str] = None,
        reference_images: Optional[List[str]] = None,
        aspect_ratio: str = "16:9",
        duration_seconds: int = 8,
        generate_audio: bool = True,
        seed: Optional[int] = None
    ) -> dict:
        """Start video generation using Veo via REST API"""
        endpoint = f"https://{settings.veo_location}-aiplatform.googleapis.com/v1/projects/{settings.project_id}/locations/{settings.veo_location}/publishers/google/models/{settings.veo_model}:predictLongRunning"
        
        instance = {"prompt": prompt}
        
        if first_frame:
            cleaned_frame = self._strip_base64_prefix(first_frame)
            first_frame_mime = self._detect_mime_type(first_frame)

            # Validate and log image details
            try:
                frame_bytes = base64.b64decode(cleaned_frame)
                logger.info(f"First frame: mime={first_frame_mime}, base64_len={len(cleaned_frame)}, decoded_bytes={len(frame_bytes)}, header_hex={frame_bytes[:16].hex()}")
            except Exception as e:
                logger.error(f"First frame decode failed: {e}")

            instance["image"] = {
                "bytesBase64Encoded": cleaned_frame,
                "mimeType": first_frame_mime
            }
        else:
            logger.warning("No first frame provided to generate_video")

        if last_frame:
            last_frame_mime = self._detect_mime_type(last_frame)
            logger.info(f"Adding last frame with mime_type: {last_frame_mime}")
            instance["lastFrame"] = {
                "bytesBase64Encoded": self._strip_base64_prefix(last_frame),
                "mimeType": last_frame_mime
            }

        # Reference images for subject consistency (Veo 3.1 feature)
        # Format: uses "image" field (not "referenceImage") and lowercase "style" type
        if reference_images:
            ref_images_with_mime = []
            for idx, img in enumerate(reference_images[:3]):
                img_mime = self._detect_mime_type(img)
                cleaned_img = self._strip_base64_prefix(img)

                # Validate and log image details
                try:
                    img_bytes = base64.b64decode(cleaned_img)
                    logger.info(f"Reference image {idx+1}: mime={img_mime}, base64_len={len(cleaned_img)}, decoded_bytes={len(img_bytes)}, header_hex={img_bytes[:16].hex()}")
                except Exception as e:
                    logger.error(f"Reference image {idx+1} decode failed: {e}")

                ref_images_with_mime.append({
                    "image": {
                        "bytesBase64Encoded": cleaned_img,
                        "mimeType": img_mime
                    },
                    "referenceType": "style"
                })
            instance["referenceImages"] = ref_images_with_mime
        
        payload = {
            "instances": [instance],
            "parameters": {
                "aspectRatio": aspect_ratio,
                "sampleCount": 1,
                "durationSeconds": duration_seconds,
                "generateAudio": generate_audio,
                "resolution": "1080p",
                "storageUri": f"gs://{settings.gcs_bucket}/videos"  # Output to GCS, not inline base64
            }
        }
        
        # Add seed if provided for consistent generation (voice, style, etc.)
        if seed is not None:
            payload["parameters"]["seed"] = seed
            logger.info(f"Using seed {seed} for consistent generation")

        logger.info(f"Veo API request: endpoint={endpoint}, instance_keys={list(instance.keys())}")

        async def _do_video_request():
            http_client = _get_http_client()
            response = await http_client.post(endpoint, json=payload, headers=self._get_auth_headers())

            if response.status_code == 429:
                raise RateLimitError(f"Video API rate limited: {response.text[:200]}")

            if response.status_code != 200:
                logger.error(f"Veo API error: status={response.status_code}")
                logger.error(f"Veo API response: {response.text[:1000]}")
                raise UpstreamAPIError(response.status_code, response.text[:500])

            return response.json()

        result = await self._retry_with_backoff(_do_video_request, "Video generation")
        
        return {
            "status": "processing",
            "operation_name": result.get("name", ""),
            "message": "Video generation started. Poll /generate/video/status for completion."
        }

    async def check_video_status(
        self,
        operation_name: str,
        user_id: str,
        prompt: Optional[str] = None
    ) -> VideoStatusResponse:
        """Check video generation status using fetchPredictOperation"""
        endpoint = f"https://{settings.veo_location}-aiplatform.googleapis.com/v1/projects/{settings.project_id}/locations/{settings.veo_location}/publishers/google/models/{settings.veo_model}:fetchPredictOperation"

        payload = {
            "operationName": operation_name
        }

        logger.info(f"Checking video status: operation={operation_name[:50]}...")

        async def _do_status_check():
            http_client = _get_http_client()

            try:
                response = await http_client.post(
                    endpoint,
                    json=payload,
                    headers=self._get_auth_headers()
                )
            except httpx.TimeoutException as e:
                logger.error(f"Vertex AI status check timed out: {e}")
                raise RequestTimeoutError("video status check")

            # Handle specific error codes with clear messages
            if response.status_code == 404:
                # Operation not found - likely expired (Veo operations have limited lifetime)
                logger.warning(f"Video operation not found (404): {operation_name[:50]}...")
                raise ValueError(
                    f"Video operation not found. It may have expired or been deleted. "
                    f"Veo operations typically expire after 24 hours."
                )

            if response.status_code == 429:
                raise RateLimitError(f"Status API rate limited: {response.text[:200]}")

            if response.status_code == 401 or response.status_code == 403:
                logger.error(f"Auth error checking video status: {response.status_code} - {response.text[:300]}")
                raise ValueError(f"Authentication failed with Vertex AI (status {response.status_code})")

            if response.status_code != 200:
                logger.error(f"Vertex AI status error: {response.status_code} - {response.text[:500]}")
                raise UpstreamAPIError(response.status_code, response.text[:500])

            return response.json()

        result = await self._retry_with_backoff(_do_status_check, "Video status check")

        # Log the full response structure for debugging
        logger.info(f"Video status response: done={result.get('done')}, keys={list(result.keys())}")

        if result.get("done"):
            if "response" in result:
                response_data = result["response"]
                logger.info(f"Response data keys: {list(response_data.keys())}")
                logger.info(f"Full response data: {str(response_data)[:2000]}")  # Log first 2000 chars

                video_base64 = None
                storage_uri = None
                mime_type = "video/mp4"  # Default mime type

                # Try different response structures
                # Structure 1: generateVideoResponse.generatedSamples
                videos = response_data.get("generateVideoResponse", {}).get("generatedSamples", [])
                if videos:
                    logger.info(f"Found videos in generateVideoResponse.generatedSamples: {len(videos)}")
                    video_data = videos[0].get("video", {})
                    video_base64 = video_data.get("bytesBase64Encoded") or video_data.get("videoBytes")
                    storage_uri = video_data.get("uri") or video_data.get("gcsUri")
                    mime_type = video_data.get("mimeType", "video/mp4")

                # Structure 2: videos array (Veo 3.1)
                if not video_base64 and not storage_uri:
                    videos = response_data.get("videos", [])
                    if videos:
                        logger.info(f"Found videos in videos array: {len(videos)}")
                        video_base64 = videos[0].get("bytesBase64Encoded") or videos[0].get("videoBytes")
                        storage_uri = videos[0].get("uri") or videos[0].get("gcsUri")
                        mime_type = videos[0].get("mimeType", "video/mp4")

                # Structure 3: predictions array (some Vertex AI models)
                if not video_base64 and not storage_uri:
                    predictions = response_data.get("predictions", [])
                    if predictions:
                        logger.info(f"Found predictions array: {len(predictions)}, keys: {list(predictions[0].keys()) if predictions else 'none'}")
                        video_base64 = predictions[0].get("bytesBase64Encoded") or predictions[0].get("videoBytes")
                        storage_uri = predictions[0].get("uri") or predictions[0].get("gcsUri")
                        mime_type = predictions[0].get("mimeType", "video/mp4")

                if video_base64:
                    # Try to save to library and get the URL
                    saved_to_library = True
                    save_error = None
                    video_url = None
                    try:
                        asset_response = await self.library.save_asset(
                            data=video_base64,
                            asset_type="video",
                            user_id=user_id,
                            prompt=prompt
                        )
                        video_url = asset_response.url  # Get the GCS URL for downstream use
                        logger.info(f"Video saved to library, URL: {video_url[:80]}...")
                    except Exception as e:
                        error_msg = f"{type(e).__name__}: {e}"
                        logger.error(f"Failed to save video to library: {error_msg}")
                        saved_to_library = False
                        save_error = f"Failed to save video: {error_msg}"

                    return VideoStatusResponse(
                        status="complete",
                        video_base64=video_base64,
                        video_url=video_url,  # Include URL for downstream processing (merge, etc.)
                        mimeType=mime_type,
                        saved_to_library=saved_to_library,
                        save_error=save_error
                    )

                if storage_uri:
                    # Download video from GCS and convert to base64
                    if storage_uri.startswith("gs://"):
                        logger.info(f"Downloading video from GCS: {storage_uri}")
                        try:
                            from google.cloud import storage

                            # Parse GCS URI: gs://bucket-name/path/to/file
                            gcs_path = storage_uri[5:]  # Remove "gs://"
                            bucket_name = gcs_path.split("/")[0]
                            blob_path = "/".join(gcs_path.split("/")[1:])

                            storage_client = storage.Client()
                            bucket = storage_client.bucket(bucket_name)
                            blob = bucket.blob(blob_path)

                            # Download as bytes
                            video_bytes = blob.download_as_bytes()
                            video_base64 = base64.b64encode(video_bytes).decode('utf-8')

                            logger.info(f"Downloaded video from GCS: {len(video_bytes)} bytes, base64 length: {len(video_base64)}")

                            # Try to save to library and get the URL
                            saved_to_library = True
                            save_error = None
                            video_url = None
                            try:
                                asset_response = await self.library.save_asset(
                                    data=video_base64,
                                    asset_type="video",
                                    user_id=user_id,
                                    prompt=prompt
                                )
                                video_url = asset_response.url  # Get the GCS URL for downstream use
                                logger.info(f"Video saved to library, URL: {video_url[:80]}...")
                            except Exception as e:
                                error_msg = f"{type(e).__name__}: {e}"
                                logger.error(f"Failed to save video to library: {error_msg}")
                                saved_to_library = False
                                save_error = f"Failed to save video: {error_msg}"

                            return VideoStatusResponse(
                                status="complete",
                                video_base64=video_base64,
                                video_url=video_url,  # Include URL for downstream processing (merge, etc.)
                                mimeType=mime_type,
                                saved_to_library=saved_to_library,
                                save_error=save_error
                            )
                        except Exception as e:
                            logger.error(f"Failed to download video from GCS: {e}")
                            # Fall through to return storage_uri as fallback

                    # Fallback: return storage_uri if we couldn't download
                    return VideoStatusResponse(
                        status="complete",
                        storage_uri=storage_uri,
                        mimeType=mime_type,
                        saved_to_library=False,
                        save_error="Video returned as URL only - save manually if needed"
                    )
                
                return VideoStatusResponse(
                    status="error",
                    error={"message": "Video generation completed but no video data found"},
                    message=f"Available response keys: {list(response_data.keys())}"
                )
            
            elif "error" in result:
                return VideoStatusResponse(status="error", error=result["error"])
        
        metadata = result.get("metadata", {})
        return VideoStatusResponse(
            status="processing",
            progress=metadata.get("progressPercent", 0)
        )

    async def generate_text(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        context: Optional[str] = None,
        temperature: float = 0.7
    ) -> TextResponse:
        """Generate text using Gemini"""
        full_prompt = ""
        if system_prompt:
            full_prompt += f"System: {system_prompt}\n\n"
        if context:
            full_prompt += f"Context: {context}\n\n"
        full_prompt += prompt
        
        response = client.models.generate_content(
            model=settings.gemini_text_model,
            contents=full_prompt,
            config=types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=8192
            )
        )
        
        if response.text:
            return TextResponse(response=response.text)

        raise NoContentGeneratedError("text")

    async def upscale_image(
        self,
        image: str,
        upscale_factor: str = "x2",
        output_mime_type: str = "image/png",
        user_id: Optional[str] = None,
    ) -> UpscaleResponse:
        """Upscale an image using Imagen"""
        endpoint = f"https://{settings.location}-aiplatform.googleapis.com/v1/projects/{settings.project_id}/locations/{settings.location}/publishers/google/models/{settings.upscale_model}:predict"
        
        payload = {
            "instances": [{
                "prompt": "Upscale the image",
                "image": {"bytesBase64Encoded": self._strip_base64_prefix(image)}
            }],
            "parameters": {
                "mode": "upscale",
                "upscaleConfig": {"upscaleFactor": upscale_factor},
                "outputOptions": {"mimeType": output_mime_type}
            }
        }
        
        http_client = _get_http_client()
        response = await http_client.post(endpoint, json=payload, headers=self._get_auth_headers())

        if response.status_code == 429:
            raise RateLimitError(f"Upscale API rate limited: {response.text[:200]}")

        if response.status_code != 200:
            raise UpstreamAPIError(response.status_code, response.text[:500])

        result = response.json()
        predictions = result.get("predictions", [])

        if predictions:
            upscaled_image = predictions[0].get("bytesBase64Encoded", "")
            mime_type = predictions[0].get("mimeType", output_mime_type)
            if upscaled_image:
                saved_to_library = False
                save_error = None
                saved_asset_id = None
                if user_id:
                    try:
                        asset_response = await self.library.save_asset(
                            data=upscaled_image,
                            asset_type="image",
                            user_id=user_id,
                            prompt=f"Upscaled {upscale_factor}",
                            mime_type=mime_type,
                        )
                        saved_to_library = True
                        saved_asset_id = asset_response.id
                    except Exception as e:
                        save_error = f"Failed to save upscaled image: {str(e)}"
                        logger.error(f"Library save failed for upscale (user={user_id}): {e}")
                return UpscaleResponse(
                    image=upscaled_image,
                    mime_type=mime_type,
                    saved_to_library=saved_to_library,
                    save_error=save_error,
                    saved_asset_id=saved_asset_id,
                )

        raise NoContentGeneratedError("upscaled image")

    async def generate_music(
        self,
        prompt: str,
        user_id: str
    ) -> MusicResponse:
        """Generate music using Google Lyria API"""
        endpoint = f"https://{settings.location}-aiplatform.googleapis.com/v1/projects/{settings.project_id}/locations/{settings.location}/publishers/google/models/{settings.lyria_model}:predict"

        payload = {
            "instances": [{"prompt": prompt}],
            "parameters": {
                "sampleCount": 1
            }
        }

        logger.info(f"Lyria API request: endpoint={endpoint}, prompt={prompt[:50]}...")

        async def _do_music_request():
            http_client = _get_http_client()
            response = await http_client.post(endpoint, json=payload, headers=self._get_auth_headers())

            if response.status_code == 429:
                raise RateLimitError(f"Music API rate limited: {response.text[:200]}")

            if response.status_code != 200:
                logger.error(f"Lyria API error: status={response.status_code}")
                logger.error(f"Lyria API response: {response.text[:1000]}")
                raise UpstreamAPIError(response.status_code, response.text[:500])

            return response.json()

        result = await self._retry_with_backoff(_do_music_request, "Music generation")

        # Extract audio from response
        predictions = result.get("predictions", [])
        if not predictions:
            raise NoContentGeneratedError("music")

        audio_base64 = predictions[0].get("bytesBase64Encoded") or predictions[0].get("audioBytes")
        if not audio_base64:
            logger.error(f"Lyria response structure: {list(predictions[0].keys())}")
            raise NoContentGeneratedError("music")

        logger.info(f"Generated music successfully: {len(audio_base64)} base64 chars")

        return MusicResponse(
            audio_base64=audio_base64,
            mime_type="audio/wav",
            duration_seconds=30
        )