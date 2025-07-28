#!/bin/bash
# Deploy script for scan service - PRODUCTION environment
# Requires "production" as first argument to prevent accidental production deployments

# Check if production flag is provided
if [ "$1" != "production" ]; then
  echo "❌ ERROR: This script deploys to PRODUCTION!"
  echo "Usage: $0 production [project-id] [region]"
  echo ""
  echo "To deploy to staging instead, use: ./deploy-staging.sh"
  echo "To deploy to production, use: ./deploy.sh production"
  exit 1
fi

# Configuration
PROJECT_ID=${2:-audit-widget}
REGION=${3:-us-central1}
SERVICE_NAME=scan-service
# Use Artifact Registry instead of deprecated GCR
IMAGE=us-central1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/$SERVICE_NAME

echo "🔥 Building and deploying $SERVICE_NAME to Cloud Run (PRODUCTION)..."

# Build and push the image with cloudbuild
echo "Building image with Cloud Build..."
# Add timestamp to force new image build
TIMESTAMP=$(date +%s)
IMAGE_WITH_TAG="$IMAGE:$TIMESTAMP"
echo "Using image tag: $IMAGE_WITH_TAG"
gcloud builds submit --tag $IMAGE_WITH_TAG

# Check if build succeeded
if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi

# Deploy to Cloud Run with appropriate resources
echo "Deploying to Cloud Run..."

# Load environment variables from .env file
if [ -f .env ]; then
  echo "Loading environment variables from .env file..."
  # Read the entire line and extract everything after the first =
  FIREBASE_SERVICE_ACCOUNT=$(grep "^FIREBASE_SERVICE_ACCOUNT=" .env | sed 's/^FIREBASE_SERVICE_ACCOUNT=//')
  OPENAI_API_KEY=$(grep "^OPENAI_API_KEY=" .env | sed 's/^OPENAI_API_KEY=//' | sed "s/^'//" | sed "s/'$//")
else
  echo "❌ ERROR: .env file not found!"
  echo "Please create a .env file with FIREBASE_SERVICE_ACCOUNT and OPENAI_API_KEY variables"
  exit 1
fi

# Check if FIREBASE_SERVICE_ACCOUNT was loaded
if [ -z "$FIREBASE_SERVICE_ACCOUNT" ]; then
  echo "❌ ERROR: FIREBASE_SERVICE_ACCOUNT not found in .env file!"
  echo "Please add FIREBASE_SERVICE_ACCOUNT='your-firebase-service-account-json' to your .env file"
  exit 1
fi

# Check if OPENAI_API_KEY was loaded
if [ -z "$OPENAI_API_KEY" ]; then
  echo "❌ ERROR: OPENAI_API_KEY not found in .env file!"
  echo "Please add OPENAI_API_KEY='your-openai-api-key' to your .env file"
  exit 1
fi

echo "✅ Firebase service account loaded from .env file (${#FIREBASE_SERVICE_ACCOUNT} characters)"
echo "✅ OpenAI API key loaded from .env file (${#OPENAI_API_KEY} characters)"

# Create env vars file to avoid shell escaping issues - production environment
cat > /tmp/env-vars-production.yaml << EOF
NODE_ENV: production
PUPPETEER_EXECUTABLE_PATH: /usr/bin/google-chrome-stable
OPENAI_API_KEY: ${OPENAI_API_KEY}
FIREBASE_SERVICE_ACCOUNT: |
  ${FIREBASE_SERVICE_ACCOUNT}
EOF

gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_WITH_TAG \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 10 \
  --port 8080 \
  --env-vars-file=/tmp/env-vars-production.yaml \
  --min-instances 1

# Check if deployment succeeded
if [ $? -ne 0 ]; then
  echo "❌ Deployment failed!"
  rm -f /tmp/env-vars-production.yaml
  exit 1
fi

# Clean up
rm -f /tmp/env-vars-production.yaml

echo "✅ PRODUCTION Deployment succeeded!"

# Get the service URL
echo "Getting service URL..."
SERVICE_URL=$(gcloud run services describe $SERVI
NAME --region=$REGION --format="value(status.url)")
echo "✅ PRODUCTION Service URL: $SERVICE_URL"
echo "📝 This URL should remain consistent across deployments"

echo "PRODUCTION Deployment complete!"

# Test the health endpoint
echo "Testing health endpoint..."
curl -s "$SERVICE_URL/health" | head -200

echo ""
echo "Fetching logs to help diagnose any startup issues..."
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME" --limit=20 --format="value(textPayload)" | head -20
