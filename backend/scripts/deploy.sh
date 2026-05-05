#!/bin/bash
set -e

echo "🚀 Deploying GenMedia API..."

# Configure uv to use public PyPI
export UV_INDEX_URL="https://pypi.org/simple/"


# Ask for environment
echo "Select deployment environment:"
echo "1) Development"
echo "2) Production"
read -p "Choose environment (1 or 2): " env_choice

case $env_choice in
  1)
    ENVIRONMENT="dev"
    SERVICE_NAME="veo-api-dev"
    ENV_FILE=".env.development"
    ;;
  2)
    ENVIRONMENT="prod"
    SERVICE_NAME="veo-api"
    ENV_FILE=".env.production"
    echo "⚠️  WARNING: This will deploy to PRODUCTION"
    read -p "Confirm production deployment? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
      echo "Deployment cancelled"
      exit 0
    fi
    ;;
  *)
    echo "Invalid choice. Exiting."
    exit 1
    ;;
esac

# Load environment file
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: $ENV_FILE not found"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

# Set Firestore environment variable for prod
if [ "$ENVIRONMENT" = "prod" ]; then
  FIRESTORE_ENVIRONMENT="prod"
fi

# Extract values from config.py using uv environment
PROJECT_ID=$(uv run python -c "from app.config import settings; print(settings.project_id)")
API_LOCATION=$(uv run python -c "from app.config import settings; print(settings.location)")
GCS_BUCKET=$(uv run python -c "from app.config import settings; print(settings.gcs_bucket)")
WORKFLOWS_BUCKET=$(uv run python -c "from app.config import settings; print(settings.workflows_bucket)")
FIREBASE_PROJECT_ID=$(uv run python -c "from app.config import settings; print(settings.firebase_project_id)")
VEO_MODEL=$(uv run python -c "from app.config import settings; print(settings.veo_model)")
VEO_LOCATION=$(uv run python -c "from app.config import settings; print(settings.veo_location)")

# Environment variables (from .env.production or .env)
ALLOWED_EMAILS="${ALLOWED_EMAILS:-}"
ALLOWED_DOMAINS="${ALLOWED_DOMAINS:-}"
ADMIN_EMAILS="${ADMIN_EMAILS:-}"
ELEVENLABS_API_KEY="${ELEVENLABS_API_KEY:-}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}"

if [ -z "$ALLOWED_EMAILS" ] && [ -z "$ALLOWED_DOMAINS" ]; then
  echo "ℹ️  Note: No access restrictions set. All authenticated users will have access."
fi

# Cloud Run region (separate from API location - Cloud Run doesn't support "global")
CLOUD_RUN_REGION="us-central1"

echo "📋 Deployment config:"
echo "  Environment: $ENVIRONMENT"
echo "  Project ID: $PROJECT_ID"
echo "  Cloud Run Region: $CLOUD_RUN_REGION"
echo "  Service: $SERVICE_NAME"
echo "  API Location: $API_LOCATION"
echo "  GCS Bucket: $GCS_BUCKET"
echo "  Workflows Bucket: $WORKFLOWS_BUCKET"
echo "  Firebase Project: $FIREBASE_PROJECT_ID"
echo "  Firestore Environment: $FIRESTORE_ENVIRONMENT"
echo "  Veo Model: $VEO_MODEL"
echo "  Veo Location: $VEO_LOCATION"
echo "  Allowed Domains: $ALLOWED_DOMAINS"
echo "  Allowed Emails: $ALLOWED_EMAILS"
echo "  Allowed Origins: $ALLOWED_ORIGINS"

# Create temporary env vars file (handles commas properly)
ENV_VARS_FILE=$(mktemp)
cat > "$ENV_VARS_FILE" << EOF
PROJECT_ID: "$PROJECT_ID"
LOCATION: "$API_LOCATION"
GCS_BUCKET: "$GCS_BUCKET"
WORKFLOWS_BUCKET: "$WORKFLOWS_BUCKET"
FIREBASE_PROJECT_ID: "$FIREBASE_PROJECT_ID"
FIRESTORE_ENVIRONMENT: "$FIRESTORE_ENVIRONMENT"
ALLOWED_DOMAINS: "$ALLOWED_DOMAINS"
ALLOWED_EMAILS: "$ALLOWED_EMAILS"
ADMIN_EMAILS: "$ADMIN_EMAILS"
ELEVENLABS_API_KEY: "$ELEVENLABS_API_KEY"
ALLOWED_ORIGINS: "$ALLOWED_ORIGINS"
VEO_MODEL: "$VEO_MODEL"
VEO_LOCATION: "$VEO_LOCATION"
EOF

# Clean up temp file on exit
trap "rm -f $ENV_VARS_FILE" EXIT

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project="$PROJECT_ID" \
  --region="$CLOUD_RUN_REGION" \
  --allow-unauthenticated \
  --ingress=all \
  --env-vars-file="$ENV_VARS_FILE" \
  --timeout=300 \
  --memory=2Gi \
  --cpu=2

# Get the service URL dynamically
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$CLOUD_RUN_REGION" --project="$PROJECT_ID" --format='value(status.url)')

echo "✅ Deployment complete!"
echo "🔗 $SERVICE_URL"