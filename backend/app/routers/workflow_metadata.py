"""
Workflow metadata service — generates AI-drafted name, description, and tags
for a workflow using Gemini Flash. Results are cached by semantic hash.

Used by: Save Workflow modal (pre-fill), Load Workflow panel (search tags).
"""
import json
import hashlib
from datetime import datetime, timezone
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from google import genai
from google.genai import types as genai_types

from app.auth import get_current_user
from app.config import settings
from app.firestore import get_firestore_client, get_collection_name
from app.logging_config import setup_logger

logger = setup_logger(__name__)
router = APIRouter()

METADATA_COLLECTION = get_collection_name("workflow_metadata")


# ─── Schemas ──────────────────────────────────────────────────

class WorkflowSemantic(BaseModel):
    inputs: list[dict]
    generations: list[dict]
    transformations: list[dict]
    outputs: list[dict]


class MetadataRequest(BaseModel):
    workflow_id: str
    nodes: list[dict]
    edges: list[dict]
    regenerate: bool = False
    context: str = "save"  # "save" | "share_app"


class MetadataResponse(BaseModel):
    name: str
    description: str
    tags: list[str]
    generated_at: str
    ai_drafted: bool = True


# ─── Helpers ──────────────────────────────────────────────────

def _condense_workflow(nodes: list[dict], edges: list[dict]) -> WorkflowSemantic:
    """Extract semantic meaning from raw node/edge data, preserving actual content."""
    INPUT_TYPES = {"prompt", "imageInput", "videoInput", "workflowQueue"}
    GEN_TYPES   = {"generateImage", "generateVideo", "generateMusic", "llm"}
    OUT_TYPES   = {"imageOutput", "videoOutput", "textOutput", "preview", "download"}

    inputs, generations, transformations, outputs = [], [], [], []

    for node in nodes:
        ntype = node.get("type", "")
        data  = node.get("data", {})

        # Extract the actual text content wherever it lives in node data
        prompt_text = (
            data.get("prompt") or
            data.get("outputs", {}).get("text") or
            data.get("text") or
            ""
        )

        if ntype in INPUT_TYPES:
            entry = {
                "type": ntype,
                "label": data.get("customLabel") or data.get("label") or ntype,
            }
            # For text inputs, include the actual prompt content — this is the key creative signal
            if prompt_text:
                entry["content"] = prompt_text[:300]
            inputs.append(entry)

        elif ntype in GEN_TYPES:
            entry = {"type": ntype}
            if prompt_text:
                entry["prompt"] = prompt_text[:300]
            # Include aspect ratio, duration as creative context
            if data.get("aspectRatio"):
                entry["aspectRatio"] = data["aspectRatio"]
            generations.append(entry)

        elif ntype in OUT_TYPES:
            outputs.append({"type": ntype})
        else:
            transformations.append({"type": ntype})

    return WorkflowSemantic(
        inputs=inputs,
        generations=generations,
        transformations=transformations,
        outputs=outputs,
    )


def _semantic_hash(semantic: WorkflowSemantic) -> str:
    payload = json.dumps(semantic.model_dump(), sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


async def _call_llm(semantic: WorkflowSemantic, context: str = "save") -> MetadataResponse:
    """Call Gemini Flash to produce structured metadata."""
    condensed = semantic.model_dump()

    if context == "share_app":
        prompt = f"""You are writing the name and description for a self-serve app that a marketer will use.

The app is built on top of an AI media workflow. Your job: read what the workflow creates, then write copy that speaks to a non-technical user — most likely a marketer, creative director, or brand manager — who just wants to get a result without knowing anything about AI.

RULES:
- App name: 2-4 words, title case. Should sound like a product or tool name, not a workflow.
  Example: "Closeup Shot Maker", "Product Photo Studio", "Brand Video Creator"
- Description: 1-2 sentences max. Lead with the outcome ("Create stunning closeup shots from any reference image.").
  No jargon. No mention of "AI", "nodes", "workflow", "model", or "generation".
  Write as if explaining to someone who just wants to know: what will I get?
- Tags: 2-4 lowercase keywords a marketer would search for

WORKFLOW CONTENT:
{json.dumps(condensed, indent=2)}

Respond as JSON only:
{{"name": "...", "description": "...", "tags": ["...", "..."]}}"""
    else:
        prompt = f"""You are naming and describing an AI media workflow for its creator.

Your job: read the actual prompt text and content inside the workflow nodes, then name the workflow based on WHAT IT CREATES — not what the nodes are called.

RULES:
- The name must describe the creative OUTPUT, derived from the actual prompt content.
  Example: if a prompt says "Create a closeup of the reference image" → name = "Closeup Generator"
  Example: if a prompt says "Woman walking on a beach at sunset" → name = "Beach Sunset Scene"
  Example: if a prompt says "Product shot on white background" → name = "Product Shot Creator"
- Name: 2-4 words, title case, no generic words like "Workflow" or "Generator" unless essential
- Description: one sentence, 10-25 words, describes what the user will get as output
- Tags: 2-4 lowercase keywords from the actual content (subject, style, output type)
- If there is no prompt text, use the node types to infer purpose
- Never say "this workflow", "the workflow", "nodes", or "pipeline" — write from the user's perspective

WORKFLOW CONTENT:
{json.dumps(condensed, indent=2)}

Respond as JSON only:
{{"name": "...", "description": "...", "tags": ["...", "..."]}}"""

    client = genai.Client(vertexai=True, project=settings.project_id, location="us-central1")
    response = await client.aio.models.generate_content(
        model=settings.gemini_text_model,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.7,
            max_output_tokens=200,
        ),
    )

    text = response.text or "{}"
    parsed = json.loads(text)
    now = datetime.now(timezone.utc).isoformat()

    return MetadataResponse(
        name=parsed.get("name", "My Workflow"),
        description=parsed.get("description", ""),
        tags=parsed.get("tags", []),
        generated_at=now,
    )


# ─── Endpoints ────────────────────────────────────────────────

@router.post("", response_model=MetadataResponse)
async def generate_metadata(
    request: MetadataRequest,
    user: dict = Depends(get_current_user),
):
    """Generate (or serve cached) AI metadata for a workflow."""
    if not request.nodes:
        raise HTTPException(status_code=400, detail="Workflow has no nodes")

    db = get_firestore_client()
    semantic = _condense_workflow(request.nodes, request.edges)
    s_hash = _semantic_hash(semantic)

    # Check cache unless forced regeneration
    if not request.regenerate:
        cache_doc = db.collection(METADATA_COLLECTION).document(s_hash).get()
        if cache_doc.exists:
            data = cache_doc.to_dict()
            # Update pointer for this workflow_id
            db.collection(METADATA_COLLECTION).document(
                f"wf_{request.workflow_id}"
            ).set({"hash": s_hash, "updated_at": datetime.now(timezone.utc).isoformat()})
            return MetadataResponse(**{k: v for k, v in data.items() if k in MetadataResponse.model_fields})

    # Call LLM
    try:
        result = await _call_llm(semantic, context=request.context)
    except Exception as e:
        logger.error(f"LLM call failed for workflow {request.workflow_id}: {e}")
        raise HTTPException(status_code=503, detail="Metadata generation temporarily unavailable")

    # Cache by semantic hash + pointer by workflow_id
    cache_data = result.model_dump()
    cache_data["semantic_hash"] = s_hash
    db.collection(METADATA_COLLECTION).document(s_hash).set(cache_data)
    db.collection(METADATA_COLLECTION).document(
        f"wf_{request.workflow_id}"
    ).set({"hash": s_hash, "updated_at": datetime.now(timezone.utc).isoformat()})

    return result


@router.get("/{workflow_id}", response_model=MetadataResponse)
async def get_metadata(
    workflow_id: str,
    user: dict = Depends(get_current_user),
):
    """Return cached metadata for a workflow, or 404 if none exists."""
    db = get_firestore_client()
    pointer = db.collection(METADATA_COLLECTION).document(f"wf_{workflow_id}").get()
    if not pointer.exists:
        raise HTTPException(status_code=404, detail="No cached metadata")

    s_hash = pointer.to_dict().get("hash")
    if not s_hash:
        raise HTTPException(status_code=404, detail="No cached metadata")

    cache_doc = db.collection(METADATA_COLLECTION).document(s_hash).get()
    if not cache_doc.exists:
        raise HTTPException(status_code=404, detail="Cache expired")

    data = cache_doc.to_dict()
    return MetadataResponse(**{k: v for k, v in data.items() if k in MetadataResponse.model_fields})
