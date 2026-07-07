#!/usr/bin/env python3
"""
Local test harness for the RunPod handler.

It starts the Node.js server in-process (via handler.py) and sends a warmup
ping and a startAudit job, then prints the responses.

Usage:
    python3 test_handler.py

Make sure you have a valid .env file with FIREBASE_SERVICE_ACCOUNT and
OPENAI_API_KEY, or the Node.js server will fail to start.
"""
from __future__ import annotations

import json
import os
import sys
import types

# Stub runpod so we can import handler.py without installing the SDK.
if "runpod" not in sys.modules:
    _runpod_stub = types.ModuleType("runpod")
    _runpod_stub.serverless = types.SimpleNamespace(start=lambda *a, **k: None)
    sys.modules["runpod"] = _runpod_stub

import handler  # noqa: E402


def main() -> None:
    # Warmup
    warmup_event = {"input": {"warmup": True}}
    print("WARMUP:", json.dumps(handler.handler(warmup_event), indent=2))

    # startAudit (will fail without FIREBASE_SERVICE_ACCOUNT)
    audit_event = {
        "input": {
            "action": "startAudit",
            "url": "https://example.com",
            "auditId": "test-audit-1234",
            "pages": ["/about"],
            "enableAI": False,
        }
    }
    print("START AUDIT:", json.dumps(handler.handler(audit_event), indent=2))


if __name__ == "__main__":
    main()
