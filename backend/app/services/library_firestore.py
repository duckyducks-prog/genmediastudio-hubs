"""
Library service using Firestore for metadata and GCS for file storage
"""
import asyncio
import uuid
import base64
import io
import zipfile
from datetime import datetime
from typing import Optional
from google.cloud import storage
from app.firestore import get_firestore_client, ASSETS_COLLECTION, FOLDERS_COLLECTION
from app.config import settings
from app.schemas import AssetResponse, LibraryResponse, FolderResponse, FolderListResponse
from app.logging_config import setup_logger
from app.exceptions import AssetNotFoundError, AccessDeniedError, InvalidAssetTypeError, FolderNotFoundError

logger = setup_logger(__name__)


def _dt_to_iso(dt) -> str:
    """Serialize a datetime to an ISO 8601 UTC string browsers can parse.

    Firestore returns timezone-aware DatetimeWithNanoseconds objects whose
    .isoformat() already includes '+00:00'. Appending 'Z' on top produces
    '…+00:00Z' which is invalid. This normalises both naive and aware datetimes
    to the '…Z' form.
    """
    if not hasattr(dt, 'isoformat'):
        return dt
    iso = dt.isoformat()
    if iso.endswith('+00:00'):
        return iso[:-6] + 'Z'
    if not iso.endswith('Z'):
        return iso + 'Z'
    return iso


async def run_sync(func, *args, **kwargs):
    """Run a blocking function in a thread pool to avoid blocking the event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: func(*args, **kwargs))


class LibraryServiceFirestore:
    """
    Library service backed by Firestore for metadata and GCS for file storage.
    
    Firestore Schema:
    /assets/{asset_id}
        - id: string
        - user_id: string (indexed)
        - asset_type: "image" | "video" (indexed)
        - blob_path: string
        - mime_type: string
        - created_at: datetime (indexed)
        - prompt: string (optional)
        - source: "upload" | "generated"
        - workflow_id: string (optional - which workflow created it)
    """
    
    def __init__(self, gcs_client: Optional[storage.Client] = None):
        self.db = get_firestore_client()
        self.assets_ref = self.db.collection(ASSETS_COLLECTION)
        self.folders_ref = self.db.collection(FOLDERS_COLLECTION)
        self.storage_client = gcs_client or storage.Client()
        self.bucket = self.storage_client.bucket(settings.gcs_bucket)
    
    def _generate_asset_id(self) -> str:
        return str(uuid.uuid4())
    
    def _strip_base64_prefix(self, data: str) -> str:
        """Remove data URL prefix if present"""
        if data and ',' in data and data.startswith('data:'):
            return data.split(',', 1)[1]
        return data
    
    def _get_url(self, blob_path: str) -> str:
        """Generate public URL for a blob"""
        return f"https://storage.googleapis.com/{settings.gcs_bucket}/{blob_path}"

    async def save_asset(
        self,
        data: str,
        asset_type: str,
        user_id: str,
        prompt: Optional[str] = None,
        mime_type: Optional[str] = None,
        source: str = "generated",
        workflow_id: Optional[str] = None,
        folder_id: Optional[str] = None,
    ) -> AssetResponse:
        """Save an image or video to the asset library"""
        asset_id = self._generate_asset_id()
        now = datetime.utcnow()
        
        logger.info(f"Saving {asset_type} asset for user {user_id}")
        
        # Determine file extension and mime type
        if asset_type == "image":
            ext = "png" if not mime_type or "png" in mime_type else "jpg"
            mime_type = mime_type or "image/png"
        elif asset_type == "video":
            ext = "mp4"
            mime_type = mime_type or "video/mp4"
        else:
            raise InvalidAssetTypeError(asset_type)
        
        # Create blob path
        blob_path = f"users/{user_id}/{asset_type}s/{asset_id}.{ext}"
        
        # Decode and upload to GCS (non-blocking)
        clean_data = self._strip_base64_prefix(data)
        file_bytes = base64.b64decode(clean_data)

        blob = self.bucket.blob(blob_path)
        await run_sync(blob.upload_from_string, file_bytes, content_type=mime_type)

        # Save metadata to Firestore (non-blocking)
        asset_data = {
            "id": asset_id,
            "user_id": user_id,
            "asset_type": asset_type,
            "blob_path": blob_path,
            "mime_type": mime_type,
            "created_at": now,
            "prompt": prompt,
            "source": source,
            "workflow_id": workflow_id,
            "folder_id": folder_id,
        }

        await run_sync(self.assets_ref.document(asset_id).set, asset_data)

        logger.info(f"Successfully saved {asset_type} asset {asset_id} to {blob_path}")

        url = self._get_url(blob_path)

        return AssetResponse(
            id=asset_id,
            url=url,
            asset_type=asset_type,
            prompt=prompt,
            created_at=_dt_to_iso(now),
            mime_type=mime_type,
            user_id=user_id,
            folder_id=folder_id,
        )

    async def list_assets(
        self,
        user_id: str,
        asset_type: Optional[str] = None,
        limit: int = 50,
        folder_id: Optional[str] = None,
    ) -> LibraryResponse:
        """List assets for a user, optionally filtered by folder."""
        from google.cloud.firestore_v1.base_query import FieldFilter

        # Query by user_id only — folder/type filtering is done in Python below
        # to avoid needing composite Firestore indexes for every filter combination.
        query = self.assets_ref.where(filter=FieldFilter("user_id", "==", user_id))

        # Order by created_at descending and limit
        query = query.order_by("created_at", direction="DESCENDING").limit(limit)

        # Run blocking stream() in thread pool
        docs = await run_sync(lambda: list(query.stream()))

        assets = []
        for doc in docs:
            data = doc.to_dict()
            # Filter by asset type in Python
            if asset_type and data.get("asset_type") != asset_type:
                continue
            # Filter by folder in Python
            if folder_id == "__uncategorized__" and data.get("folder_id"):
                continue
            if folder_id and folder_id != "__uncategorized__" and data.get("folder_id") != folder_id:
                continue
            url = self._get_url(data["blob_path"])
            created_at = data["created_at"]

            assets.append(AssetResponse(
                id=data["id"],
                url=url,
                asset_type=data["asset_type"],
                prompt=data.get("prompt"),
                created_at=_dt_to_iso(created_at),
                mime_type=data["mime_type"],
                user_id=data["user_id"],
                folder_id=data.get("folder_id"),
            ))

        return LibraryResponse(assets=assets, count=len(assets))

    async def get_asset(self, asset_id: str, user_id: str) -> AssetResponse:
        """Get a specific asset by ID"""
        doc = await run_sync(self.assets_ref.document(asset_id).get)

        if not doc.exists:
            raise AssetNotFoundError(asset_id)

        data = doc.to_dict()

        # Check ownership
        if data.get("user_id") != user_id:
            raise AccessDeniedError()

        url = self._get_url(data["blob_path"])
        created_at = data["created_at"]

        return AssetResponse(
            id=data["id"],
            url=url,
            asset_type=data["asset_type"],
            prompt=data.get("prompt"),
            created_at=_dt_to_iso(created_at),
            mime_type=data["mime_type"],
            user_id=data["user_id"],
            folder_id=data.get("folder_id"),
        )

    async def get_asset_by_id(self, asset_id: str) -> Optional[dict]:
        """
        Get asset by ID without ownership check.
        Used for resolving asset refs in workflows (including public workflows).
        """
        doc = await run_sync(self.assets_ref.document(asset_id).get)

        if not doc.exists:
            return None

        data = doc.to_dict()
        url = self._get_url(data["blob_path"])

        return {
            "id": data["id"],
            "url": url,
            "asset_type": data["asset_type"],
            "mime_type": data["mime_type"],
            "exists": True
        }

    async def resolve_asset_urls(self, asset_ids: list[str]) -> dict[str, dict]:
        """
        Batch resolve multiple asset IDs to URLs.
        Returns dict mapping asset_id to {url, exists, asset_type, mime_type}

        Uses Firestore's get_all() for batch fetching to avoid N+1 queries.
        """
        if not asset_ids:
            return {}

        result = {}

        try:
            # Batch fetch all assets in a single Firestore round trip (non-blocking)
            doc_refs = [self.assets_ref.document(asset_id) for asset_id in asset_ids]
            docs = await run_sync(lambda: list(self.db.get_all(doc_refs)))

            for doc in docs:
                asset_id = doc.id
                if doc.exists:
                    data = doc.to_dict()
                    result[asset_id] = {
                        "url": self._get_url(data["blob_path"]),
                        "exists": True,
                        "asset_type": data["asset_type"],
                        "mime_type": data["mime_type"]
                    }
                else:
                    result[asset_id] = {"url": None, "exists": False}
        except Exception as e:
            logger.warning(f"Batch asset fetch failed: {e}, falling back to individual queries")
            # Fallback to individual queries if batch fails
            for asset_id in asset_ids:
                try:
                    doc = await run_sync(self.assets_ref.document(asset_id).get)
                    if doc.exists:
                        data = doc.to_dict()
                        result[asset_id] = {
                            "url": self._get_url(data["blob_path"]),
                            "exists": True,
                            "asset_type": data["asset_type"],
                            "mime_type": data["mime_type"]
                        }
                    else:
                        result[asset_id] = {"url": None, "exists": False}
                except Exception as inner_e:
                    logger.warning(f"Failed to resolve asset {asset_id}: {inner_e}")
                    result[asset_id] = {"url": None, "exists": False}

        return result

    async def delete_asset(self, asset_id: str, user_id: str) -> dict:
        """Delete an asset"""
        doc_ref = self.assets_ref.document(asset_id)
        doc = await run_sync(doc_ref.get)

        if not doc.exists:
            raise AssetNotFoundError(asset_id)

        data = doc.to_dict()

        # Check ownership
        if data.get("user_id") != user_id:
            raise AccessDeniedError("You can only delete your own assets")

        # Delete asset file from GCS (non-blocking)
        try:
            blob = self.bucket.blob(data["blob_path"])
            exists = await run_sync(blob.exists)
            if exists:
                await run_sync(blob.delete)
        except Exception as e:
            logger.warning(f"Failed to delete blob {data['blob_path']}: {e}")

        # Delete metadata from Firestore (non-blocking)
        await run_sync(doc_ref.delete)

        logger.info(f"Deleted asset {asset_id} for user {user_id}")

        return {"status": "deleted", "id": asset_id}

    # ============== FOLDER METHODS ==============

    async def create_folder(self, name: str, user_id: str) -> FolderResponse:
        """Create a new folder for the user."""
        folder_id = str(uuid.uuid4())
        now = datetime.utcnow()
        folder_data = {
            "id": folder_id,
            "name": name,
            "user_id": user_id,
            "created_at": now,
        }
        await run_sync(self.folders_ref.document(folder_id).set, folder_data)
        logger.info(f"Created folder {folder_id} '{name}' for user {user_id}")
        return FolderResponse(
            id=folder_id,
            name=name,
            user_id=user_id,
            created_at=_dt_to_iso(now),
            asset_count=0,
        )

    async def list_folders(self, user_id: str) -> FolderListResponse:
        """List all folders for the user with per-folder asset counts."""
        from google.cloud.firestore_v1.base_query import FieldFilter

        folder_docs = await run_sync(
            lambda: list(
                self.folders_ref.where(filter=FieldFilter("user_id", "==", user_id)).stream()
            )
        )
        folders_raw = [doc.to_dict() for doc in folder_docs]

        if not folders_raw:
            return FolderListResponse(folders=[], count=0)

        # Count assets per folder in a single query using "in" (supports up to 30 items)
        folder_ids = [f["id"] for f in folders_raw]
        counts: dict[str, int] = {}
        for i in range(0, len(folder_ids), 30):
            batch_ids = folder_ids[i:i + 30]
            asset_docs = await run_sync(
                lambda batch=batch_ids: list(
                    self.assets_ref
                    .where(filter=FieldFilter("user_id", "==", user_id))
                    .where(filter=FieldFilter("folder_id", "in", batch))
                    .stream()
                )
            )
            for doc in asset_docs:
                fid = doc.to_dict().get("folder_id")
                if fid:
                    counts[fid] = counts.get(fid, 0) + 1

        folders = []
        for f in sorted(folders_raw, key=lambda x: x.get("created_at") or ""):
            created_at = f["created_at"]
            folders.append(FolderResponse(
                id=f["id"],
                name=f["name"],
                user_id=f["user_id"],
                created_at=_dt_to_iso(created_at),
                asset_count=counts.get(f["id"], 0),
            ))

        return FolderListResponse(folders=folders, count=len(folders))

    async def rename_folder(self, folder_id: str, name: str, user_id: str) -> FolderResponse:
        """Rename a folder."""
        doc_ref = self.folders_ref.document(folder_id)
        doc = await run_sync(doc_ref.get)
        if not doc.exists:
            raise FolderNotFoundError(folder_id)
        data = doc.to_dict()
        if data.get("user_id") != user_id:
            raise AccessDeniedError()
        await run_sync(doc_ref.update, {"name": name})
        created_at = data["created_at"]
        return FolderResponse(
            id=folder_id,
            name=name,
            user_id=user_id,
            created_at=_dt_to_iso(created_at),
        )

    async def delete_folder_with_contents(self, folder_id: str, user_id: str) -> dict:
        """Delete a folder and permanently delete all its assets (GCS + Firestore)."""
        from google.cloud.firestore_v1.base_query import FieldFilter

        doc_ref = self.folders_ref.document(folder_id)
        doc = await run_sync(doc_ref.get)
        if not doc.exists:
            raise FolderNotFoundError(folder_id)
        data = doc.to_dict()
        if data.get("user_id") != user_id:
            raise AccessDeniedError()

        asset_docs = await run_sync(
            lambda: list(
                self.assets_ref.where(filter=FieldFilter("folder_id", "==", folder_id)).stream()
            )
        )
        for asset_doc in asset_docs:
            asset_data = asset_doc.to_dict()
            try:
                blob = self.bucket.blob(asset_data["blob_path"])
                exists = await run_sync(blob.exists)
                if exists:
                    await run_sync(blob.delete)
            except Exception as e:
                logger.warning(f"Failed to delete blob {asset_data.get('blob_path')}: {e}")
            await run_sync(asset_doc.reference.delete)

        logger.info(f"Permanently deleted {len(asset_docs)} assets from folder {folder_id}")
        await run_sync(doc_ref.delete)
        logger.info(f"Deleted folder {folder_id} with contents for user {user_id}")
        return {"status": "deleted", "id": folder_id, "assets_deleted": len(asset_docs)}

    async def delete_folder(self, folder_id: str, user_id: str) -> dict:
        """Delete a folder and move its assets to uncategorized."""
        from google.cloud.firestore_v1.base_query import FieldFilter

        doc_ref = self.folders_ref.document(folder_id)
        doc = await run_sync(doc_ref.get)
        if not doc.exists:
            raise FolderNotFoundError(folder_id)
        data = doc.to_dict()
        if data.get("user_id") != user_id:
            raise AccessDeniedError()

        # Move all assets in this folder to uncategorized via batch writes (max 500 per batch)
        asset_docs = await run_sync(
            lambda: list(
                self.assets_ref.where(filter=FieldFilter("folder_id", "==", folder_id)).stream()
            )
        )
        for i in range(0, len(asset_docs), 500):
            batch = self.db.batch()
            for asset_doc in asset_docs[i:i + 500]:
                batch.update(asset_doc.reference, {"folder_id": None})
            await run_sync(batch.commit)

        if asset_docs:
            logger.info(f"Moved {len(asset_docs)} assets to uncategorized after deleting folder {folder_id}")

        await run_sync(doc_ref.delete)
        logger.info(f"Deleted folder {folder_id} for user {user_id}")
        return {"status": "deleted", "id": folder_id}

    async def download_folder_as_zip(self, folder_id: str, user_id: str) -> tuple[io.BytesIO, str]:
        """Download all assets in a folder as an in-memory zip file."""
        from google.cloud.firestore_v1.base_query import FieldFilter

        folder_doc = await run_sync(self.folders_ref.document(folder_id).get)
        if not folder_doc.exists:
            raise FolderNotFoundError(folder_id)
        folder_data = folder_doc.to_dict()
        if folder_data.get("user_id") != user_id:
            raise AccessDeniedError()
        folder_name = folder_data["name"]

        # Fetch all user assets and filter to this folder in Python (avoids composite index)
        all_docs = await run_sync(
            lambda: list(
                self.assets_ref.where(filter=FieldFilter("user_id", "==", user_id)).stream()
            )
        )

        zip_buffer = io.BytesIO()
        count = 0
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for doc in all_docs:
                data = doc.to_dict()
                if data.get("folder_id") != folder_id:
                    continue
                blob_path = data.get("blob_path", "")
                ext = blob_path.rsplit(".", 1)[-1] if "." in blob_path else "bin"
                filename = f"{data['id']}.{ext}"
                try:
                    content = await run_sync(self.bucket.blob(blob_path).download_as_bytes)
                    zf.writestr(filename, content)
                    count += 1
                except Exception as e:
                    logger.warning(f"Skipping asset {data['id']} in zip (download failed): {e}")

        logger.info(f"Zipped {count} assets from folder '{folder_name}' for user {user_id}")
        zip_buffer.seek(0)
        return zip_buffer, folder_name

    async def move_asset_to_folder(
        self,
        asset_id: str,
        folder_id: Optional[str],
        user_id: str,
    ) -> AssetResponse:
        """Move an asset to a folder (or to uncategorized if folder_id is None)."""
        doc_ref = self.assets_ref.document(asset_id)
        doc = await run_sync(doc_ref.get)
        if not doc.exists:
            raise AssetNotFoundError(asset_id)
        data = doc.to_dict()
        if data.get("user_id") != user_id:
            raise AccessDeniedError()

        # Verify the target folder belongs to the user
        if folder_id is not None:
            folder_doc = await run_sync(self.folders_ref.document(folder_id).get)
            if not folder_doc.exists:
                raise FolderNotFoundError(folder_id)
            if folder_doc.to_dict().get("user_id") != user_id:
                raise AccessDeniedError()

        await run_sync(doc_ref.update, {"folder_id": folder_id})
        data["folder_id"] = folder_id
        url = self._get_url(data["blob_path"])
        created_at = data["created_at"]
        return AssetResponse(
            id=data["id"],
            url=url,
            asset_type=data["asset_type"],
            prompt=data.get("prompt"),
            created_at=_dt_to_iso(created_at),
            mime_type=data["mime_type"],
            user_id=data["user_id"],
            folder_id=folder_id,
        )
