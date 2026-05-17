import uuid
from datetime import datetime, timezone
from functools import lru_cache
from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_current_user
from app.firestore import get_firestore_client, get_collection_name
from app.schemas import SceneElementRequest, SceneElementResponse, SceneElementListResponse
from app.logging_config import setup_logger

logger = setup_logger(__name__)
router = APIRouter()

SCENE_ELEMENTS_COLLECTION = get_collection_name("scene_elements")
ADMIN_EMAILS = {"ldebortolialves@hubspot.com"}


def get_db():
    return get_firestore_client()


def _is_admin(user: dict) -> bool:
    return user.get("email", "") in ADMIN_EMAILS


def _to_response(doc_id: str, data: dict) -> SceneElementResponse:
    return SceneElementResponse(
        id=doc_id,
        name=data["name"],
        element_type=data["element_type"],
        description=data.get("description"),
        reference_image_urls=data.get("reference_image_urls", []),
        created_at=data.get("created_at", ""),
        is_global=data.get("is_global", False),
    )


@router.get("", response_model=SceneElementListResponse)
async def list_scene_elements(
    element_type: str | None = None,
    parent_id: str | None = None,
    user: dict = Depends(get_current_user),
):
    db = get_db()

    # User's own elements
    user_query = db.collection(SCENE_ELEMENTS_COLLECTION).where("user_id", "==", user["uid"])
    if element_type:
        user_query = user_query.where("element_type", "==", element_type)
    if parent_id:
        user_query = user_query.where("parent_element_id", "==", parent_id)
    else:
        # By default only return top-level elements (no parent)
        user_query = user_query.where("parent_element_id", "==", None)
    user_docs = list(user_query.stream())

    # Global elements (only for top-level queries, not style lookups)
    global_docs = []
    if not parent_id:
        global_query = db.collection(SCENE_ELEMENTS_COLLECTION).where("is_global", "==", True)
        if element_type:
            global_query = global_query.where("element_type", "==", element_type)
        global_query = global_query.where("parent_element_id", "==", None)
        global_docs = list(global_query.stream())

    seen = set()
    elements = []
    for doc in user_docs + global_docs:
        if doc.id in seen:
            continue
        seen.add(doc.id)
        elements.append(_to_response(doc.id, doc.to_dict()))

    elements.sort(key=lambda e: e.created_at or "", reverse=True)
    return SceneElementListResponse(elements=elements)


@router.post("", response_model=SceneElementResponse, status_code=201)
async def create_scene_element(
    request: SceneElementRequest,
    user: dict = Depends(get_current_user),
):
    valid_types = {"character", "location", "camera_angle", "lighting", "style", "prop"}
    if request.element_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"element_type must be one of: {', '.join(sorted(valid_types))}")

    # Only admins may create global elements
    is_global = request.is_global and _is_admin(user)

    db = get_db()
    element_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    data = {
        "name": request.name,
        "element_type": request.element_type,
        "description": request.description,
        "reference_image_urls": request.reference_image_urls,
        "user_id": user["uid"],
        "is_global": is_global,
        "parent_element_id": request.parent_element_id,
        "created_at": now,
    }
    db.collection(SCENE_ELEMENTS_COLLECTION).document(element_id).set(data)
    logger.info(f"Created scene element {element_id} for user {user['email']} (global={is_global})")
    return _to_response(element_id, data)


@router.patch("/{element_id}", response_model=SceneElementResponse)
async def update_scene_element(
    element_id: str,
    request: SceneElementRequest,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    ref = db.collection(SCENE_ELEMENTS_COLLECTION).document(element_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Scene element not found")
    existing = doc.to_dict()
    if existing.get("user_id") != user["uid"]:
        raise HTTPException(status_code=403, detail="Access denied")

    is_global = request.is_global and _is_admin(user)
    updates = {
        "name": request.name,
        "element_type": request.element_type,
        "description": request.description,
        "reference_image_urls": request.reference_image_urls,
        "is_global": is_global,
        "parent_element_id": request.parent_element_id,
    }
    ref.update(updates)
    return _to_response(element_id, {**existing, **updates})


@router.delete("/{element_id}", status_code=204)
async def delete_scene_element(
    element_id: str,
    user: dict = Depends(get_current_user),
):
    db = get_db()
    ref = db.collection(SCENE_ELEMENTS_COLLECTION).document(element_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Scene element not found")
    existing = doc.to_dict()
    # Owner or admin can delete
    if existing.get("user_id") != user["uid"] and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Access denied")
    ref.delete()
    logger.info(f"Deleted scene element {element_id} for user {user['email']}")
