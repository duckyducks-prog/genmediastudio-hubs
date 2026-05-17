"""
Shared workflow endpoints — allow unauthenticated temp users to run a workflow
via a share token minted by the owner.

Auth model:
  POST   /v1/shared          — create token (owner Firebase auth required)
  GET    /v1/shared/{token}  — get form schema (no auth)
  DELETE /v1/shared/{token}  — revoke token (owner Firebase auth required)
  POST   /v1/shared/{token}/run — execute workflow (no auth; token = credential)
"""
import uuid
from datetime import datetime
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from app.auth import get_current_user
from app.firestore import get_firestore_client, WORKFLOWS_COLLECTION, SHARED_WORKFLOWS_COLLECTION
from app.services.workflow_executor import execute_workflow
from app.services.workflow_firestore import run_sync
from app.logging_config import setup_logger

logger = setup_logger(__name__)
router = APIRouter()


# ── Pydantic models ────────────────────────────────────────────────────────────

class CreateShareRequest(BaseModel):
    workflow_id: str
    title: Optional[str] = None
    expires_at: Optional[str] = None  # ISO datetime string, or null for no expiry


class RunShareRequest(BaseModel):
    inputs: dict[str, Any]  # { node_id: value }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_db():
    return get_firestore_client()


async def _get_share_doc(token: str) -> dict:
    """Fetch and validate a share token document."""
    db = _get_db()
    doc = await run_sync(db.collection(SHARED_WORKFLOWS_COLLECTION).document(token).get)
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Share link not found")
    data = doc.to_dict()

    # Check expiry
    expires_at = data.get("expires_at")
    if expires_at and datetime.utcnow() > expires_at:
        raise HTTPException(status_code=410, detail="Share link has expired")

    return data


async def _get_workflow_raw(workflow_id: str) -> dict:
    """Fetch workflow document without ownership checks."""
    db = _get_db()
    doc = await run_sync(db.collection(WORKFLOWS_COLLECTION).document(workflow_id).get)
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return doc.to_dict()


def _build_exposed_inputs(workflow: dict) -> list[dict]:
    """Scan workflow nodes for exposed=True and return the form schema."""
    exposed = []
    for node in workflow.get("nodes", []):
        data = node.get("data", {})
        if not data.get("exposed"):
            continue
        node_type = node.get("type", "")

        # Determine input type from node type
        if node_type in ("imageInput", "assetNode"):
            input_type = "image"
        elif node_type == "videoInput":
            input_type = "video"
        else:
            input_type = "text"

        exposed.append({
            "node_id": node["id"],
            "type": input_type,
            "label": data.get("exposedLabel") or data.get("label") or "Input",
        })
    return exposed


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("")
async def create_share_token(
    request: CreateShareRequest,
    user: dict = Depends(get_current_user),
):
    """Mint a share token for a workflow (owner only)."""
    # Verify ownership
    workflow = await _get_workflow_raw(request.workflow_id)
    if workflow.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="You can only share your own workflows")

    # Check at least one exposed input exists
    exposed = _build_exposed_inputs(workflow)
    if not exposed:
        raise HTTPException(
            status_code=400,
            detail="Mark at least one node as exposed before creating a share link"
        )

    token = str(uuid.uuid4())
    db = _get_db()
    now = datetime.utcnow()

    expires_at = None
    if request.expires_at:
        try:
            expires_at = datetime.fromisoformat(request.expires_at.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid expires_at format (use ISO 8601)")

    doc = {
        "token": token,
        "workflow_id": request.workflow_id,
        "owner_uid": user["uid"],
        "title": request.title or workflow.get("name", "Shared Workflow"),
        "created_at": now,
        "expires_at": expires_at,
    }
    await run_sync(db.collection(SHARED_WORKFLOWS_COLLECTION).document(token).set, doc)
    logger.info(f"Share token {token} created for workflow {request.workflow_id} by {user['email']}")

    return {"token": token}


@router.get("/my")
async def list_my_share_tokens(user: dict = Depends(get_current_user)):
    """List all share tokens created by the current user."""
    db = _get_db()
    from google.cloud.firestore_v1.base_query import FieldFilter
    query = db.collection(SHARED_WORKFLOWS_COLLECTION).where(
        filter=FieldFilter("owner_uid", "==", user["uid"])
    )
    docs = await run_sync(lambda: list(query.stream()))
    results = []
    for doc in docs:
        d = doc.to_dict()
        results.append({
            "token": d["token"],
            "workflow_id": d["workflow_id"],
            "title": d.get("title", ""),
            "created_at": d["created_at"].isoformat() if hasattr(d["created_at"], "isoformat") else d["created_at"],
            "expires_at": d["expires_at"].isoformat() if d.get("expires_at") and hasattr(d["expires_at"], "isoformat") else d.get("expires_at"),
        })
    return {"tokens": results}


@router.get("/{token}")
async def get_share_schema(token: str):
    """Return the form schema for a share link (no auth required)."""
    share = await _get_share_doc(token)
    workflow = await _get_workflow_raw(share["workflow_id"])
    exposed = _build_exposed_inputs(workflow)

    return {
        "title": share.get("title", workflow.get("name", "Shared Workflow")),
        "exposed_inputs": exposed,
    }


@router.delete("/{token}")
async def revoke_share_token(token: str, user: dict = Depends(get_current_user)):
    """Revoke a share token (owner only)."""
    db = _get_db()
    doc = await run_sync(db.collection(SHARED_WORKFLOWS_COLLECTION).document(token).get)
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Share token not found")

    share = doc.to_dict()
    if share.get("owner_uid") != user["uid"]:
        raise HTTPException(status_code=403, detail="You can only revoke your own share links")

    await run_sync(db.collection(SHARED_WORKFLOWS_COLLECTION).document(token).delete)
    logger.info(f"Share token {token} revoked by {user['email']}")
    return {"message": "Share link revoked"}


@router.post("/{token}/run")
async def run_shared_workflow(token: str, request: RunShareRequest):
    """Execute a shared workflow with temp-user inputs (no auth; token = credential)."""
    share = await _get_share_doc(token)
    workflow = await _get_workflow_raw(share["workflow_id"])
    exposed = _build_exposed_inputs(workflow)

    # Validate that all provided input keys are actually exposed
    exposed_ids = {e["node_id"] for e in exposed}
    for node_id in request.inputs:
        if node_id not in exposed_ids:
            raise HTTPException(status_code=400, detail=f"Node {node_id} is not an exposed input")

    logger.info(f"Running shared workflow {share['workflow_id']} via token {token}")

    try:
        outputs = await execute_workflow(workflow, request.inputs, owner_uid=share["owner_uid"])
        return {"status": "complete", "outputs": outputs}
    except Exception as e:
        logger.error(f"Shared workflow execution failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Execution failed: {str(e)}")
