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

## Image registry

The default setup uses **GitHub Container Registry (ghcr.io)** because it is
free for both public and private images and uses your existing GitHub account.

Your image will be:

```
ghcr.io/YOUR_GITHUB_USERNAME/scan-service:v1
```

If you prefer **Docker Hub**, replace `ghcr.io/YOUR_GITHUB_USERNAME/scan-service`
with `yourdockerhubuser/scan-service` everywhere below. Note that Docker Hub’s
free plan only includes one private repo; public repos are free and unlimited.

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
3. Push `ghcr.io/YOUR_GITHUB_USERNAME/scan-service:vN` and `:latest`.

You do **not** need to create any Docker Hub credentials. The workflow uses
`GITHUB_TOKEN` automatically.

After the action runs, update your RunPod endpoint to point at the new
versioned tag, e.g.:

```
ghcr.io/YOUR_GITHUB_USERNAME/scan-service:v2
```

### Option B: Manual build/push to ghcr.io

```bash
# Build
docker build -t ghcr.io/YOUR_GITHUB_USERNAME/scan-service:v1 .

# Log in to ghcr.io (uses your GitHub username and a Personal Access Token)
docker login ghcr.io -u YOUR_GITHUB_USERNAME

# Push
docker push ghcr.io/YOUR_GITHUB_USERNAME/scan-service:v1
```

Then in RunPod edit the endpoint and set the image to
`ghcr.io/YOUR_GITHUB_USERNAME/scan-service:v1`.

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
python3 test_handler.py
```

---

## 7. Troubleshooting: "Could not find runpod.serverless.start()"

If RunPod still reports it cannot find `runpod.serverless.start()` when linking
your GitHub repo, it is usually one of these:

1. **GitHub indexing delay** — the error message itself says this. Wait 2–3
   minutes after pushing, then click **Refresh** in RunPod.
2. **Wrong branch** — make sure RunPod is pointing at the branch that contains
   `handler.py` (usually `main`).
3. **RunPod auto-detects a Node.js repo** — because this repo contains
   `package.json`, RunPod may classify it as a Node project and skip Python
   handler scanning. If this happens, use **Custom Template** instead of
   **GitHub Repository**:
   - Build and push the Docker image manually or via GitHub Actions.
   - In RunPod choose **New Endpoint → Custom Template**.
   - Set the image to `ghcr.io/YOUR_GITHUB_USERNAME/scan-service:v1`.
   - Set the container port to `8080`.
   - Add the environment variables above.
   - Save. This path does not require RunPod to scan the repo for a handler.

The Custom Template route is the most reliable deployment path for a
mixed-language repo like this one.
