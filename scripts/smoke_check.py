from __future__ import annotations

import argparse
import json
import sys
from urllib import error, request


def http_get_json(url: str) -> dict:
    req = request.Request(url=url, method="GET")
    with request.urlopen(req, timeout=10) as resp:
        payload = resp.read().decode("utf-8", errors="replace")
        return json.loads(payload)


def http_get_text(url: str) -> str:
    req = request.Request(url=url, method="GET")
    with request.urlopen(req, timeout=10) as resp:
        return resp.read().decode("utf-8", errors="replace")


def http_post_json(url: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url=url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def http_delete(url: str) -> None:
    req = request.Request(url=url, method="DELETE")
    with request.urlopen(req, timeout=10):
        return None


def run(base_url: str) -> None:
    base = base_url.rstrip("/")

    health = http_get_json(f"{base}/health")
    if health.get("status") != "ok":
        raise RuntimeError("health endpoint returned unexpected payload")
    print("[ok] /health")

    homepage = http_get_text(f"{base}/")
    if "<!DOCTYPE html" not in homepage and "<html" not in homepage.lower():
        raise RuntimeError("homepage did not return html content")
    print("[ok] /")

    created = http_post_json(f"{base}/api/jobs", {})
    job_id = str(created.get("job_id", "")).strip()
    if not job_id:
        raise RuntimeError("create job response missing job_id")
    print(f"[ok] POST /api/jobs -> {job_id}")

    job_payload = http_get_json(f"{base}/api/jobs/{job_id}")
    if not isinstance(job_payload.get("job"), dict):
        raise RuntimeError("get job response missing job object")
    print("[ok] GET /api/jobs/{job_id}")

    http_delete(f"{base}/api/jobs/{job_id}")
    print("[ok] DELETE /api/jobs/{job_id}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run lightweight smoke checks")
    parser.add_argument(
        "--base-url", default="http://127.0.0.1:8000", help="Service base URL"
    )
    args = parser.parse_args()

    try:
        run(args.base_url)
    except error.HTTPError as exc:
        print(f"[fail] HTTP {exc.code}: {exc.reason}", file=sys.stderr)
        return 1
    except error.URLError as exc:
        print(f"[fail] URL error: {exc.reason}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"[fail] {exc}", file=sys.stderr)
        return 1

    print("Smoke check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
