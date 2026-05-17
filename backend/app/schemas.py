from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List

# ============== SIZE LIMITS ==============
# These limits prevent DoS attacks via oversized payloads

MAX_PROMPT_LENGTH = 10_000  # ~2,500 words
MAX_IMAGE_BASE64 = 50_000_000  # ~50MB base64 (~37MB raw image)
MAX_VIDEO_BASE64 = 150_000_000  # ~150MB base64 (~110MB raw, enough for 30s 1080p)
MAX_REFERENCE_IMAGES = 10  # Max reference images per request

# ============== REQUEST MODELS ==============

class ImageRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=MAX_PROMPT_LENGTH)
    reference_images: Optional[List[str]] = Field(default=None, max_length=MAX_REFERENCE_IMAGES)
    aspect_ratio: Optional[str] = "1:1"
    resolution: Optional[str] = "1K"
    folder_id: Optional[str] = None

    @field_validator('reference_images')
    @classmethod
    def validate_reference_images(cls, v):
        if v:
            for i, img in enumerate(v):
                if len(img) > MAX_IMAGE_BASE64:
                    raise ValueError(f'Reference image {i+1} exceeds max size of {MAX_IMAGE_BASE64 // 1_000_000}MB')
        return v

class VideoRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=MAX_PROMPT_LENGTH)
    first_frame: Optional[str] = Field(default=None, max_length=MAX_IMAGE_BASE64)
    last_frame: Optional[str] = Field(default=None, max_length=MAX_IMAGE_BASE64)
    reference_images: Optional[List[str]] = Field(default=None, max_length=MAX_REFERENCE_IMAGES)
    aspect_ratio: Optional[str] = "16:9"
    duration_seconds: Optional[int] = Field(default=8, ge=1, le=30)
    generate_audio: Optional[bool] = True
    seed: Optional[int] = None  # For consistent voice/style generation
    folder_id: Optional[str] = None

    @field_validator('reference_images')
    @classmethod
    def validate_reference_images(cls, v):
        if v:
            for i, img in enumerate(v):
                if len(img) > MAX_IMAGE_BASE64:
                    raise ValueError(f'Reference image {i+1} exceeds max size of {MAX_IMAGE_BASE64 // 1_000_000}MB')
        return v

class TextRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=MAX_PROMPT_LENGTH)
    system_prompt: Optional[str] = Field(default=None, max_length=MAX_PROMPT_LENGTH)
    context: Optional[str] = Field(default=None, max_length=50_000)  # Allow longer context
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=2.0)

class StatusRequest(BaseModel):
    operation_name: str = Field(..., min_length=1, max_length=500)
    prompt: Optional[str] = Field(default=None, max_length=MAX_PROMPT_LENGTH)

class UpscaleRequest(BaseModel):
    image: str = Field(..., min_length=100, max_length=MAX_IMAGE_BASE64)
    upscale_factor: Optional[str] = "x2"
    output_mime_type: Optional[str] = "image/png"

class MusicRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=MAX_PROMPT_LENGTH)

class SaveAssetRequest(BaseModel):
    data: str = Field(..., min_length=100, max_length=MAX_VIDEO_BASE64)  # Supports video uploads
    asset_type: str = Field(..., pattern=r'^(image|video)$')
    prompt: Optional[str] = Field(default=None, max_length=MAX_PROMPT_LENGTH)
    mime_type: Optional[str] = Field(default=None, max_length=100)
    folder_id: Optional[str] = None

class FolderRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)

# ============== RESPONSE MODELS ==============

class ImageResponse(BaseModel):
    images: List[str]
    saved_to_library: bool = True  # False if auto-save to library failed
    save_error: Optional[str] = None  # Error message if save failed
    saved_asset_id: Optional[str] = None  # ID of the saved asset in the library

class TextResponse(BaseModel):
    response: str

class UpscaleResponse(BaseModel):
    image: str
    mime_type: str
    saved_to_library: bool = True
    save_error: Optional[str] = None
    saved_asset_id: Optional[str] = None  # ID of the saved asset in the library

class MusicResponse(BaseModel):
    audio_base64: str
    mime_type: str = "audio/wav"
    duration_seconds: int = 30

class AssetResponse(BaseModel):
    id: str
    url: str
    asset_type: str
    prompt: Optional[str] = None
    created_at: str
    mime_type: str
    user_id: Optional[str] = None
    folder_id: Optional[str] = None

class FolderResponse(BaseModel):
    id: str
    name: str
    user_id: str
    created_at: str
    asset_count: int = 0

class FolderListResponse(BaseModel):
    folders: List[FolderResponse]
    count: int

class VideoStatusResponse(BaseModel):
    status: str
    video_base64: Optional[str] = None
    video_url: Optional[str] = None  # GCS public URL for the video (use this for downstream processing)
    storage_uri: Optional[str] = None
    mimeType: Optional[str] = None  # video/mp4 - at top level for frontend access
    progress: Optional[int] = None
    error: Optional[dict] = None
    message: Optional[str] = None
    saved_to_library: Optional[bool] = None  # None while processing, True/False when complete
    save_error: Optional[str] = None  # Error message if save failed

class LibraryResponse(BaseModel):
    assets: List[AssetResponse]
    count: int

# ============== WORKFLOW MODELS ==============

class WorkflowNode(BaseModel):
    model_config = ConfigDict(extra="allow")
    
    id: str
    type: str
    position: dict
    data: dict

class WorkflowEdge(BaseModel):
    model_config = ConfigDict(extra="allow")
    
    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None

class SaveWorkflowRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default="", max_length=5000)
    is_public: bool = False
    nodes: List[dict] = Field(..., min_length=1, max_length=100)  # 1-100 nodes
    edges: List[dict] = Field(default_factory=list, max_length=500)  # Max 500 edges
    thumbnail: Optional[str] = None  # Base64 thumbnail image
    background_image: Optional[str] = None  # Base64 background image for public templates

class UpdateWorkflowRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default="", max_length=5000)
    is_public: bool = False
    nodes: List[dict] = Field(..., min_length=1, max_length=100)  # 1-100 nodes
    edges: List[dict] = Field(default_factory=list, max_length=500)  # Max 500 edges
    thumbnail: Optional[str] = None  # Base64 thumbnail image
    background_image: Optional[str] = None  # Base64 background image for public templates

class WorkflowResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    description: Optional[str] = ""
    is_public: bool
    thumbnail: Optional[str] = None
    background_image: Optional[str] = None  # Custom background for public templates
    created_at: str
    updated_at: str
    user_id: str
    user_email: str
    node_count: int
    edge_count: int
    nodes: List[dict]  # Flexible to accept any node structure
    edges: List[dict]  # Flexible to accept any edge structure

class WorkflowListResponse(BaseModel):
    workflows: List[WorkflowResponse]

class WorkflowIdResponse(BaseModel):
    id: str

class WorkflowMessageResponse(BaseModel):
    message: str
class SceneElementRequest(BaseModel):
    name: str
    element_type: str  # "character" | "location" | etc.
    description: Optional[str] = None
    reference_image_urls: List[str] = []
    is_global: bool = False  # Only admins may set True
    parent_element_id: Optional[str] = None  # Set for wardrobe style variants

class SceneElementResponse(BaseModel):
    id: str
    name: str
    element_type: str
    description: Optional[str] = None
    reference_image_urls: List[str] = []
    created_at: Optional[str] = None
    is_global: bool = False
    parent_element_id: Optional[str] = None

class SceneElementListResponse(BaseModel):
    elements: List[SceneElementResponse]
