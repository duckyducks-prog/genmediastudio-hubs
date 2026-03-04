"""
Custom exception classes for structured error handling.

These exceptions provide consistent error responses with:
- HTTP status codes
- Machine-readable error codes
- Human-readable messages

To revert: Delete this file and remove exception handlers from main.py.
Then revert services to raise generic exceptions.
"""
from typing import Optional


class AppError(Exception):
    """
    Base exception class for all application errors.

    All custom exceptions inherit from this class, allowing
    a single exception handler to catch all app-specific errors.
    """
    def __init__(
        self,
        message: str,
        code: str,
        status: int = 500,
        details: Optional[dict] = None
    ):
        self.message = message
        self.code = code
        self.status = status
        self.details = details or {}
        super().__init__(message)

    def to_dict(self) -> dict:
        """Convert exception to JSON-serializable dict"""
        result = {
            "error": self.message,
            "code": self.code
        }
        if self.details:
            result["details"] = self.details
        return result


# ============== GENERATION ERRORS ==============

class GenerationError(AppError):
    """Base class for generation-related errors"""
    pass


class RateLimitError(GenerationError):
    """Raised when API rate limit is exceeded (429)"""
    def __init__(self, message: str = "Rate limit exceeded. Please try again later."):
        super().__init__(
            message=message,
            code="RATE_LIMITED",
            status=429
        )


class QuotaExhaustedError(GenerationError):
    """Raised when API quota is exhausted"""
    def __init__(self, message: str = "API quota exhausted. Please try again later."):
        super().__init__(
            message=message,
            code="QUOTA_EXHAUSTED",
            status=429
        )


class GenerationFailedError(GenerationError):
    """Raised when content generation fails"""
    def __init__(self, content_type: str, reason: str = "Unknown error"):
        super().__init__(
            message=f"{content_type} generation failed: {reason}",
            code="GENERATION_FAILED",
            status=500,
            details={"content_type": content_type, "reason": reason}
        )


class NoContentGeneratedError(GenerationError):
    """Raised when generation returns empty results"""
    def __init__(self, content_type: str):
        super().__init__(
            message=f"No {content_type} was generated. Try a different prompt.",
            code="NO_CONTENT_GENERATED",
            status=500,
            details={"content_type": content_type}
        )


class UpstreamAPIError(GenerationError):
    """Raised when upstream API returns an error"""
    def __init__(self, status_code: int, api_message: str):
        super().__init__(
            message=f"Upstream API error: {api_message}",
            code="UPSTREAM_API_ERROR",
            status=502,  # Bad Gateway
            details={"upstream_status": status_code}
        )


class RequestTimeoutError(GenerationError):
    """Raised when a request times out after all retries"""
    def __init__(self, operation: str = "Request"):
        super().__init__(
            message=f"{operation} timed out. The video generation service may be overloaded. Please try again.",
            code="REQUEST_TIMEOUT",
            status=504,  # Gateway Timeout
            details={"operation": operation}
        )


# ============== RESOURCE ERRORS ==============

class ResourceNotFoundError(AppError):
    """Raised when a requested resource doesn't exist"""
    def __init__(self, resource_type: str, resource_id: str):
        super().__init__(
            message=f"{resource_type} not found: {resource_id}",
            code="NOT_FOUND",
            status=404,
            details={"resource_type": resource_type, "resource_id": resource_id}
        )


class AssetNotFoundError(ResourceNotFoundError):
    """Raised when an asset doesn't exist"""
    def __init__(self, asset_id: str):
        super().__init__(resource_type="Asset", resource_id=asset_id)


class FolderNotFoundError(ResourceNotFoundError):
    """Raised when a folder doesn't exist"""
    def __init__(self, folder_id: str):
        super().__init__(resource_type="Folder", resource_id=folder_id)


class WorkflowNotFoundError(ResourceNotFoundError):
    """Raised when a workflow doesn't exist"""
    def __init__(self, workflow_id: str):
        super().__init__(resource_type="Workflow", resource_id=workflow_id)


# ============== ACCESS ERRORS ==============

class AccessDeniedError(AppError):
    """Raised when user lacks permission to access a resource"""
    def __init__(self, message: str = "Access denied"):
        super().__init__(
            message=message,
            code="ACCESS_DENIED",
            status=403
        )


class AuthenticationError(AppError):
    """Raised when authentication fails"""
    def __init__(self, message: str = "Authentication required"):
        super().__init__(
            message=message,
            code="AUTHENTICATION_REQUIRED",
            status=401
        )


class InvalidTokenError(AuthenticationError):
    """Raised when token is invalid or expired"""
    def __init__(self, reason: str = "Invalid or expired token"):
        super().__init__(message=reason)
        self.code = "INVALID_TOKEN"


# ============== VALIDATION ERRORS ==============

class ValidationError(AppError):
    """Raised when input validation fails"""
    def __init__(self, message: str, field: Optional[str] = None):
        details = {"field": field} if field else {}
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            status=400,
            details=details
        )


class InvalidAssetTypeError(ValidationError):
    """Raised when asset type is invalid"""
    def __init__(self, asset_type: str):
        super().__init__(
            message=f"Invalid asset type: {asset_type}. Must be 'image' or 'video'.",
            field="asset_type"
        )
