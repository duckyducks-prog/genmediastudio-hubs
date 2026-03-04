from functools import lru_cache
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from app.schemas import SaveAssetRequest, AssetResponse, LibraryResponse
from app.auth import get_current_user
from app.services.library_firestore import LibraryServiceFirestore
from app.logging_config import setup_logger
from app.exceptions import AppError

logger = setup_logger(__name__)
router = APIRouter()

@lru_cache
def get_library_service() -> LibraryServiceFirestore:
    """
    Cached factory for LibraryServiceFirestore.

    Uses @lru_cache to ensure only one instance is created and reused
    across all requests, avoiding repeated Firestore client initialization.

    To revert: Remove @lru_cache decorator and functools import.
    """
    return LibraryServiceFirestore()

@router.post("", response_model=AssetResponse)
async def create_asset(
    request: SaveAssetRequest,
    user: dict = Depends(get_current_user),
    service: LibraryServiceFirestore = Depends(get_library_service)
):
    """Create a new asset in the library"""
    try:
        logger.info(f"Save asset request from user {user['email']}: {request.asset_type}")
        return await service.save_asset(
            data=request.data,
            asset_type=request.asset_type,
            user_id=user["uid"],
            prompt=request.prompt,
            mime_type=request.mime_type,
            folder_id=request.folder_id,
        )
    except AppError:
        # Let custom exceptions propagate to global handler
        raise
    except Exception as e:
        logger.error(f"Asset save failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=LibraryResponse)
async def list_assets(
    asset_type: Optional[str] = None,
    limit: int = 50,
    folder_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
    service: LibraryServiceFirestore = Depends(get_library_service)
):
    """List assets for the authenticated user"""
    try:
        logger.info(f"List assets request from user {user['email']} (type={asset_type}, folder={folder_id}, limit={limit})")
        return await service.list_assets(
            user_id=user["uid"],
            asset_type=asset_type,
            limit=limit,
            folder_id=folder_id,
        )
    except Exception as e:
        logger.error(f"List assets failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(
    asset_id: str,
    user: dict = Depends(get_current_user),
    service: LibraryServiceFirestore = Depends(get_library_service)
):
    """Get a specific asset"""
    try:
        logger.info(f"Get asset request from user {user['email']}: {asset_id}")
        return await service.get_asset(asset_id=asset_id, user_id=user["uid"])
    except AppError:
        # Let custom exceptions (AssetNotFoundError, AccessDeniedError) propagate to global handler
        raise
    except Exception as e:
        logger.error(f"Get asset failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{asset_id}/folder", response_model=AssetResponse)
async def move_asset_folder(
    asset_id: str,
    folder_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
    service: LibraryServiceFirestore = Depends(get_library_service)
):
    """Move an asset to a folder, or to uncategorized if folder_id is omitted"""
    try:
        logger.info(f"Move asset {asset_id} to folder {folder_id} for user {user['email']}")
        return await service.move_asset_to_folder(
            asset_id=asset_id,
            folder_id=folder_id,
            user_id=user["uid"],
        )
    except AppError:
        raise
    except Exception as e:
        logger.error(f"Move asset failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{asset_id}")
async def delete_asset(
    asset_id: str,
    user: dict = Depends(get_current_user),
    service: LibraryServiceFirestore = Depends(get_library_service)
):
    """Delete an asset"""
    try:
        logger.info(f"Delete asset request from user {user['email']}: {asset_id}")
        result = await service.delete_asset(asset_id=asset_id, user_id=user["uid"])
        logger.info(f"Successfully deleted asset {asset_id} for user {user['email']}")
        return result
    except AppError:
        # Let custom exceptions (AssetNotFoundError, AccessDeniedError) propagate to global handler
        raise
    except Exception as e:
        logger.error(f"Delete asset failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))