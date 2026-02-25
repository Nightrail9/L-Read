import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Generator

from .config import DB_PATH


def _utcnow() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _loads_json_dict(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def init_db() -> None:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                pdf_path TEXT,
                repo_type TEXT,
                repo_meta_json TEXT DEFAULT '{}',
                error TEXT
            )
            """
        )
        cols = {row[1] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()}
        if "llm_config_json" not in cols:
            conn.execute(
                "ALTER TABLE jobs ADD COLUMN llm_config_json TEXT DEFAULT '{}'"
            )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                error TEXT,
                UNIQUE(job_id, name)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS artifacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                type TEXT NOT NULL,
                path TEXT NOT NULL,
                meta_json TEXT DEFAULT '{}'
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS selections (
                job_id TEXT PRIMARY KEY,
                json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS outputs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                module_name TEXT NOT NULL,
                path TEXT NOT NULL,
                status TEXT NOT NULL,
                llm_meta_json TEXT DEFAULT '{}',
                UNIQUE(job_id, module_name)
            )
            """
        )


@contextmanager
def get_conn() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def create_job(job_id: str) -> None:
    now = _utcnow()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO jobs(id, status, created_at, updated_at) VALUES(?, 'created', ?, ?)",
            (job_id, now, now),
        )


def update_job(job_id: str, **fields: Any) -> None:
    if not fields:
        return
    fields["updated_at"] = _utcnow()
    keys = list(fields.keys())
    values = [
        json.dumps(v) if isinstance(v, (dict, list)) else v for v in fields.values()
    ]
    clause = ", ".join([f"{k} = ?" for k in keys])
    with get_conn() as conn:
        conn.execute(f"UPDATE jobs SET {clause} WHERE id = ?", (*values, job_id))


def get_job(job_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            return None
        job = dict(row)
        job["repo_meta_json"] = _loads_json_dict(job.get("repo_meta_json"))
        job["llm_config_json"] = _loads_json_dict(job.get("llm_config_json"))
        return job


def list_jobs() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT j.*,
                   COUNT(o.id) AS outputs_count
            FROM jobs j
            LEFT JOIN outputs o ON o.job_id = j.id
            GROUP BY j.id
            ORDER BY j.updated_at DESC, j.created_at DESC
            """
        ).fetchall()

        jobs: list[dict[str, Any]] = []
        for row in rows:
            job = dict(row)
            job["repo_meta_json"] = _loads_json_dict(job.get("repo_meta_json"))
            job["llm_config_json"] = _loads_json_dict(job.get("llm_config_json"))
            jobs.append(job)
        return jobs


def delete_job(job_id: str) -> bool:
    with get_conn() as conn:
        exists = conn.execute("SELECT 1 FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not exists:
            return False
        conn.execute("DELETE FROM tasks WHERE job_id = ?", (job_id,))
        conn.execute("DELETE FROM artifacts WHERE job_id = ?", (job_id,))
        conn.execute("DELETE FROM selections WHERE job_id = ?", (job_id,))
        conn.execute("DELETE FROM outputs WHERE job_id = ?", (job_id,))
        conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        return True


def upsert_task(job_id: str, name: str, status: str, error: str | None = None) -> None:
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM tasks WHERE job_id = ? AND name = ?", (job_id, name)
        ).fetchone()
        now = _utcnow()
        started_at = now if status == "running" else None
        finished_at = now if status in {"done", "failed"} else None
        if existing:
            conn.execute(
                """
                UPDATE tasks
                SET status = ?, started_at = COALESCE(started_at, ?), finished_at = ?, error = ?
                WHERE job_id = ? AND name = ?
                """,
                (status, started_at, finished_at, error, job_id, name),
            )
        else:
            conn.execute(
                """
                INSERT INTO tasks(job_id, name, status, started_at, finished_at, error)
                VALUES(?, ?, ?, ?, ?, ?)
                """,
                (job_id, name, status, started_at, finished_at, error),
            )


def list_tasks(job_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM tasks WHERE job_id = ? ORDER BY id ASC", (job_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def add_artifact(
    job_id: str, artifact_type: str, path: str, meta: dict[str, Any] | None = None
) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO artifacts(job_id, type, path, meta_json) VALUES(?, ?, ?, ?)",
            (job_id, artifact_type, path, json.dumps(meta or {})),
        )


def list_artifacts(job_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM artifacts WHERE job_id = ? ORDER BY id ASC", (job_id,)
        ).fetchall()
        out: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item["meta_json"] = _loads_json_dict(item.get("meta_json"))
            out.append(item)
        return out


def get_artifact(job_id: str, artifact_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM artifacts WHERE job_id = ? AND id = ?",
            (job_id, artifact_id),
        ).fetchone()
        if not row:
            return None
        item = dict(row)
        item["meta_json"] = _loads_json_dict(item.get("meta_json"))
        return item


def upsert_selections(job_id: str, payload: dict[str, Any]) -> None:
    with get_conn() as conn:
        now = _utcnow()
        conn.execute(
            """
            INSERT INTO selections(job_id, json, updated_at)
            VALUES(?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
            """,
            (job_id, json.dumps(payload), now),
        )


def get_selections(job_id: str) -> dict[str, Any]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT json FROM selections WHERE job_id = ?", (job_id,)
        ).fetchone()
        if not row:
            return {}
        return _loads_json_dict(row["json"])


def upsert_output(
    job_id: str,
    module_name: str,
    path: str,
    status: str,
    llm_meta: dict[str, Any] | None = None,
) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO outputs(job_id, module_name, path, status, llm_meta_json)
            VALUES(?, ?, ?, ?, ?)
            ON CONFLICT(job_id, module_name)
            DO UPDATE SET path = excluded.path, status = excluded.status, llm_meta_json = excluded.llm_meta_json
            """,
            (job_id, module_name, path, status, json.dumps(llm_meta or {})),
        )


def replace_outputs_for_job(job_id: str, outputs: list[dict[str, Any]]) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM outputs WHERE job_id = ?", (job_id,))
        for item in outputs:
            conn.execute(
                """
                INSERT INTO outputs(job_id, module_name, path, status, llm_meta_json)
                VALUES(?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    str(item.get("module_name") or ""),
                    str(item.get("path") or ""),
                    str(item.get("status") or "done"),
                    json.dumps(item.get("llm_meta") or {}),
                ),
            )


def list_outputs(job_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM outputs WHERE job_id = ? ORDER BY module_name", (job_id,)
        ).fetchall()
        out: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item["llm_meta_json"] = _loads_json_dict(item.get("llm_meta_json"))
            out.append(item)
        return out


def get_output(job_id: str, module_name: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM outputs WHERE job_id = ? AND module_name = ?",
            (job_id, module_name),
        ).fetchone()
        if not row:
            return None
        item = dict(row)
        item["llm_meta_json"] = _loads_json_dict(item.get("llm_meta_json"))
        return item
