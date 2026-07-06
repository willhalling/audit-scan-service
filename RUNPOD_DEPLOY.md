# RunPod Deployment Guide

This service is packaged as a Docker container that can be deployed as a
**RunPod Serverless** endpoint. It exposes the regular HTTP routes (`/audit/*`,
`/lighthouse`, `/screenshot`, `/diagnostic`) plus RunPod-compatible `/run` and
`/runsync` entrypoints.

Because full website audits can take several minutes, the default `/run` action
(`startAudit`) kicks off the audit in the background and returns an `auditId`.
The caller can then poll `GET /audit/:auditId` (or read the result from
Firestore) to get the completed `AuditResult`.

---

## 1. What you need to set up in RunPod

If you haven't created a RunPod Serverless endpoint yet:

1. **Create a RunPod account** at https://www.runpod.io.
2. **Create a Serverless Endpoint**:
   - Go to **Serverless → New Endpoint**.
   - Choose **Custom Template**.
   - Set the **Docker Image** to the image you build/push below, e.g.
     `yourdockeruser/scan-service:v1`.
   - Set the **Container Port** to `8080` (the default `PORT` in the
     `Dockerfile`).
   - Set the **Handler/API Path** to `/` or `/run` if RunPod asks for one.
     The container accepts `POST /run` and `POST /runsync`.
   - Configure **Workers** / **Concurrency** / **GPU/CPU** as needed. This
     service is CPU-based (Puppeteer, Lighthouse, axe-core), so a CPU
     worker with at least 2 vCPU and 4 GB RAM is a good starting point.
   - Set an **Execution Timeout** long enough for your audits (e.g. 300–600s).
     Note that `/runsync` has a RunPod platform limit of ~90s, so use `/run`
     plus polling for long audits.
3. **Add environment variables** (see below).
4. **Save** the endpoint. RunPod will pull the image on the first request.

---

## 2. Required environment variables

In RunPod → your endpoint → **Variables**, add:

| Variable | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Full Firebase service-account JSON as a single-line string. Used to write audit results to Firestore and upload screenshots to Storage. |
| `OPENAI_API_KEY` | Required for AI analysis (`enableAI: true`). |
| `NODE_ENV` | Set to `production`. |
| `PORT` | `8080` (must match the Container Port you configured). |

Optional:

| Variable | Purpose |
|---|---|
| `PUPPETEER_EXECUTABLE_PATH` | Defaults to `/usr/bin/google-chrome-stable` in the Docker image. You normally do not need to override this. |

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

### Health check

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
npm run docker:build
npm run docker:run
```

Then test locally:

```bash
curl http://localhost:8080/health
curl -X POST http://localhost:8080/run -H "Content-Type: application/json" -d @test-input.json
```
