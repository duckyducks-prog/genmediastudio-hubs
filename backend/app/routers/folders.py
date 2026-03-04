from functools import lru_cache
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas import FolderRequest, FolderResponse, FolderListResponse
from app.auth import get_current_user
from app.services.library_firestore import LibraryServiceFirestore
from app.logging_config import setup_logger
from app.exceptions import AppError

logger = setup_logger(__name__)
router = APIRouter()


@lru_cache
def get_library_service() -> LibraryServiceFirestore:
    return LibraryServiceFirestore()


@router.get("", response_model=FolderListResponse)
async def list_folders(
    user: dict = Depends(get_current_user),
    service: LibraryServiceFirestore = Depends(get_library_service)
):
    """List all folders for the authenticated user"""
    try:
        return await service.list_folders(user_id=user["uid"])
    except Exception as e:
        logger.error(f"List folders failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=FolderResponse, status_code=201)
async def create_folder(
    request: FolderRequest,
    user: dict = Depends(get_current_user),
    service: LibraryServiceFirestore = Depends(get_library_service)
):
    """Create a new folder"""
    try:
        return await service.create_folder(name=request.name, user_id=user["uid"])
    except Exception as e:
        logger.error(f"Create folder failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{folder_id}", response_model=FolderResponse)
async def rename_folder(
    folder_id: str,
    request: FolderRequest,
    user: dict = Depends(get_current_user),
    service: LibraryServiceFirestore = Depends(get_library_service)
):
    """Rename a folder"""
    try:
        return await service.rename_folder(
            folder_id=folder_id,
            name=request.name,
            user_id=user["uid"],
        )
    except AppError:
        raise
    except Exception as e:
        logger.error(f"Rename folder failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{folder_id}/download")
async def download_folder_as_zip(
    folder_id: str,
    user: dict = Depends(get_current_user),
    service: LibraryServiceFirestore = Depends(get_library_service)
):
    """Download all assets in a folder as a zip file"""
    try:
        zip_buffer, folder_name = await service.download_folder_as_zip(
            folder_id=folder_id, user_id=user["uid"]
        )
        safe_name = "".join(c for c in folder_name if c.isalnum() or c in " _-").strip() or "folder"
        return StreamingResponse(
            iter([zip_buffer.read()]),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.zip"'},
        )
    except AppError:
        raise
    except Exception as e:
        logger.error(f"Download folder failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{folder_id}")
async def delete_folder(
    folder_id: str,
    user: dict = Depends(get_current_user),
    service: LibraryServiceFirestore = Depends(get_library_service)
):
    """Delete a folder (assets are moved to uncategorized)"""
    try:
        return await service.delete_folder(folder_id=folder_id, user_id=user["uid"])
    except AppError:
        raise
    except Exception as e:
        logger.error(f"Delete folder failed for user {user['email']}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
