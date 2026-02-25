from pathlib import Path
from typing import Any

from .. import db
from ..config import JOBS_DIR
from ..errors import ApiError


def require_job(job_id: str) -> dict[str, Any]:
    job = db.get_job(job_id)
    if not job:
        raise ApiError(status_code=404, code="JOB_NOT_FOUND", message="job not found")
    return job


def resolve_job_path(job_id: str, path_str: str) -> Path:
    path = Path(path_str).resolve()
    job_root = (JOBS_DIR / job_id).resolve()
    try:
        path.relative_to(job_root)
    except ValueError as exc:
        raise ApiError(
            status_code=403, code="ARTIFACT_PATH_DENIED", message="artifact path denied"
        ) from exc
    return path
