"""
RunPod Serverless handler for the Node.js audit scan service.

RunPod's Python SDK handles the job queue. This wrapper:
1. Starts the Node.js Express server as a child process.
2. Waits for /health to become ready.
3. Forwards each RunPod job to http://localhost:PORT/run.
4. Returns the JSON response back to RunPod.

Expected input (RunPod passes this as event["input"]):

    {
        "action": "startAudit",
        "url": "https://example.com",
        "auditId": "example-com-4r17",
        "pages": ["/about", "/contact"],
        "authorUid": "user-uid-optional",
        "enableAI": true
    }

Supported actions mirror the Node.js /run endpoint:
    - startAudit   -> { auditId }
    - getAudit     -> full AuditResult
    - lighthouse   -> LighthouseResult
    - screenshot   -> { imageBase64, contentType, size }
    - warmup       -> { status: "warm" }

Because full website audits can take several minutes, startAudit begins the
work in the background and immediately returns an auditId. Poll getAudit (or
check Firestore) to retrieve the completed result.
"""
from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import sys
import time
import traceback
from typing import Any

import requests
import runpod

log = logging.getLogger("handler")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(message)s",
)

# Configuration
PORT = int(os.getenv("PORT", "8080"))
HEALTH_URL = f"http://127.0.0.1:{PORT}/health"
RUN_URL = f"http://127.0.0.1:{PORT}/run"
NODE_CMD = ["node", "dist/index.js"]

# Global reference to the Node.js child process
_node_process: subprocess.Popen | None = None


def _start_node_server() -> subprocess.Popen:
    """Start the Node.js Express server as a child process."""
    global _node_process

    if _node_process is not None and _node_process.poll() is None:
        log.info("Node.js server already running (pid=%s)", _node_process.pid)
        return _node_process

    log.info("Starting Node.js server: %s", " ".join(NODE_CMD))
    env = os.environ.copy()
    env["PORT"] = str(PORT)

    _node_process = subprocess.Popen(
        NODE_CMD,
        cwd="/app",
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    # Stream Node.js logs in a background thread so they appear in RunPod logs
    def _stream_logs():
        try:
            for line in _node_process.stdout:  # type: ignore
                if line:
                    print(line.rstrip())
        except Exception:
            pass

    import threading
    threading.Thread(target=_stream_logs, daemon=True).start()

    log.info("Node.js server started (pid=%s)", _node_process.pid)
    return _node_process


def _wait_for_health(timeout: float = 120.0) -> bool:
    """Poll the Node.js /health endpoint until it responds."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            response = requests.get(HEALTH_URL, timeout=5)
            if response.status_code == 200:
                log.info("Node.js /health ready: %s", response.text[:200])
                return True
        except requests.RequestException:
            pass
        time.sleep(0.5)
    return False


def _ensure_server_running() -> bool:
    """Start the Node.js server if it isn't already up and healthy."""
    global _node_process

    if _node_process is None or _node_process.poll() is not None:
        _node_process = _start_node_server()
        if not _wait_for_health():
            log.error("Node.js server failed to become healthy")
            return False
    return True


def handler(event: dict) -> Any:
    """RunPod serverless entrypoint."""
    job_input = (event or {}).get("input") or {}

    # Warmup ping — just return immediately to keep the worker alive.
    if job_input.get("warmup"):
        return {"status": "warm"}

    if not _ensure_server_running():
        return {"error": "Node.js server failed to start"}

    try:
        log.info("Forwarding job to Node.js: %s", json.dumps(job_input)[:500])
        response = requests.post(
            RUN_URL,
            json=event,
            headers={"Content-Type": "application/json"},
            timeout=3600,
        )
        response.raise_for_status()
        result = response.json()
        log.info("Node.js response: %s", json.dumps(result)[:500])
        return result
    except requests.HTTPError as e:
        log.error("HTTP error from Node.js: %s", e)
        try:
            return e.response.json()
        except Exception:
            return {"error": f"HTTP {e.response.status_code}", "message": str(e)}
    except Exception as e:
        log.error("Handler failed: %s\n%s", e, traceback.format_exc())
        return {"error": str(e)[:500]}


def _shutdown(signum, frame):
    """Gracefully terminate the Node.js child process on shutdown."""
    log.info("Received signal %s, shutting down Node.js server", signum)
    if _node_process is not None:
        try:
            _node_process.terminate()
            _node_process.wait(timeout=5)
        except Exception:
            try:
                _node_process.kill()
            except Exception:
                pass
    sys.exit(0)


signal.signal(signal.SIGTERM, _shutdown)
signal.signal(signal.SIGINT, _shutdown)

if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
