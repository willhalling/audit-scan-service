"""
RunPod Serverless handler for the Node.js audit scan service.

RunPod's Python SDK handles the job queue. This wrapper:
1. Starts the Node.js Express server as a child process.
2. Waits for /health to become ready.
3. Forwards each RunPod job to http://localhost:PORT/run.
4. Returns the JSON response back to RunPod.

Because website audits can take several minutes, startAudit begins the work in
the background and immediately returns an auditId. Poll getAudit (or check
Firestore) to retrieve the completed result.
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

# Force immediate log flushing so RunPod captures everything.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
    force=True,
)
log = logging.getLogger("handler")

PORT = int(os.getenv("PORT", "8080"))
HEALTH_URL = f"http://127.0.0.1:{PORT}/health"
RUN_URL = f"http://127.0.0.1:{PORT}/run"
NODE_CMD = ["node", "dist/index.js"]

_node_process: subprocess.Popen | None = None


def _log(message: str) -> None:
    """Print and flush immediately so RunPod logs are realtime."""
    print(message, flush=True)
    log.info(message)


def _start_node_server() -> subprocess.Popen:
    """Start the Node.js Express server as a child process."""
    global _node_process

    if _node_process is not None and _node_process.poll() is None:
        _log(f"Node.js server already running (pid={_node_process.pid})")
        return _node_process

    _log(f"Starting Node.js server: {' '.join(NODE_CMD)}")
    env = os.environ.copy()
    env["PORT"] = str(PORT)

    _node_process = subprocess.Popen(
        NODE_CMD,
        cwd="/app",
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    def _stream(stream, label: str):
        try:
            for line in stream:
                if line:
                    _log(f"[{label}] {line.rstrip()}")
        except Exception as e:
            _log(f"[{label}] stream closed: {e}")

    import threading
    threading.Thread(target=_stream, args=(_node_process.stdout, "node"), daemon=True).start()
    threading.Thread(target=_stream, args=(_node_process.stderr, "node-err"), daemon=True).start()

    _log(f"Node.js server started (pid={_node_process.pid})")
    return _node_process


def _wait_for_health(timeout: float = 120.0) -> bool:
    """Poll the Node.js /health endpoint until it responds."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            response = requests.get(HEALTH_URL, timeout=5)
            if response.status_code == 200:
                _log(f"Node.js /health ready: {response.text[:200]}")
                return True
        except requests.RequestException as e:
            _log(f"Health check not ready yet: {e}")
        time.sleep(1.0)
    _log("Node.js /health never became ready")
    return False


def _ensure_server_running() -> bool:
    """Start the Node.js server if it isn't already up and healthy."""
    global _node_process

    if _node_process is None or _node_process.poll() is not None:
        _node_process = _start_node_server()
        if not _wait_for_health():
            _log("ERROR: Node.js server failed to become healthy")
            return False
    return True


def handler(event: dict) -> Any:
    """RunPod serverless entrypoint."""
    _log(f"HANDLER CALLED: {json.dumps(event)[:500]}")

    job_input = (event or {}).get("input") or {}

    if job_input.get("warmup"):
        _log("Warmup requested")
        return {"status": "warm"}

    if not _ensure_server_running():
        return {"error": "Node.js server failed to start"}

    try:
        _log(f"Forwarding job to Node.js: {json.dumps(job_input)[:500]}")
        response = requests.post(
            RUN_URL,
            json=event,
            headers={"Content-Type": "application/json"},
            timeout=3600,
        )
        _log(f"Node.js responded with HTTP {response.status_code}")
        response.raise_for_status()
        result = response.json()
        _log(f"Node.js result: {json.dumps(result)[:500]}")
        return result
    except requests.HTTPError as e:
        _log(f"HTTP error from Node.js: {e}")
        try:
            return e.response.json()
        except Exception:
            return {"error": f"HTTP {e.response.status_code}", "message": str(e)}
    except Exception as e:
        _log(f"Handler failed: {e}\n{traceback.format_exc()}")
        return {"error": str(e)[:500]}


def _shutdown(signum, frame):
    _log(f"Received signal {signum}, shutting down Node.js server")
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
    _log("Starting RunPod serverless handler")
    runpod.serverless.start({"handler": handler})
