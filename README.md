# Scan Service

A standalone Node.js service for handling heavy website scanning operations
including Lighthouse performance audits, comprehensive website scraping,
accessibility scanning, screenshot capture, and OpenAI-powered content analysis.

This service is designed to run as a **RunPod Serverless** endpoint. A thin
Python handler (`handler.py`) uses the official RunPod SDK to receive jobs and
forwards them to the Node.js Express server running inside the same container.
It also works as a standalone Docker container or local Express server.

## Overview

Running the scanner as a separate service lets the main Next.js app offload
heavy, long-running work:

- **Unlimited execution time** for long-running scans
- **Dedicated resources** for CPU/memory intensive operations
- **Better scalability** for concurrent scan requests
- **Isolation** of heavy dependencies (Puppeteer, Lighthouse, Chrome) from the
  main app

## Architecture

```
Next.js App (Vercel)          RunPod Serverless          Firebase
─────────────────────         ───────────────────        ──────────
POST /run                         handler.py              audits/{auditId}
{ action: "startAudit" }    ──▶   forwards to Node.js     pages[]
                                  start background audit  screenshots
                                  upload screenshots        status
                                  run Lighthouse
                                  run axe-core
                                  run AI analysis
```

Because audits can take several minutes, the default `/run` action starts the
work in the background and returns an `auditId`. Poll `GET /audit/:auditId` or
read Firestore to retrieve the completed `AuditResult`.

## Features

### 🚀 Lighthouse Performance Audits
- Performance, accessibility, SEO, and best practices scoring
- Core Web Vitals metrics
- Mobile and desktop testing

### 🔍 Website Scraping & Analysis
- Comprehensive content analysis
- SEO metadata extraction
- Call-to-action and form analysis
- Multi-page scanning support (up to 5 extra pages)

### ♿ Accessibility Scanning
- WCAG 2.1 AA compliance testing via axe-core
- Visual annotation of accessibility issues
- Detailed violation reporting with impact levels
- Screenshot generation with issue markers

### 📸 Screenshot Capture
- Full-page and viewport screenshots
- Mobile and desktop device simulation
- Customizable dimensions

### 🤖 AI Analysis
- GPT-4 powered meta/content analysis
- Title, description, heading, CTA, tone, readability, and intent sections

## API Endpoints

### RunPod-compatible entrypoints

RunPod sends jobs as `POST` requests with a body shaped like:

```json
{
  "input": {
    "action": "startAudit",
    "url": "https://example.com",
    "auditId": "example-com-4r17",
    "pages": ["/about", "/contact"],
    "authorUid": "user-uid",
    "enableAI": true
  }
}
```

| Method | Path | Description |
|---|---|---|
| POST | `/run` | Start or run a job asynchronously |
| POST | `/runsync` | Same as `/run` for compatibility |

Supported `action` values:

- `startAudit` — starts a full audit, returns `{ auditId }`
- `getAudit` — returns the full `AuditResult` for an `auditId`
- `lighthouse` — runs a Lighthouse audit synchronously
- `screenshot` — captures a screenshot synchronously (returns base64 PNG)
- `warmup` — health ping, returns `{ status: "warm" }`

### Standard HTTP routes

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Service health and uptime |
| POST | `/audit/start` | Start a full audit |
| GET | `/audit/:auditId` | Get audit status/results |
| GET | `/audit/:auditId/download` | Download audit JSON file |
| POST/GET | `/lighthouse` | Run Lighthouse |
| GET | `/screenshot` | Capture PNG screenshot |
| GET | `/diagnostic/*` | Browser diagnostics |

### Example response

See [`example-response.json`](./example-response.json) for a complete
`AuditResult` payload returned by `GET /audit/:auditId` or the RunPod
`getAudit` action.

## Installation

### Local development

1. Install dependencies:

```bash
npm install
```

2. Copy the environment example and fill in the values:

```bash
cp .env.example .env
```

3. Start the service:

```bash
npm start
```

The service will run on port `8080` by default.

### Docker

Build the image:

```bash
npm run docker:build
```

Run the container:

```bash
npm run docker:run
```

## Deploying to RunPod

See [`RUNPOD_DEPLOY.md`](./RUNPOD_DEPLOY.md) for full instructions, including:

- Creating the RunPod Serverless endpoint
- Required environment variables
- Building and pushing the Docker image
- Testing the endpoint

Quick summary:

1. Build and push the Docker image:

```bash
docker build -t yourdockeruser/scan-service:v1 .
docker push yourdockeruser/scan-service:v1
```

2. In RunPod, create a Serverless Endpoint using that image, set the container
   port to `8080`, and add the environment variables from `.env.example`.

3. Send a test request:

```bash
curl https://api.runpod.ai/v2/<ENDPOINT_ID>/run \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d @test-input.json
```

## Configuration

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Yes | Firebase service account JSON as a single-line string |
| `OPENAI_API_KEY` | Yes | OpenAI API key for AI analysis |
| `NODE_ENV` | Recommended | `production` in production |
| `PORT` | No | Service port (default: `8080`) |
| `PUPPETEER_EXECUTABLE_PATH` | No | Chrome binary path (default: `/usr/bin/google-chrome-stable` in Docker) |

## Dependencies

### Core
- **express**: Web framework
- **cors**: Cross-origin resource sharing
- **puppeteer-core**: Browser automation
- **lighthouse**: Performance auditing
- **axe-core**: Accessibility rules
- **cheerio**: Server-side HTML parsing
- **axios**: HTTP client
- **sharp**: Image processing
- **openai**: GPT-4 analysis
- **firebase-admin**: Firestore and Storage persistence

### System dependencies (in Docker)
- Google Chrome Stable
- System fonts for proper rendering
- Image processing libraries for Canvas/Sharp

## Monitoring

### Health checks
`GET /health` returns service status and uptime. Use this for RunPod health
probes or local monitoring.

### Logging
Structured console logging covers request handling, audit progress, errors,
and browser lifecycle events.

## Testing

RunPod test input is provided in [`test-input.json`](./test-input.json).

Local quick test:

```bash
# Start the server first
npm start

# Health check
curl http://localhost:8080/health

# Start an audit
curl -X POST http://localhost:8080/run \
  -H "Content-Type: application/json" \
  -d @test-input.json

# Poll for the result
curl http://localhost:8080/audit/example-com-4r17
```

## Performance considerations

- Audits are CPU and memory intensive because they launch Chrome. RunPod
  workers with at least 2 vCPU / 4 GB RAM are recommended.
- Full audits can take minutes. Use the async `startAudit` + polling pattern
  rather than waiting synchronously.
- Browser instances are reused and cleaned up aggressively to avoid memory
  leaks.

## License

This service is part of the AuditWidget.com application.
