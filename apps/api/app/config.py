import os
import shutil
import sqlite3
from pathlib import Path

from dotenv import load_dotenv


def _detect_root_dir() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        has_apps_layout = (parent / "apps" / "api").exists() and (
            parent / "apps" / "web"
        ).exists()
        has_root_markers = (
            (parent / "start.bat").exists()
            or (parent / "README.md").exists()
            or (parent / ".git").exists()
        )
        if has_apps_layout and has_root_markers:
            return parent
    if len(current.parents) > 3:
        return current.parents[3]
    return current.parents[-1]


def _resolve_data_dir(root_dir: Path) -> Path:
    raw = os.getenv("APP_DATA_DIR", "").strip()
    if not raw:
        return root_dir / "data"

    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = root_dir / candidate
    return candidate.resolve()


def _dir_has_files(path: Path) -> bool:
    return path.exists() and path.is_dir() and any(path.iterdir())


def _db_has_jobs(path: Path) -> bool:
    if not path.exists() or not path.is_file():
        return False
    try:
        conn = sqlite3.connect(path)
        try:
            cur = conn.execute("SELECT COUNT(1) FROM jobs")
            row = cur.fetchone()
            return bool(row and int(row[0]) > 0)
        finally:
            conn.close()
    except Exception:
        return False


ROOT_DIR = _detect_root_dir()
BACKEND_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT_DIR / "apps" / "web"
load_dotenv(BACKEND_DIR / ".env")

DATA_DIR = _resolve_data_dir(ROOT_DIR)
JOBS_DIR = DATA_DIR / "jobs"
DB_PATH = DATA_DIR / "app.db"
PROMPTS_JSON_FILE = BACKEND_DIR / "app" / "prompts" / "modules.json"
LEGACY_DATA_DIR = ROOT_DIR / "apps" / "data"

API_HOST = "127.0.0.1"
API_PORT = int(os.getenv("BACKEND_PORT", "8000"))

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gpt").strip().lower() or "gpt"

GPT_API_KEY = os.getenv("GPT_API_KEY", os.getenv("OPENAI_API_KEY", "")).strip()
GPT_BASE_URL = os.getenv(
    "GPT_BASE_URL", os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
).rstrip("/")
GPT_MODEL_TEXT = os.getenv(
    "GPT_MODEL_TEXT", os.getenv("OPENAI_MODEL_TEXT", "gpt-4.1-mini")
)
GPT_MODEL_VISION = os.getenv(
    "GPT_MODEL_VISION", os.getenv("OPENAI_MODEL_VISION", "gpt-4.1-mini")
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_BASE_URL = os.getenv(
    "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai"
).rstrip("/")
GEMINI_MODEL_TEXT = os.getenv("GEMINI_MODEL_TEXT", "gemini-2.5-flash")
GEMINI_MODEL_VISION = os.getenv("GEMINI_MODEL_VISION", "gemini-2.5-flash")

OPENAI_COMPAT_API_KEY = os.getenv("OPENAI_COMPAT_API_KEY", "").strip()
OPENAI_COMPAT_BASE_URL = os.getenv("OPENAI_COMPAT_BASE_URL", "").strip().rstrip("/")
OPENAI_COMPAT_MODEL_TEXT = os.getenv("OPENAI_COMPAT_MODEL_TEXT", "gpt-4o-mini")
OPENAI_COMPAT_MODEL_VISION = os.getenv("OPENAI_COMPAT_MODEL_VISION", "gpt-4o-mini")

OPENAI_API_KEY = GPT_API_KEY
OPENAI_BASE_URL = GPT_BASE_URL
OPENAI_MODEL_TEXT = GPT_MODEL_TEXT
OPENAI_MODEL_VISION = GPT_MODEL_VISION

MINERU_TOKEN = os.getenv("MINERU_TOKEN", "").strip()
MINERU_SKIP_SSL_VERIFY = os.getenv("MINERU_SKIP_SSL_VERIFY", "false").lower() in {
    "1",
    "true",
    "yes",
}
MINERU_DOWNLOAD_RETRIES = int(os.getenv("MINERU_DOWNLOAD_RETRIES", "3"))

MAX_GLOBAL_CONCURRENCY = int(os.getenv("MAX_GLOBAL_CONCURRENCY", "3"))
MAX_JOB_CONCURRENCY = int(os.getenv("MAX_JOB_CONCURRENCY", "2"))
LLM_TIMEOUT_CONNECT_SEC = int(os.getenv("LLM_TIMEOUT_CONNECT_SEC", "15"))
LLM_TIMEOUT_READ_SEC = int(os.getenv("LLM_TIMEOUT_READ_SEC", "300"))
LLM_RETRIES = int(os.getenv("LLM_RETRIES", "2"))
LLM_RETRY_BACKOFF_SEC = float(os.getenv("LLM_RETRY_BACKOFF_SEC", "2"))
LLM_MAX_OUTPUT_TOKENS = int(os.getenv("LLM_MAX_OUTPUT_TOKENS", "6000"))
LLM_CONTINUATION_ROUNDS = int(os.getenv("LLM_CONTINUATION_ROUNDS", "2"))
GIT_CLONE_RETRIES = int(os.getenv("GIT_CLONE_RETRIES", "3"))
GIT_CLONE_TIMEOUT_SEC = int(os.getenv("GIT_CLONE_TIMEOUT_SEC", "180"))
GIT_HTTP_PROXY = os.getenv("GIT_HTTP_PROXY", "").strip()
GIT_HTTPS_PROXY = os.getenv("GIT_HTTPS_PROXY", "").strip()
GIT_SSL_NO_VERIFY = os.getenv("GIT_SSL_NO_VERIFY", "false").lower() in {
    "1",
    "true",
    "yes",
}

MAX_FILE_BYTES = int(os.getenv("MAX_FILE_BYTES", str(5 * 1024 * 1024)))
MAX_TOTAL_BYTES = int(os.getenv("MAX_TOTAL_BYTES", str(200 * 1024 * 1024)))
MAX_FILES = int(os.getenv("MAX_FILES", "2000"))

SKIP_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".venv",
    "__pycache__",
    ".idea",
    ".vscode",
}

SENSITIVE_PATTERNS = [
    ".env",
    "id_rsa",
    ".pem",
    ".key",
    "credentials",
]

ALLOWED_EXTS = {
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".java",
    ".go",
    ".rs",
    ".cpp",
    ".h",
    ".hpp",
    ".c",
    ".md",
    ".rst",
    ".txt",
    ".yaml",
    ".yml",
    ".toml",
    ".json",
    ".ini",
    ".cfg",
    ".sh",
    ".bat",
    ".ps1",
}


def ensure_dirs() -> None:
    if os.getenv("APP_DATA_DIR", "").strip():
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        return

    if DATA_DIR.resolve() != LEGACY_DATA_DIR.resolve():
        legacy_db = LEGACY_DATA_DIR / "app.db"
        legacy_jobs = LEGACY_DATA_DIR / "jobs"
        target_has_data = _db_has_jobs(DB_PATH) or _dir_has_files(JOBS_DIR)
        legacy_has_data = _db_has_jobs(legacy_db) or _dir_has_files(legacy_jobs)

        if legacy_has_data and not target_has_data:
            DATA_DIR.mkdir(parents=True, exist_ok=True)

            if legacy_db.exists() and not DB_PATH.exists():
                shutil.move(str(legacy_db), str(DB_PATH))

            if legacy_jobs.exists():
                if JOBS_DIR.exists() and not _dir_has_files(JOBS_DIR):
                    shutil.rmtree(JOBS_DIR, ignore_errors=True)
                if not JOBS_DIR.exists():
                    shutil.move(str(legacy_jobs), str(JOBS_DIR))

            print(f"[data] migrated legacy data dir: {LEGACY_DATA_DIR} -> {DATA_DIR}")
        elif legacy_has_data and target_has_data:
            print(
                "[data] both data roots have content; using primary data dir "
                f"{DATA_DIR} and keeping legacy dir {LEGACY_DATA_DIR} unchanged"
            )

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
