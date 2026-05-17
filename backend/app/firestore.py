"""
Firestore client setup and utilities
"""
import os
from firebase_admin import firestore
from app.auth import init_firebase
from app.logging_config import setup_logger

logger = setup_logger(__name__)

_firestore_client = None


def get_firestore_client():
    """Get or create Firestore client (singleton)"""
    global _firestore_client
    if _firestore_client is None:
        init_firebase()  # Ensure Firebase is initialized
        _firestore_client = firestore.client()
        logger.info("Firestore client initialized")
    return _firestore_client


# Environment-based collection namespacing
# This ensures dev and prod don't share data when using the same Firebase project
# Set to empty string or 'none' to use original collection names (workflows, assets)
FIRESTORE_ENV = os.getenv('FIRESTORE_ENVIRONMENT', '')


def get_collection_name(base_name: str) -> str:
    """
    Get environment-namespaced collection name.

    Examples:
        - FIRESTORE_ENVIRONMENT=dev  -> get_collection_name('workflows') = 'dev_workflows'
        - FIRESTORE_ENVIRONMENT=prod -> get_collection_name('workflows') = 'prod_workflows'
        - FIRESTORE_ENVIRONMENT=     -> get_collection_name('workflows') = 'workflows' (no prefix)

    This prevents dev testing from polluting production data.
    """
    if not FIRESTORE_ENV or FIRESTORE_ENV.lower() == 'none':
        return base_name
    return f"{FIRESTORE_ENV}_{base_name}"


# Collection names (automatically namespaced by environment)
WORKFLOWS_COLLECTION = get_collection_name("workflows")
ASSETS_COLLECTION = get_collection_name("assets")
FOLDERS_COLLECTION = get_collection_name("folders")
SHARED_WORKFLOWS_COLLECTION = get_collection_name("shared_workflows")

logger.info(f"Firestore environment: {FIRESTORE_ENV}, using collections: {WORKFLOWS_COLLECTION}, {ASSETS_COLLECTION}, {FOLDERS_COLLECTION}")
