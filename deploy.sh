#!/bin/bash
# Deploy script for scan service

# Configuration
PROJECT_ID=${1:-audit-scan}
REGION=${2:-us-central1}
SERVICE_NAME=scan-service
IMAGE=gcr.io/$PROJECT_ID/$SERVICE_NAME

echo "Building and deploying $SERVICE_NAME to Cloud Run..."

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
else
  echo "❌ ERROR: .env file not found!"
  echo "Please create a .env file with FIREBASE_SERVICE_ACCOUNT variable"
  exit 1
fi

# Check if FIREBASE_SERVICE_ACCOUNT was loaded
if [ -z "$FIREBASE_SERVICE_ACCOUNT" ]; then
  echo "❌ ERROR: FIREBASE_SERVICE_ACCOUNT not found in .env file!"
  echo "Please add FIREBASE_SERVICE_ACCOUNT='your-firebase-service-account-json' to your .env file"
  exit 1
fi

echo "✅ Firebase service account loaded from .env file (${#FIREBASE_SERVICE_ACCOUNT} characters)"

# Create env vars file to avoid shell escaping issues
cat > /tmp/env-vars.yaml << EOF
NODE_ENV: production
PUPPETEER_EXECUTABLE_PATH: /usr/bin/chromium
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
  --env-vars-file=/tmp/env-vars.yaml \
  --min-instances 1

echo "✅ Firebase service account loaded from .env file (${#FIREBASE_SERVICE_ACCOUNT} characters)"

# Create env vars file to avoid shell escaping issues
cat > /tmp/env-vars.yaml << EOF
NODE_ENV: production
PUPPETEER_EXECUTABLE_PATH: /usr/bin/chromium
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
  --env-vars-file=/tmp/env-vars.yaml \
  --min-instances 1

# Check if deployment succeeded
if [ $? -ne 0 ]; then
  echo "❌ Deployment failed!"
  rm -f /tmp/env-vars.yaml
  exit 1
fi

# Clean up
rm -f /tmp/env-vars.yaml

echo "✅ Deployment succeeded!"

# Get the service URL
echo "Getting service URL..."
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")
echo "✅ Service URL: $SERVICE_URL"
echo "📝 This URL should remain consistent across deployments"

echo "Deployment complete!"

# Test the health endpoint
echo "Testing health endpoint..."
curl -s "$SERVICE_URL/health" | head -200

echo ""
echo "Fetching logs to help diagnose any startup issues..."
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME" --limit=20 --format="value(textPayload)" --region=$REGION | head -20
