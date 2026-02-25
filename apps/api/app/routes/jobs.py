from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, UploadFile
from fastapi.responses import FileResponse

from .. import db
from ..errors import ApiError
from ..schemas import (
    LLMConfigPayload,
    RepoPayload,
    RunModulesPayload,
    SelectionsPayload,
    UpdateOutputPayload,
)
from ..services import job_service, llm_service
from .deps import require_job, resolve_job_path


router = APIRouter(prefix="/api", tags=["jobs"])


def _queue_background_task(
    background_tasks: BackgroundTasks,
    *,
    job_id: str,
    task_name: str,
    success_status: str,
    work,
    queued_task: str | None = None,
) -> dict:
    def _run() -> None:
        try:
            work()
            db.update_job(job_id, status=success_status, error=None)
        except Exception as exc:
            print(f"[任务 {job_id}] {task_name} 失败: {exc}")
            db.upsert_task(job_id, task_name, "failed", str(exc))
            db.update_job(job_id, status="failed", error=str(exc))

    background_tasks.add_task(_run)
    return {"status": "queued", "task": queued_task or task_name}


@router.post("/jobs")
def create_job() -> dict:
    job_id = job_service.new_job()
    return {"job_id": job_id}


@router.get("/jobs")
def list_jobs() -> dict:
    return {"items": db.list_jobs()}


@router.post("/jobs/sync")
def sync_jobs() -> dict:
    result = job_service.sync_jobs_from_directory(strict=True)
    return {**result, "items": db.list_jobs()}


@router.post("/jobs/{job_id}/pdf")
async def upload_pdf(job_id: str, file: UploadFile = File(...)) -> dict:
    require_job(job_id)
    filename = (file.filename or "").lower()
    if not filename.endswith(".pdf"):
        raise ApiError(
            status_code=400, code="INVALID_FILE_TYPE", message="only PDF is supported"
        )
    job_dir = job_service.prepare_job_dir_for_pdf(job_id, file.filename or "paper.pdf")
    target = job_dir / "paper" / "original.pdf"
    content = await file.read()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    db.update_job(job_id, pdf_path=str(target), status="pdf_uploaded")
    return {"pdf_path": str(target)}


@router.post("/jobs/{job_id}/repo")
def configure_repo(job_id: str, payload: RepoPayload) -> dict:
    require_job(job_id)
    try:
        meta = job_service.set_repo(job_id, payload.model_dump())
    except ValueError as exc:
        raise ApiError(
            status_code=400, code="INVALID_REPO_PAYLOAD", message=str(exc)
        ) from exc
    except Exception as exc:
        raise ApiError(
            status_code=500, code="CONFIGURE_REPO_FAILED", message=str(exc)
        ) from exc

    if meta.get("needs_confirmation"):
        return {"status": "needs_confirmation", "meta": meta}
    return {"status": "ok", "meta": meta}


@router.post("/jobs/{job_id}/extract")
def extract_pdf(job_id: str, background_tasks: BackgroundTasks) -> dict:
    require_job(job_id)
    return _queue_background_task(
        background_tasks,
        job_id=job_id,
        task_name="extract_pdf",
        success_status="extracted",
        work=lambda: job_service.run_extract(job_id),
    )


@router.post("/jobs/{job_id}/index")
def index_repo(job_id: str, background_tasks: BackgroundTasks) -> dict:
    require_job(job_id)
    return _queue_background_task(
        background_tasks,
        job_id=job_id,
        task_name="prepare_repo",
        success_status="indexed",
        work=lambda: job_service.run_index(job_id),
        queued_task="prepare_repo",
    )


@router.post("/jobs/{job_id}/selections")
def save_selections(job_id: str, payload: SelectionsPayload) -> dict:
    require_job(job_id)
    db.upsert_selections(job_id, payload.model_dump())
    return {"status": "ok"}


@router.post("/jobs/{job_id}/llm-config")
def save_llm_config(job_id: str, payload: LLMConfigPayload) -> dict:
    require_job(job_id)
    db.update_job(job_id, llm_config_json=payload.model_dump())
    return {"status": "ok"}


@router.post("/llm-config/check")
def check_llm_connectivity(payload: LLMConfigPayload) -> dict:
    try:
        meta = llm_service.check_connectivity(payload.model_dump())
    except llm_service.LLMError as exc:
        raise ApiError(
            status_code=400, code="LLM_CONNECTIVITY_FAILED", message=str(exc)
        ) from exc
    except Exception as exc:
        raise ApiError(
            status_code=500, code="LLM_CONNECTIVITY_FAILED", message=str(exc)
        ) from exc
    return {"status": "ok", "meta": meta}


@router.post("/jobs/{job_id}/run")
def run_modules(
    job_id: str,
    background_tasks: BackgroundTasks,
    payload: RunModulesPayload | None = None,
) -> dict:
    require_job(job_id)
    mode = (payload.mode if payload else "retry_failed").strip()
    module_key = payload.module if payload else None

    def _run() -> None:
        db.upsert_task(job_id, "run_modules", "running")
        try:
            summary = job_service.run_modules(job_id, mode=mode, module_key=module_key)
            failed = summary.get("failed") or {}
            if failed:
                failed_names = ", ".join(sorted(failed.keys()))
                db.upsert_task(
                    job_id,
                    "run_modules",
                    "failed",
                    f"modules failed: {failed_names}",
                )
                db.update_job(
                    job_id,
                    status="completed",
                    error=f"部分模块失败：{failed_names}",
                )
            else:
                db.upsert_task(job_id, "run_modules", "done")
                db.update_job(job_id, status="completed", error=None)
        except Exception as exc:
            print(f"[任务 {job_id}] 模块执行失败: {exc}")
            db.upsert_task(job_id, "run_modules", "failed", str(exc))
            db.update_job(job_id, status="failed", error=str(exc))

    background_tasks.add_task(_run)
    return {
        "status": "queued",
        "task": "run_modules",
        "mode": mode,
        "module": module_key,
    }


@router.delete("/jobs/{job_id}")
def delete_job(job_id: str) -> dict:
    require_job(job_id)
    try:
        job_service.delete_job(job_id)
    except Exception as exc:
        raise ApiError(
            status_code=500, code="DELETE_JOB_FAILED", message=str(exc)
        ) from exc
    return {"status": "deleted", "job_id": job_id}


@router.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = require_job(job_id)
    return {
        "job": job,
        "tasks": db.list_tasks(job_id),
        "outputs": db.list_outputs(job_id),
    }


@router.get("/jobs/{job_id}/artifacts")
def list_artifacts(job_id: str) -> dict:
    require_job(job_id)
    return {"items": db.list_artifacts(job_id)}


@router.get("/jobs/{job_id}/artifacts/{artifact_id}/raw")
def get_artifact_raw(job_id: str, artifact_id: int) -> FileResponse:
    require_job(job_id)
    item = db.get_artifact(job_id, artifact_id)
    if not item:
        raise ApiError(
            status_code=404, code="ARTIFACT_NOT_FOUND", message="artifact not found"
        )

    path = resolve_job_path(job_id, item["path"])
    if not path.exists() or not path.is_file():
        raise ApiError(
            status_code=404, code="ARTIFACT_MISSING", message="artifact file missing"
        )
    return FileResponse(path=str(path), filename=path.name)


@router.get("/jobs/{job_id}/outputs/{module_name}")
def get_output(job_id: str, module_name: str) -> dict:
    require_job(job_id)
    item = db.get_output(job_id, module_name)
    if not item:
        raise ApiError(
            status_code=404, code="OUTPUT_NOT_FOUND", message="output not found"
        )
    path = Path(item["path"])
    if not path.exists():
        raise ApiError(
            status_code=404, code="OUTPUT_FILE_MISSING", message="output file missing"
        )
    return {
        "module_name": module_name,
        "path": str(path),
        "content": path.read_text(encoding="utf-8", errors="replace"),
        "llm_meta": item.get("llm_meta_json", {}),
    }


@router.put("/jobs/{job_id}/outputs/{module_name}")
def update_output(job_id: str, module_name: str, payload: UpdateOutputPayload) -> dict:
    require_job(job_id)
    item = db.get_output(job_id, module_name)
    if not item:
        raise ApiError(
            status_code=404, code="OUTPUT_NOT_FOUND", message="output not found"
        )

    path = resolve_job_path(job_id, item["path"])
    if not path.exists() or not path.is_file():
        raise ApiError(
            status_code=404, code="OUTPUT_FILE_MISSING", message="output file missing"
        )

    try:
        path.write_text(payload.content, encoding="utf-8")
    except OSError as exc:
        raise ApiError(
            status_code=500,
            code="OUTPUT_WRITE_FAILED",
            message="failed to write output file",
        ) from exc

    db.upsert_output(
        job_id,
        module_name,
        str(path),
        "done",
        item.get("llm_meta_json") or {},
    )

    return {
        "status": "ok",
        "module_name": module_name,
        "path": str(path),
    }


@router.get("/jobs/{job_id}/download")
def download_job(job_id: str) -> FileResponse:
    require_job(job_id)
    path = job_service.bundle_job(job_id)
    return FileResponse(path=str(path), filename=path.name)
