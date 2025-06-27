#!/bin/bash
# Deploy script for scan service

PROJECT_ID=${1:-audit-scan}
REGION=${2:-us-central1}
SERVICE_NAME=scan-service
IMAGE=gcr.io/$PROJECT_ID/$SERVICE_NAME

echo "Building and deploying $SERVICE_NAME to Cloud Run..."

# Build and push the image
gcloud builds submit --tag $IMAGE

# Deploy to Cloud Run with appropriate resources
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 16Gi \
  --cpu 4 \
  --timeout 300 \
  --max-instances 10

echo "Deployment complete!"
echo "Service URL will be displayed above."
