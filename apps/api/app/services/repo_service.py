import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from ..config import (
    ALLOWED_EXTS,
    GIT_HTTP_PROXY,
    GIT_HTTPS_PROXY,
    MAX_FILE_BYTES,
    MAX_FILES,
    GIT_CLONE_RETRIES,
    GIT_CLONE_TIMEOUT_SEC,
    GIT_SSL_NO_VERIFY,
    MAX_TOTAL_BYTES,
    SENSITIVE_PATTERNS,
    SKIP_DIRS,
)
from .paths import is_drive_root, normalize_local_path


PROJECT_MARKERS = {
    ".git",
    "pyproject.toml",
    "package.json",
    "pom.xml",
    "go.mod",
    "Cargo.toml",
    "requirements.txt",
}


def _is_sensitive(name: str) -> bool:
    lowered = name.lower()
    return any(p in lowered for p in SENSITIVE_PATTERNS)


def _safe_walk(base: Path):
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        yield Path(root), files


def validate_local_path(path_str: str, force_confirm: bool = False) -> dict[str, Any]:
    p = normalize_local_path(path_str)
    if not p.exists() or not p.is_dir():
        raise ValueError("Local path must exist and be a directory")
    if is_drive_root(p):
        raise ValueError("Drive root is not allowed")

    has_marker = any((p / marker).exists() for marker in PROJECT_MARKERS)

    file_count = 0
    total_bytes = 0
    for root, files in _safe_walk(p):
        for f in files:
            file_count += 1
            fp = root / f
            try:
                total_bytes += fp.stat().st_size
            except OSError:
                continue
            if file_count > MAX_FILES or total_bytes > MAX_TOTAL_BYTES:
                break

    needs_confirmation = not has_marker and not force_confirm
    return {
        "path": str(p),
        "has_project_marker": has_marker,
        "file_count": file_count,
        "total_bytes": total_bytes,
        "needs_confirmation": needs_confirmation,
    }


def clone_repo(git_url: str, target_dir: Path, branch: str | None = None) -> None:
    args = ["git", "-c", "http.version=HTTP/1.1"]
    if GIT_HTTP_PROXY:
        args.extend(["-c", f"http.proxy={GIT_HTTP_PROXY}"])
    if GIT_HTTPS_PROXY:
        args.extend(["-c", f"https.proxy={GIT_HTTPS_PROXY}"])
    if GIT_SSL_NO_VERIFY:
        args.extend(["-c", "http.sslVerify=false"])

    args.extend(["clone", "--depth", "1"])
    if branch:
        args.extend(["--branch", branch])
    args.extend([git_url, str(target_dir)])

    env = os.environ.copy()
    if GIT_HTTP_PROXY and "HTTP_PROXY" not in env:
        env["HTTP_PROXY"] = GIT_HTTP_PROXY
    if GIT_HTTPS_PROXY and "HTTPS_PROXY" not in env:
        env["HTTPS_PROXY"] = GIT_HTTPS_PROXY

    last_error: Exception | None = None
    for attempt in range(1, GIT_CLONE_RETRIES + 1):
        try:
            subprocess.run(
                args,
                check=True,
                capture_output=True,
                text=True,
                timeout=GIT_CLONE_TIMEOUT_SEC,
                env=env,
            )
            return
        except subprocess.TimeoutExpired as exc:
            last_error = exc
        except subprocess.CalledProcessError as exc:
            last_error = exc

        if target_dir.exists():
            for _ in range(3):
                try:
                    shutil.rmtree(target_dir, ignore_errors=True)
                    break
                except OSError:
                    time.sleep(0.5)

        if attempt < GIT_CLONE_RETRIES:
            time.sleep(min(2 * attempt, 6))

    if isinstance(last_error, subprocess.TimeoutExpired):
        raise RuntimeError(
            "git clone timed out. Check network/proxy and retry, "
            "or use local_path mode with an already downloaded repo."
        ) from last_error

    if isinstance(last_error, subprocess.CalledProcessError):
        detail = (last_error.stderr or last_error.stdout or "").strip()
        detail_lower = detail.lower()
        if (
            "could not connect to server" in detail_lower
            or "recv failure" in detail_lower
            or "failed to connect" in detail_lower
            or "connection timed out" in detail_lower
            or "proxy" in detail_lower
            or "ssl" in detail_lower
        ):
            raise RuntimeError(
                "cannot clone from github.com (network/proxy/ssl issue). "
                "Check apps/api/.env proxy settings (GIT_HTTP_PROXY/GIT_HTTPS_PROXY), "
                "then retry, or use local_path mode. "
                f"git detail: {detail or 'unknown'}"
            ) from last_error
        raise RuntimeError(
            f"git clone failed: {detail or 'unknown error'}"
        ) from last_error

    raise RuntimeError("git clone failed with unknown error")


def build_repo_index(source_dir: Path, index_dir: Path) -> dict[str, Any]:
    index_dir.mkdir(parents=True, exist_ok=True)
    tree_items: list[dict[str, Any]] = []
    digest_lines: list[str] = ["# Repo Digest", ""]

    scanned_files = 0
    indexed_files = 0
    total_bytes = 0
    code_chunks: list[dict[str, Any]] = []

    for root, files in _safe_walk(source_dir):
        for file_name in files:
            scanned_files += 1
            rel = (root / file_name).relative_to(source_dir)
            suffix = rel.suffix.lower()
            if _is_sensitive(file_name):
                continue

            fp = root / file_name
            try:
                size = fp.stat().st_size
            except OSError:
                continue

            total_bytes += size
            tree_items.append({"path": str(rel).replace("\\", "/"), "size": size})

            if suffix not in ALLOWED_EXTS or size > MAX_FILE_BYTES:
                continue
            try:
                content = fp.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue

            indexed_files += 1
            snippet = content[:3000]
            digest_lines.append(f"## {rel.as_posix()}")
            digest_lines.append("")
            digest_lines.append("```text")
            digest_lines.append(snippet)
            digest_lines.append("```")
            digest_lines.append("")

            code_chunks.append(
                {
                    "source": rel.as_posix(),
                    "content": content[:12000],
                }
            )

    tree_path = index_dir / "repo_tree.json"
    digest_path = index_dir / "repo_digest.md"
    chunks_path = index_dir / "chunks.jsonl"

    tree_path.write_text(
        json.dumps(tree_items, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    digest_path.write_text("\n".join(digest_lines), encoding="utf-8")
    with chunks_path.open("w", encoding="utf-8") as f:
        for chunk in code_chunks:
            f.write(json.dumps(chunk, ensure_ascii=False) + "\n")

    return {
        "scanned_files": scanned_files,
        "indexed_files": indexed_files,
        "total_bytes": total_bytes,
        "tree_path": str(tree_path),
        "digest_path": str(digest_path),
        "chunks_path": str(chunks_path),
    }
