#!/bin/bash
# Script to diagnose Cloud Run service issues

SERVICE_NAME=${1:-scan-service}
REGION=${2:-us-central1}
PROJECT_ID=${3:-audit-scan}

echo "Diagnosing Cloud Run service: $SERVICE_NAME"
echo "----------------------------------------"

# Get basic service info
echo "Service details:"
gcloud run services describe $SERVICE_NAME --region $REGION --format="yaml(status)" | grep -v -e "^kind" -e "^metadata" -e "^apiVersion"
echo ""

# Check service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format="value(status.url)")
echo "Service URL: $SERVICE_URL"
echo ""

# Check recent logs
echo "Recent logs (last 10 entries):"
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME" --limit 10 --format="value(timestamp, textPayload)"
echo ""

# Check revisions
echo "Service revisions:"
gcloud run revisions list --service $SERVICE_NAME --region $REGION
echo ""

# Check health endpoint (if service is running)
echo "Testing health endpoint:"
curl -s "$SERVICE_URL/health" || echo "Failed to access health endpoint"
echo ""

echo "----------------------------------------"
echo "Diagnostics complete"
