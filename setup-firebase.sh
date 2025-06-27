#!/bin/bash
# Setup script to configure Firebase service account for deployment

echo "🔧 Setting up Firebase Service Account for deployment..."

# Check if service account file exists
SERVICE_ACCOUNT_FILE="firebase-service-account.json"

if [ ! -f "$SERVICE_ACCOUNT_FILE" ]; then
  echo "❌ Firebase service account file not found: $SERVICE_ACCOUNT_FILE"
  echo ""
  echo "Please do one of the following:"
  echo "1. Place your Firebase service account JSON file as 'firebase-service-account.json' in this directory"
  echo "2. Or set the FIREBASE_SERVICE_ACCOUNT environment variable directly:"
  echo "   export FIREBASE_SERVICE_ACCOUNT='your-entire-json-content-here'"
  echo ""
  echo "To get your service account JSON:"
  echo "1. Go to Firebase Console > Project Settings > Service Accounts"
  echo "2. Click 'Generate new private key'"
  echo "3. Download the JSON file and rename it to 'firebase-service-account.json'"
  exit 1
fi

# Read the service account file and export as environment variable
echo "✅ Found $SERVICE_ACCOUNT_FILE, setting up environment variable..."
export FIREBASE_SERVICE_ACCOUNT=$(cat "$SERVICE_ACCOUNT_FILE" | tr -d '\n')

echo "✅ FIREBASE_SERVICE_ACCOUNT environment variable is now set"
echo "✅ You can now run './deploy.sh' to deploy with Firebase configured"

# Optionally run deployment immediately
read -p "Do you want to run deployment now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🚀 Starting deployment..."
  ./deploy.sh
fi
