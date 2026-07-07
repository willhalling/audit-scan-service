# RunPod Deployment Guide

This service is packaged as a Docker container that can be deployed as a
**RunPod Serverless** endpoint. It uses RunPod's official Python SDK (`handler.py`)
to receive jobs from the queue. The Python handler starts the Node.js Express
server inside the container and forwards each job to it.

Because full website audits can take several minutes, the default `startAudit`
action kicks off the audit in the background and immediately returns an
`auditId`. The caller can then poll the `getAudit` action (or check Firestore)
to get the completed `AuditResult`.

---

## 1. What you need to set up in RunPod

If you haven't created a RunPod Serverless endpoint yet:

1. **Create a RunPod account** at https://www.runpod.io.
2. **Create a Serverless Endpoint**:
   - Go to **Serverless → New Endpoint**.
   - Choose **GitHub Repository** or **Custom Template**.
   - If linking the GitHub repo, RunPod will look for `handler.py` and
     `runpod.serverless.start()` — both are now included.
   - Select the repository and branch (`main`).
   - RunPod will use the `Dockerfile` at the repo root.
3. **Add environment variables** (see below).
4. Save the endpoint. RunPod will build the image and start workers.

---

## 2. Required environment variables

In RunPod → your endpoint → **Variables**, add:

| Variable | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Full Firebase service-account JSON as a single-line string. Used to write audit results to Firestore and upload screenshots to Storage. |
| `OPENAI_API_KEY` | Required for AI analysis (`enableAI: true`). |
| `NODE_ENV` | Set to `production`. |
| `PORT` | `8080` (the port the internal Node.js server listens on). |

Optional:

| Variable | Purpose |
|---|---|
| `PUPPETEER_EXECUTABLE_PATH` | Defaults to `/usr/bin/google-chrome-stable` in the Docker image. You normally do not need to override this. |
| `LOG_LEVEL` | `INFO` or `DEBUG`. |

---

## 3. Build and push the Docker image

### Option A: GitHub Actions (recommended)

The repo includes `.github/workflows/docker-publish.yml`. On every push to
`main` it will:

1. Compute the next `vN` git tag.
2. Build the Docker image.
3. Push `yourdockeruser/scan-service:vN` and `:latest` to Docker Hub.

Before using it:

- Replace `yourdockeruser/scan-service` in the workflow with your Docker Hub
  username/image name.
- Add `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` as repository secrets in
  GitHub.

After the action runs, update your RunPod endpoint to point at the new
versioned tag (e.g. `yourdockeruser/scan-service:v2`).

### Option B: Manual build/push

```bash
# Build
docker build -t yourdockeruser/scan-service:v1 .

# Push (make sure you are logged in with `docker login`)
docker push yourdockeruser/scan-service:v1
```

Then in RunPod edit the endpoint and set the image to
`yourdockeruser/scan-service:v1`.

> **Tip:** Always use a versioned tag (`:v1`, `:v2`) instead of `:latest` when
> updating the RunPod endpoint. Changing the tag is what guarantees RunPod
> pulls the new image on the next cold start.

---

## 4. Test the endpoint

### Health / warmup

```bash
curl https://api.runpod.ai/v2/<ENDPOINT_ID>/run \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"action":"warmup"}}'
```

Expected response:

```json
{"output":{"status":"warm"}}
```

### Start an audit

```bash
curl https://api.runpod.ai/v2/<ENDPOINT_ID>/run \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d @test-input.json
```

Expected response:

```json
{"output":{"auditId":"example-com-4r17"}}
```

### Poll for the result

```bash
curl https://api.runpod.ai/v2/<ENDPOINT_ID>/run \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"action":"getAudit","auditId":"example-com-4r17"}}'
```

When completed this returns the full `AuditResult` JSON (see
`example-response.json`).

---

## 5. Rollback

To roll back, edit the RunPod endpoint and set the image tag back to the
previous version (e.g. `v1`). No rebuild is needed.

---

## 6. Local testing

Run the container locally with your `.env` file:

```bash
docker build -t scan-service .
docker run -p 8080:8080 --env-file .env scan-service
```

Then test locally:

```bash
curl http://localhost:8080/health
curl -X POST http://localhost:8080/run -H "Content-Type: application/json" -d @test-input.json
```

Or test the Python handler directly:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-runpod.txt
python3 handler.py
```
