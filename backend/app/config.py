from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field
from typing import List


def parse_email_list(value: str | None) -> List[str]:
    """Parse comma-separated email string into list, trimming whitespace and filtering empty."""
    if value is None or value == "":
        return []
    return [e.strip().lower() for e in value.split(",") if e and e.strip()]


def parse_domain_list(value: str | None) -> List[str]:
    """Parse comma-separated domain string into list, trimming whitespace and filtering empty."""
    if value is None or value == "":
        return []
    # Strip @ prefix if present, lowercase, and filter empty
    domains = []
    for d in value.split(","):
        d = d.strip().lower()
        if d:
            # Remove leading @ if present
            if d.startswith("@"):
                d = d[1:]
            domains.append(d)
    return domains


class Settings(BaseSettings):
    project_id: str = "genmediastudio"
    location: str = "us-central1"
    veo_location: str = "us-central1"  # Veo API only available in us-central1
    gemini_image_location: str = "global"  # Gemini 3 Pro Image requires global endpoint
    gcs_bucket: str = "genmediastudio-assets"
    workflows_bucket: str = "genmediastudio-workflows"
    firebase_project_id: str = "genmediastudio"

    # Email/domain allowlists - stored as comma-separated strings from env
    # Format: ALLOWED_EMAILS=email1@example.com,email2@example.com
    # Format: ALLOWED_DOMAINS=hubspot.com,example.com (or @hubspot.com)
    _allowed_emails_raw: str = ""
    _admin_emails_raw: str = ""
    _allowed_domains_raw: str = ""

    # Firebase config (for testing)
    firebase_api_key: str = ""
    firebase_service_account_key: str = "serviceAccountKey.json"

    # ElevenLabs API key (for voice changing)
    elevenlabs_api_key: str = ""

    # OpenAI API key (for Whisper audio transcription in burn captions)
    openai_api_key: str = ""

    # Model names
    gemini_image_model: str = "gemini-3-pro-image-preview"  # Nano Banana Pro - Gemini 3 Pro Image
    gemini_text_model: str = "gemini-2.0-flash"  # Gemini 2.0 Flash model
    veo_model: str = "veo-3.1-generate-001"
    upscale_model: str = "imagen-4.0-upscale-preview"
    lyria_model: str = "lyria-002"  # Google Lyria music generation model

    @property
    def ALLOWED_EMAILS(self) -> List[str]:
        """List of allowed emails parsed from comma-separated string."""
        return parse_email_list(self._allowed_emails_raw)

    @property
    def ADMIN_EMAILS(self) -> List[str]:
        """List of admin emails parsed from comma-separated string."""
        return parse_email_list(self._admin_emails_raw)

    @property
    def ALLOWED_DOMAINS(self) -> List[str]:
        """List of allowed email domains parsed from comma-separated string."""
        return parse_domain_list(self._allowed_domains_raw)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # Map env var names to internal fields
        env_prefix="",
    )

    def model_post_init(self, __context):
        """Load email/domain lists from environment after init."""
        import os
        # Read directly from env since pydantic-settings doesn't handle uppercase well
        allowed = os.getenv("ALLOWED_EMAILS", "")
        admin = os.getenv("ADMIN_EMAILS", "")
        domains = os.getenv("ALLOWED_DOMAINS", "")
        object.__setattr__(self, "_allowed_emails_raw", allowed)
        object.__setattr__(self, "_admin_emails_raw", admin)
        object.__setattr__(self, "_allowed_domains_raw", domains)


settings = Settings()
