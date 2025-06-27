# Scan Service

A standalone Node.js service for handling heavy website scanning operations including Lighthouse performance audits, comprehensive website scraping, accessibility scanning, and screenshot capture.

## Overview

This service extracts all heavy computational tasks from the main Next.js application to4. **Cloud Run container startup issues**:
   - Ensure the container listens on the port specified by the `PORT` environment variable (8080)
   - Check that all required environment variables are set in the deployment
   - Verify that the `NODE_ENV` is set to `production`
   - Ensure the correct `CMD` is specified in the Dockerfile
   - **Firebase credentials**: Ensure the Firebase service account JSON is available
     - Option 1: Include it in the Docker image (for testing only)
     - Option 2: Pass it as base64-encoded environment variable (recommended for production)as a separate service, typically deployed on Google Cloud Run. This architecture allows:

- **Unlimited execution time** for long-running scans
- **Dedicated resources** for CPU/memory intensive operations
- **Better scalability** for concurrent scan requests
- **Isolation** of heavy dependencies from the main app

## Features

### 🚀 Lighthouse Performance Audits
- Performance, accessibility, SEO, and best practices scoring
- Core Web Vitals metrics
- Mobile and desktop testing

### 🔍 Website Scraping & Analysis
- Comprehensive content analysis
- SEO metadata extraction
- Link validation and broken link detection
- Call-to-action and form analysis
- Social media presence detection
- Security header analysis
- Multi-page scanning support

### ♿ Accessibility Scanning
- WCAG 2.1 AA compliance testing
- Visual annotation of accessibility issues
- Detailed violation reporting with impact levels
- Screenshot generation with issue markers

### 📸 Screenshot Capture
- Full-page and viewport screenshots
- Mobile and desktop device simulation
- Customizable dimensions

## API Endpoints

### New Audit API (Recommended)

#### Start Audit
```
POST /audit/start
```
Start a comprehensive audit that runs all scans and stores results in Firebase.

**Request Body:**
```json
{
  "url": "https://example.com",
  "useDesktop": true,
  "categories": ["performance", "accessibility", "seo"]
}
```

**Response:**
```json
{
  "auditId": "example-com-4r17"
}
```

#### Get Audit Status
```
GET /audit/{auditId}
```
Get the status and results of an audit.

**Response:**
```json
{
  "auditId": "example-com-4r17",
  "url": "https://example.com",
  "status": "completed",
  "createdAt": 1640995200000,
  "completedAt": 1640995500000,
  "stages": {
    "lighthouse": { /* lighthouse results */ },
    "accessibility": { /* accessibility results */ },
    "scrape": { /* scrape results */ },
    "screenshot": "base64-encoded-image"
  }
}
```

#### Download Audit as JSON
```
GET /audit/{auditId}/download
```
Download the complete audit results as a JSON file.

**Response:**
- Returns the complete audit data as a downloadable JSON file
- Filename: `audit-{auditId}.json`
- Content-Type: `application/json`

**Example:**
```bash
curl -O "http://localhost:8080/audit/example-com-4r17/download"
# Downloads: audit-example-com-4r17.json
```

### Health Check
```
GET /health
```
Returns service status and health information.

### Individual Scan Endpoints (Legacy)

### Lighthouse Audit
```
GET /lighthouse?host=example.com&uid=user123&docId=doc456
```
Parameters:
- `host`: Website URL to scan
- `uid`: User ID for tracking
- `docId`: Document ID for data storage

### Website Scraping
```
GET /scrape?host=example.com&uid=user123&docId=doc456&mode=full
```
Parameters:
- `host`: Website URL to scrape
- `uid`: User ID for tracking  
- `docId`: Document ID for data storage
- `mode`: Scan mode (`single`, `full`, `custom`)
- `customSubpages`: JSON array of specific pages to scan (optional)

### Accessibility Scan
```
GET /accessibility?host=example.com&uid=user123&docId=doc456&deviceType=desktop
```
Parameters:
- `host`: Website URL to scan
- `uid`: User ID for tracking
- `docId`: Document ID for data storage
- `deviceType`: Device type (`desktop` or `mobile`)
- `screenshotWidth`: Custom screenshot width (optional)
- `screenshotHeight`: Custom screenshot height (optional)
- `skipFirestore`: Skip Firestore save (optional, for per-page scanning)

### Screenshot Capture
```
GET /screenshot?host=example.com&uid=user123&docId=doc456&width=1366&height=768
```
Parameters:
- `host`: Website URL to capture
- `uid`: User ID for tracking
- `docId`: Document ID for data storage  
- `width`: Screenshot width (default: 1366)
- `height`: Screenshot height (default: 768)
- `fullPage`: Capture full page (`true` or `false`)

## Installation

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the service:
```bash
npm start
```

The service will run on port 8080 by default.

### Docker Deployment

Build the Docker image:
```bash
docker build -t scan-service .
```

Run the container:
```bash
docker run -p 8080:8080 scan-service
```

### Google Cloud Run Deployment

Deploy using the provided script:
```bash
chmod +x deploy.sh
./deploy.sh
```

Or manually:
```bash
gcloud run deploy scan-service \\
  --source . \\
  --platform managed \\
  --region us-central1 \\
  --allow-unauthenticated \\
  --memory 2Gi \\
  --cpu 2 \\
  --timeout 3600 \\
  --max-instances 10
```

## Dependencies

### Core Dependencies
- **express**: Web framework
- **cors**: Cross-origin resource sharing
- **puppeteer**: Browser automation for screenshots and accessibility
- **lighthouse**: Performance auditing
- **cheerio**: Server-side HTML parsing
- **axios**: HTTP client for web requests
- **sharp**: Image processing for screenshot annotation
- **p-retry**: Retry mechanism for resilient requests
- **user-agents**: Random user agent generation

### System Dependencies (for Docker)
- Chromium browser
- System fonts for proper rendering
- Image processing libraries for Canvas/Sharp

## Configuration

### Environment Variables
- `PORT`: Service port (default: 8080)
- `SCAN_SERVICE_URL`: URL for the scan service (used by main app)
- `FIREBASE_SERVICE_ACCOUNT`: Base64-encoded Firebase service account JSON (for Cloud Run)

### Main App Integration

Update your main application's environment variables:
```env
SCAN_SERVICE_URL=https://your-scan-service-url
```

For local development:
```env
SCAN_SERVICE_URL=http://localhost:8080
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   Next.js App   │───▶│  Scan Service   │
│  (Vercel)       │    │ (Cloud Run)     │
├─────────────────┤    ├─────────────────┤
│ • API Routes    │    │ • Lighthouse    │
│ • UI Components │    │ • Scraping      │
│ • Firestore     │    │ • Accessibility │
│ • Auth          │    │ • Screenshots   │
└─────────────────┘    └─────────────────┘
```

## Error Handling

The service implements comprehensive error handling:
- Request validation
- Timeout management
- Browser cleanup
- Graceful degradation
- Detailed error reporting

## Monitoring

### Health Checks
The `/health` endpoint provides service status for monitoring systems.

### Logging
Structured logging with different levels:
- Request/response logging
- Error tracking
- Performance metrics
- Step-by-step progress tracking

## Testing

Run the test suite:
```bash
node ../test-scan-service.js
```

This tests all endpoints with a sample website to ensure functionality.

## Performance Considerations

### Resource Limits
- Memory: 2GB recommended for Cloud Run
- CPU: 2 vCPU recommended for concurrent scans
- Timeout: Up to 60 minutes for comprehensive scans

### Optimization
- Browser instance reuse where possible
- Request batching for link validation
- Image optimization for screenshots
- Parallel processing for multi-page scans

## Security

### Input Validation
- URL validation and sanitization
- Parameter validation
- Rate limiting considerations

### Browser Security
- Sandboxed Chromium execution
- No JavaScript execution on target sites
- Isolated browser contexts

## Troubleshooting

### Common Issues

1. **Browser launch failures**
   - Ensure system dependencies are installed
   - Check memory limits
   - Verify Docker configuration

2. **Timeout errors**
   - Increase service timeout limits
   - Check target website responsiveness
   - Monitor resource usage

3. **Screenshot annotation failures**
   - Verify Sharp dependencies
   - Check image processing libraries
   - Monitor memory usage during processing

4. **Cloud Run container startup issues**
   - Ensure the container listens on the port specified by the `PORT` environment variable (8080)
   - Check that all required environment variables are set in the deployment
   - Verify that the `NODE_ENV` is set to `production`
   - Ensure the correct `CMD` is specified in the Dockerfile

### Debugging

#### Local Container Testing

Test the container locally before deploying:

```bash
# Test container locally
./debug-local.sh

# Check if the health endpoint responds
curl http://localhost:8080/health
```

#### View Cloud Run Logs

Check the container logs in Cloud Run:

```bash
# View the most recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=scan-service" --limit 50

# Filter for error logs only
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=scan-service AND severity>=ERROR" --limit 20
```

#### Health Check Verification

The health check endpoint provides detailed diagnostic information:

```bash
# Get the service URL
SERVICE_URL=$(gcloud run services describe scan-service --region us-central1 --format="value(status.url)")

# Check the health endpoint
curl -s "$SERVICE_URL/health"
```

Enable verbose logging by setting log levels in the application code or checking Cloud Run logs for detailed error information.

## Contributing

When making changes:
1. Test locally with `npm start`
2. Run integration tests
3. Update documentation
4. Deploy to staging environment first

## License

This service is part of the AuditScan.ai application.

## Using This API from Next.js (or Any Frontend)

You can call the audit API from your Next.js app using `fetch` or `axios`. Here’s an example using `fetch` in an API route or server action:

```js
// Example: pages/api/start-audit.js (Next.js API route)
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { url, pages } = req.body;

    const response = await fetch('https://your-api-endpoint/audit/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, pages }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
```

**Client-side usage (React/Next.js):**
```js
// Example: Trigger audit from a form
const startAudit = async () => {
  const res = await fetch('/api/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://example.com',
      pages: ['/about', '/contact']
    }),
  });
  const data = await res.json();
  // handle response
};
```

**Notes:**
- Replace `'https://your-api-endpoint/audit/start'` with your deployed API URL.
- The API expects a POST request with a JSON body containing at least a `url` and optionally a `pages` array.
- You can use this pattern in any framework (Next.js, React, Vue, etc.) that supports HTTP requests.
