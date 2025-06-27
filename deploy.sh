#!/bin/bash
# Deploy script for scan service

PROJECT_ID=${1:-audit-scan}
REGION=${2:-us-central1}
SERVICE_NAME=scan-service
IMAGE=gcr.io/$PROJECT_ID/$SERVICE_NAME

echo "Building and deploying $SERVICE_NAME to Cloud Run..."

# Build and push the image with cloudbuild
echo "Building image with Cloud Build..."
gcloud builds submit --tag $IMAGE

# Deploy to Cloud Run with appropriate resources
echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 16Gi \
  --cpu 4 \
  --timeout 300 \
  --max-instances 10 \
  --port 8080 \
  --set-env-vars="NODE_ENV=production" \
  --min-instances 1

echo "Deployment complete!"
echo "Service URL will be displayed above."

# Display logs to help troubleshoot
echo "Fetching logs to help diagnose any startup issues..."
sleep 10
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME" --limit 20 --format="value(textPayload)"

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format="value(status.url)")
echo "Service URL: $SERVICE_URL"

# Check health endpoint
echo "Testing health endpoint..."
curl -s "$SERVICE_URL/health" || echo "Failed to reach health endpoint"
