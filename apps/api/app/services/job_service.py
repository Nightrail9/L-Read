import json
import re
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from .. import db
from ..config import (
    JOBS_DIR,
    MAX_JOB_CONCURRENCY,
    MINERU_DOWNLOAD_RETRIES,
    MINERU_SKIP_SSL_VERIFY,
    MINERU_TOKEN,
)
from .llm_service import run_text, run_vision
from .mineru_service import MinerUService
from .prompt_service import load_prompt_modules
from .repo_service import build_repo_index, clone_repo, validate_local_path


MODULE_FILE_MAP = {
    "module_02": "框架图解读.md",
    "module_03": "公式讲解.md",
    "module_04": "代码精读.md",
    "module_05": "导师模拟提问.md",
}

MODULE_PROMPT_KEY_MAP = {
    "module_02": "framework_prompt",
    "module_03": "formula_prompt",
    "module_04": "code_prompt",
    "module_05": "mentor_prompt",
}

MODULE_LABEL_MAP = {
    "module_02": "框架图解读",
    "module_03": "公式讲解",
    "module_04": "代码精读",
    "module_05": "导师模拟提问",
}

MODULE_SEQUENCE = ["module_02", "module_03", "module_04", "module_05"]
PARALLEL_MODULES = ["module_02", "module_03", "module_04"]


def _looks_like_placeholder_secret(value: str) -> bool:
    raw = str(value or "").strip().lower()
    if not raw:
        return True
    placeholders = {
        "replace_with_your_mineru_token",
        "replace_with_your_openai_key",
        "your_mineru_token",
        "your_openai_key",
        "changeme",
    }
    if raw in placeholders:
        return True
    return raw.startswith("replace_with_") or raw.startswith("your_")


def _normalize_git_url(git_url: str) -> str:
    normalized = str(git_url or "").strip()
    if not normalized:
        return normalized

    if normalized.startswith(("https://github.com/", "http://github.com/")):
        normalized = normalized.rstrip("/")
        if not normalized.endswith(".git"):
            normalized = f"{normalized}.git"
        return normalized

    if normalized.startswith("git@github.com:"):
        normalized = normalized.rstrip("/")
        if not normalized.endswith(".git"):
            normalized = f"{normalized}.git"
        return normalized

    return normalized


def new_job() -> str:
    prefix = datetime.now().strftime("%Y%m%d%H%M")
    seq = 1
    while True:
        job_id = f"{prefix}-{seq:02d}"
        if not (JOBS_DIR / job_id).exists():
            break
        seq += 1
    job_dir = JOBS_DIR / job_id
    (job_dir / "paper").mkdir(parents=True, exist_ok=True)
    (job_dir / "repo").mkdir(parents=True, exist_ok=True)
    (job_dir / "outputs").mkdir(parents=True, exist_ok=True)
    (job_dir / "logs").mkdir(parents=True, exist_ok=True)
    db.create_job(job_id)
    return job_id


def get_job_dir(job_id: str) -> Path:
    job = db.get_job(job_id) or {}
    pdf_path = (job.get("pdf_path") or "").strip()
    if pdf_path:
        return Path(pdf_path).resolve().parents[1]
    return JOBS_DIR / job_id


def _safe_folder_name_from_filename(filename: str) -> str:
    stem = Path(filename).stem.strip()
    if not stem:
        stem = "untitled"
    stem = re.sub(r"[\\/:*?\"<>|]", "_", stem)
    stem = re.sub(r"\s+", " ", stem).strip().rstrip(".")
    return stem or "untitled"


def prepare_job_dir_for_pdf(job_id: str, filename: str) -> Path:
    current_dir = get_job_dir(job_id)
    folder_name = _safe_folder_name_from_filename(filename)
    desired_dir = JOBS_DIR / folder_name

    if desired_dir != current_dir:
        candidate = desired_dir
        seq = 2
        while candidate.exists() and candidate.resolve() != current_dir.resolve():
            candidate = JOBS_DIR / f"{folder_name}-{seq}"
            seq += 1
        desired_dir = candidate

        if current_dir.exists() and current_dir.resolve() != desired_dir.resolve():
            shutil.move(str(current_dir), str(desired_dir))

    for rel in ["paper", "repo", "outputs", "logs"]:
        (desired_dir / rel).mkdir(parents=True, exist_ok=True)
    return desired_dir


def delete_job(job_id: str) -> bool:
    job_dir = get_job_dir(job_id)
    removed = db.delete_job(job_id)
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)
        return True
    return removed


def set_repo(job_id: str, payload: dict) -> dict:
    job_dir = get_job_dir(job_id)
    repo_dir = job_dir / "repo"

    if payload["type"] == "git":
        git_url = _normalize_git_url(payload.get("git_url") or "")
        if not git_url:
            raise ValueError("git_url is required")
        checkout = repo_dir / "checkout"
        if checkout.exists():
            shutil.rmtree(checkout, ignore_errors=True)
        clone_repo(git_url=git_url, target_dir=checkout, branch=payload.get("branch"))
        meta = {
            "type": "git",
            "git_url": git_url,
            "branch": payload.get("branch"),
            "path": str(checkout),
        }

    elif payload["type"] == "local_path":
        path = payload.get("path")
        if not path:
            raise ValueError("path is required for local_path")
        check = validate_local_path(
            path, force_confirm=bool(payload.get("force_confirm"))
        )
        meta = {"type": "local_path", **check}
        pointer = repo_dir / "pointer.json"
        pointer.write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    else:
        raise ValueError("unsupported repo type")

    db.update_job(job_id, repo_type=payload["type"], repo_meta_json=meta)
    return meta


def run_extract(job_id: str) -> dict:
    job = db.get_job(job_id)
    if not job:
        raise ValueError("job not found")
    pdf_path = job.get("pdf_path")
    if not pdf_path:
        raise ValueError("upload PDF first")
    if _looks_like_placeholder_secret(MINERU_TOKEN):
        raise ValueError(
            "MINERU_TOKEN is missing or still a placeholder. "
            "Set a valid token in apps/api/.env and restart the backend."
        )

    db.upsert_task(job_id, "extract_pdf", "running")
    print(f"[任务 {job_id}] 开始提取文献")
    out_dir = get_job_dir(job_id) / "paper" / "extracted"
    service = MinerUService(
        MINERU_TOKEN,
        verify_ssl=not MINERU_SKIP_SSL_VERIFY,
        download_retries=MINERU_DOWNLOAD_RETRIES,
    )
    result = service.extract_pdf(Path(pdf_path), out_dir)

    db.add_artifact(job_id, "markdown", result["markdown_path"], {"kind": "paper_md"})
    for img in Path(result["images_dir"]).glob("*"):
        if img.is_file():
            db.add_artifact(job_id, "image", str(img), {})
    db.upsert_task(job_id, "extract_pdf", "done")
    print(f"[任务 {job_id}] 文献提取完成")
    return result


def run_index(job_id: str) -> dict:
    job = db.get_job(job_id)
    if not job:
        raise ValueError("job not found")

    db.upsert_task(job_id, "prepare_repo", "running")
    print(f"[任务 {job_id}] 开始构建仓库索引")
    repo_meta = job.get("repo_meta_json") or {}
    repo_type = repo_meta.get("type")
    if repo_type in {"git", "local_path"}:
        source_dir = Path(repo_meta["path"])
    else:
        raise ValueError("repo is not configured")

    index_dir = get_job_dir(job_id) / "repo" / "index"
    result = build_repo_index(source_dir, index_dir)
    db.add_artifact(job_id, "json", result["tree_path"], {"kind": "repo_tree"})
    db.add_artifact(job_id, "markdown", result["digest_path"], {"kind": "repo_digest"})
    db.add_artifact(job_id, "jsonl", result["chunks_path"], {"kind": "repo_chunks"})
    db.upsert_task(job_id, "prepare_repo", "done")
    print(f"[任务 {job_id}] 仓库索引完成")
    return result


def _load_text(path: Path, max_len: int = 50000) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")[:max_len]


def _module_prompt(
    module_text: str,
    paper_md: str,
    repo_digest: str,
    selections: dict,
    prev_outputs: str,
) -> str:
    selection_text = json.dumps(selections, ensure_ascii=False)
    return (
        f"{module_text}\n\n"
        "# 上下文\n"
        "## 论文抽取内容\n"
        f"{paper_md}\n\n"
        "## 代码仓库摘要\n"
        f"{repo_digest}\n\n"
        "## 用户选择\n"
        f"{selection_text}\n\n"
        "## 先前模块产物（如有）\n"
        f"{prev_outputs}\n"
    )


def _looks_like_timeout_error(exc: Exception) -> bool:
    text = str(exc).strip().lower()
    if not text:
        return False
    markers = (
        "timed out",
        "read timeout",
        "timeout",
        "gateway timeout",
    )
    return any(marker in text for marker in markers)


def _output_exists(outputs_dir: Path, module_key: str) -> bool:
    out_path = _resolve_output_path(outputs_dir, module_key)
    return out_path.exists() and out_path.is_file()


def _resolve_output_path(outputs_dir: Path, module_key: str) -> Path:
    return outputs_dir / MODULE_FILE_MAP[module_key]


def _resolve_modules_to_run(
    job_id: str,
    outputs_dir: Path,
    mode: str,
    module_key: str | None,
) -> tuple[list[str], list[str]]:
    if mode == "all":
        return MODULE_SEQUENCE[:], []

    if mode == "single":
        if not module_key:
            raise ValueError("single 模式必须指定 module")
        if module_key not in MODULE_FILE_MAP:
            raise ValueError(f"不支持的模块: {module_key}")
        preserved = [
            key
            for key in MODULE_SEQUENCE
            if key != module_key and _output_exists(outputs_dir, key)
        ]
        return [module_key], preserved

    if mode != "retry_failed":
        raise ValueError(f"不支持的运行模式: {mode}")

    task_rows = db.list_tasks(job_id)
    status_by_name = {
        str(row.get("name") or ""): str(row.get("status") or "") for row in task_rows
    }
    to_run: list[str] = []
    preserved: list[str] = []

    for key in MODULE_SEQUENCE:
        task_status = status_by_name.get(key, "")
        has_output = _output_exists(outputs_dir, key)
        if task_status == "failed":
            to_run.append(key)
            continue
        if has_output:
            preserved.append(key)
            continue
        to_run.append(key)

    return to_run, preserved


def _ensure_generation_stage_ready(job_id: str, job_dir: Path) -> None:
    paper_md_path = job_dir / "paper" / "extracted" / "paper.md"
    if not paper_md_path.exists() or not paper_md_path.is_file():
        raise ValueError("文献提取阶段尚未完成，无法执行生成模块")

    job = db.get_job(job_id) or {}
    repo_type = str(job.get("repo_type") or "").strip()
    if not repo_type:
        return

    digest_path = job_dir / "repo" / "index" / "repo_digest.md"
    if digest_path.exists() and digest_path.is_file():
        return

    task_rows = db.list_tasks(job_id)
    prep_task = next(
        (row for row in task_rows if str(row.get("name") or "") == "prepare_repo"), None
    )
    if not prep_task or str(prep_task.get("status") or "") != "done":
        raise ValueError("仓库索引阶段尚未完成，无法执行生成模块")


def run_modules(
    job_id: str,
    mode: str = "retry_failed",
    module_key: str | None = None,
) -> dict:
    print(f"[任务 {job_id}] 开始执行分析模块")
    modules = load_prompt_modules()
    if "global_prompt" not in modules:
        raise ValueError("全局提示词缺失（global_prompt）")

    global_prompt = modules["global_prompt"]
    job_dir = get_job_dir(job_id)
    paper_md = _load_text(job_dir / "paper" / "extracted" / "paper.md")
    repo_digest = _load_text(job_dir / "repo" / "index" / "repo_digest.md")
    selections = db.get_selections(job_id)
    llm_config = (db.get_job(job_id) or {}).get("llm_config_json") or {}

    outputs_dir = job_dir / "outputs"
    outputs_dir.mkdir(parents=True, exist_ok=True)
    _ensure_generation_stage_ready(job_id, job_dir)

    modules_to_run, preserved = _resolve_modules_to_run(
        job_id, outputs_dir, mode, module_key
    )
    if not modules_to_run:
        print(f"[任务 {job_id}] 无需重跑模块，保留既有产物")
        return {
            "mode": mode,
            "results": {},
            "succeeded": [],
            "failed": {},
            "skipped": {},
            "retried": [],
            "preserved": sorted(preserved),
        }

    def run_one(module_key: str) -> tuple[str, dict]:
        module_label = MODULE_LABEL_MAP.get(module_key, module_key)
        db.upsert_task(job_id, module_key, "running")
        print(f"[任务 {job_id}] 模块开始: {module_label} ({module_key})")
        try:
            module_prompt_key = MODULE_PROMPT_KEY_MAP[module_key]
            module_prompt = modules.get(module_prompt_key, "")
            prev_outputs = ""
            if module_key == "module_05":
                for dep in ["module_02", "module_03", "module_04"]:
                    path = _resolve_output_path(outputs_dir, dep)
                    if path.exists():
                        dep_label = MODULE_LABEL_MAP.get(dep, dep)
                        prev_outputs += (
                            f"\n\n# {dep_label} ({dep})\n{_load_text(path, 30000)}"
                        )

            user_prompt = _module_prompt(
                module_prompt, paper_md, repo_digest, selections, prev_outputs
            )

            image_paths: list[Path] = []
            if module_key == "module_02":
                image = selections.get("architecture_image")
                if image:
                    image_paths.append(Path(image))
            if module_key == "module_03":
                for image in selections.get("formula_images", []):
                    image_paths.append(Path(image))

            if image_paths:
                content, usage = run_vision(
                    global_prompt,
                    user_prompt,
                    image_paths,
                    llm_config=llm_config,
                )
            else:
                try:
                    content, usage = run_text(
                        global_prompt,
                        user_prompt,
                        llm_config=llm_config,
                    )
                except Exception as first_exc:
                    if module_key != "module_04" or not _looks_like_timeout_error(
                        first_exc
                    ):
                        raise

                    print(f"[任务 {job_id}] 模块重试: {module_key} (缩短上下文后重试)")
                    compact_prompt = _module_prompt(
                        module_prompt,
                        paper_md[:30000],
                        repo_digest[:20000],
                        selections,
                        prev_outputs[:20000],
                    )
                    content, usage = run_text(
                        global_prompt,
                        compact_prompt,
                        llm_config=llm_config,
                    )

            out_name = MODULE_FILE_MAP[module_key]
            out_path = outputs_dir / out_name
            out_path.write_text(content, encoding="utf-8")
            db.upsert_output(
                job_id,
                module_key,
                str(out_path),
                "done",
                {"usage": usage, "provider": usage.get("provider", "gpt")},
            )
            db.upsert_task(job_id, module_key, "done")
            print(f"[任务 {job_id}] 模块完成: {module_label} ({module_key})")
            return module_key, {"path": str(out_path), "usage": usage}
        except Exception as exc:
            db.upsert_task(job_id, module_key, "failed", str(exc))
            print(f"[任务 {job_id}] 模块失败: {module_label} ({module_key}): {exc}")
            raise

    results: dict[str, dict] = {}
    failed: dict[str, str] = {}
    skipped: dict[str, str] = {}
    parallel_targets = [key for key in PARALLEL_MODULES if key in modules_to_run]
    if parallel_targets:
        with ThreadPoolExecutor(max_workers=MAX_JOB_CONCURRENCY) as executor:
            futures = {executor.submit(run_one, m): m for m in parallel_targets}
            for fut in as_completed(futures):
                fut_module_key = futures[fut]
                try:
                    key, payload = fut.result()
                    results[key] = payload
                except Exception as exc:
                    failed[fut_module_key] = str(exc)

    if "module_05" in modules_to_run:
        try:
            key, payload = run_one("module_05")
            results[key] = payload
        except Exception as exc:
            failed["module_05"] = str(exc)

    for skipped_key in MODULE_SEQUENCE:
        if skipped_key in modules_to_run:
            continue
        skipped[skipped_key] = "preserved"

    if failed:
        print(
            f"[任务 {job_id}] 模块执行完成（部分失败）: "
            + ", ".join(sorted(failed.keys()))
        )
    else:
        print(f"[任务 {job_id}] 所有模块执行完成")
    return {
        "mode": mode,
        "results": results,
        "succeeded": sorted(results.keys()),
        "failed": failed,
        "skipped": skipped,
        "retried": sorted(modules_to_run),
        "preserved": sorted(preserved),
    }


def bundle_job(job_id: str) -> Path:
    job_dir = get_job_dir(job_id)
    zip_path = job_dir / f"{job_id}.zip"
    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as zf:
        for p in job_dir.rglob("*"):
            if p == zip_path or p.is_dir():
                continue
            zf.write(p, arcname=str(p.relative_to(job_dir)))
    return zip_path


def _resolve_job_dir_from_job(job: dict) -> Path | None:
    pdf_path = str(job.get("pdf_path") or "").strip()
    if not pdf_path:
        return None

    try:
        job_dir = Path(pdf_path).resolve().parents[1]
    except Exception:
        return None

    try:
        job_dir.relative_to(JOBS_DIR.resolve())
    except ValueError:
        return None
    return job_dir


def _load_repo_meta_from_dir(job_dir: Path) -> tuple[str | None, dict]:
    repo_dir = job_dir / "repo"
    checkout = repo_dir / "checkout"
    pointer = repo_dir / "pointer.json"

    if checkout.exists() and checkout.is_dir():
        return "git", {"type": "git", "path": str(checkout)}

    if pointer.exists() and pointer.is_file():
        try:
            payload = json.loads(pointer.read_text(encoding="utf-8", errors="replace"))
            if isinstance(payload, dict):
                repo_type = payload.get("type")
                return (str(repo_type) if repo_type else None), payload
        except Exception:
            pass

    return None, {}


def _infer_job_status(job_dir: Path, outputs: list[dict]) -> str:
    if outputs:
        return "completed"
    if (job_dir / "paper" / "extracted" / "paper.md").exists():
        return "extracted"
    if (job_dir / "paper" / "original.pdf").exists():
        return "pdf_uploaded"
    return "created"


def _discover_outputs(job_dir: Path) -> list[dict]:
    outputs_dir = job_dir / "outputs"
    if not outputs_dir.exists() or not outputs_dir.is_dir():
        return []

    items: list[dict] = []
    for module_name in MODULE_SEQUENCE:
        path = _resolve_output_path(outputs_dir, module_name)
        if path.exists() and path.is_file():
            items.append(
                {
                    "module_name": module_name,
                    "path": str(path),
                    "status": "done",
                    "llm_meta": {},
                }
            )
    return items


def _build_sync_fields(
    job_dir: Path, outputs: list[dict], existing_job: dict | None = None
) -> dict:
    pdf_path = job_dir / "paper" / "original.pdf"
    repo_type, repo_meta = _load_repo_meta_from_dir(job_dir)
    status = _infer_job_status(job_dir, outputs)

    fields = {
        "pdf_path": str(pdf_path) if pdf_path.exists() else None,
        "repo_type": repo_type,
        "repo_meta_json": repo_meta,
        "status": status,
    }
    if status != "failed":
        fields["error"] = None

    if existing_job and existing_job.get("status") == "failed" and status != "failed":
        fields["error"] = None
    return fields


def sync_jobs_from_directory(strict: bool = True) -> dict:
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    dir_list = sorted(
        [p for p in JOBS_DIR.iterdir() if p.is_dir()], key=lambda p: p.name.lower()
    )
    dir_by_name = {p.name: p for p in dir_list}

    jobs = db.list_jobs()
    claimed_dirs: set[str] = set()

    created = 0
    updated = 0
    deleted = 0

    for job in jobs:
        job_id = str(job.get("id") or "")
        matched_dir = dir_by_name.get(job_id)
        if matched_dir is None:
            matched_dir = _resolve_job_dir_from_job(job)

        if matched_dir is None or not matched_dir.exists() or not matched_dir.is_dir():
            if strict:
                if db.delete_job(job_id):
                    deleted += 1
            continue

        claimed_dirs.add(matched_dir.name)
        outputs = _discover_outputs(matched_dir)
        db.replace_outputs_for_job(job_id, outputs)
        db.update_job(
            job_id, **_build_sync_fields(matched_dir, outputs, existing_job=job)
        )
        updated += 1

    for folder_name, job_dir in dir_by_name.items():
        if folder_name in claimed_dirs:
            continue

        job_id = folder_name
        if db.get_job(job_id):
            continue

        db.create_job(job_id)
        outputs = _discover_outputs(job_dir)
        db.replace_outputs_for_job(job_id, outputs)
        db.update_job(job_id, **_build_sync_fields(job_dir, outputs))
        created += 1

    return {
        "status": "ok",
        "strict": strict,
        "scanned_dirs": len(dir_list),
        "created": created,
        "updated": updated,
        "deleted": deleted,
    }
