#!/bin/bash
# Deploy script for scan service - STAGING environment

# Configuration for staging
PROJECT_ID=${1:-audit-widget}
REGION=${2:-us-central1}
SERVICE_NAME=scan-service-staging
# Use Artifact Registry instead of deprecated GCR
IMAGE=us-central1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/$SERVICE_NAME

echo "🚀 Building and deploying $SERVICE_NAME to Cloud Run (STAGING)..."

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
echo "Deploying to Cloud Run (STAGING)..."

# Load environment variables from .env file
if [ -f .env ]; then
  echo "Loading environment variables from .env file..."
  # Read the entire line and extract everything after the first =
  FIREBASE_SERVICE_ACCOUNT=$(grep "^FIREBASE_SERVICE_ACCOUNT=" .env | sed 's/^FIREBASE_SERVICE_ACCOUNT=//')
  OPENAI_API_KEY=$(grep "^OPENAI_API_KEY=" .env | sed 's/^OPENAI_API_KEY=//' | sed "s/^'//" | sed "s/'$//")
  MOZ_API_TOKEN=$(grep "^MOZ_API_TOKEN=" .env | sed 's/^MOZ_API_TOKEN=//' | sed "s/^'//" | sed "s/'$//")
  MOZ_ENABLED=$(grep "^MOZ_ENABLED=" .env | sed 's/^MOZ_ENABLED=//' | sed "s/^'//" | sed "s/'$//")
else
  echo "❌ ERROR: .env file not found!"
  echo "Please create a .env file with FIREBASE_SERVICE_ACCOUNT, OPENAI_API_KEY, and MOZ environment variables"
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

# Check if MOZ API Token was loaded
if [ -z "$MOZ_API_TOKEN" ]; then
  echo "❌ ERROR: MOZ_API_TOKEN not found in .env file!"
  echo "Please add MOZ_API_TOKEN='your-moz-api-token' to your .env file"
  exit 1
fi

if [ -z "$MOZ_ENABLED" ]; then
  echo "❌ ERROR: MOZ_ENABLED not found in .env file!"
  echo "Please add MOZ_ENABLED='true' to your .env file"
  exit 1
fi

echo "✅ Firebase service account loaded from .env file (${#FIREBASE_SERVICE_ACCOUNT} characters)"
echo "✅ OpenAI API key loaded from .env file (${#OPENAI_API_KEY} characters)"
echo "✅ MOZ API Token loaded from .env file (${#MOZ_API_TOKEN} characters, Enabled: $MOZ_ENABLED)"

# Create env vars file to avoid shell escaping issues - staging environment
cat > /tmp/env-vars-staging.yaml << EOF
NODE_ENV: staging
PUPPETEER_EXECUTABLE_PATH: /usr/bin/google-chrome-stable
OPENAI_API_KEY: ${OPENAI_API_KEY}
MOZ_API_TOKEN: ${MOZ_API_TOKEN}
MOZ_ENABLED: "${MOZ_ENABLED}"
FIREBASE_SERVICE_ACCOUNT: |
  ${FIREBASE_SERVICE_ACCOUNT}
EOF

gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_WITH_TAG \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 16Gi \
  --cpu 4 \
  --timeout 300 \
  --max-instances 10 \
  --port 8080 \
  --env-vars-file=/tmp/env-vars-staging.yaml \
  --min-instances 0 \
  --execution-environment gen2 \
  --cpu-boost

# Check if deployment succeeded
if [ $? -ne 0 ]; then
  echo "❌ Deployment failed!"
  rm -f /tmp/env-vars-staging.yaml
  exit 1
fi

# Clean up
rm -f /tmp/env-vars-staging.yaml

echo "✅ STAGING Deployment succeeded!"

# Get the service URL
echo "Getting service URL..."
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")
echo "✅ STAGING Service URL: $SERVICE_URL"
echo "📝 This URL should remain consistent across deployments"

echo "STAGING Deployment complete!"

# Test the health endpoint
echo "Testing health endpoint..."
curl -s "$SERVICE_URL/health" | head -200

echo ""
echo "Fetching logs to help diagnose any startup issues..."
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME" --limit=20 --format="value(textPayload)" | head -20
