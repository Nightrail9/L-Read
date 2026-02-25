import os
from pathlib import Path

from dotenv import load_dotenv


def _detect_root_dir() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "AGENTS.md").exists():
            return parent
    return current.parents[2]


ROOT_DIR = _detect_root_dir()
BACKEND_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT_DIR / "apps" / "web"
DATA_DIR = ROOT_DIR / "data"
JOBS_DIR = DATA_DIR / "jobs"
DB_PATH = DATA_DIR / "app.db"
PROMPTS_JSON_FILE = BACKEND_DIR / "app" / "prompts" / "modules.json"

load_dotenv(BACKEND_DIR / ".env")

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
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
