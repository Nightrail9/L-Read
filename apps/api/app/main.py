from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .config import FRONTEND_DIR, ensure_dirs
from .errors import ApiError, build_error_payload, handle_api_error
from .routes import health_router, jobs_router


app = FastAPI(title="Paper DeepRead Backend", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    ensure_dirs()
    db.init_db()


@app.exception_handler(ApiError)
async def api_error_handler(request, exc: ApiError):
    return await handle_api_error(request, exc)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content=build_error_payload(
            code="REQUEST_VALIDATION_ERROR",
            message="request validation failed",
            details={"errors": exc.errors()},
        ),
    )


app.include_router(health_router)
app.include_router(jobs_router)


def _resolve_frontend_dir() -> Path:
    if FRONTEND_DIR.exists():
        return FRONTEND_DIR

    fallback = Path(__file__).resolve().parents[2] / "web"
    if fallback.exists():
        return fallback

    return FRONTEND_DIR


WEB_DIR = _resolve_frontend_dir()


def _serve_frontend_index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if response.status_code != 404:
            return response

        if scope.get("method") != "GET":
            return response

        request_path = scope.get("path", "")
        if request_path.startswith("/api"):
            return response

        if "." in Path(request_path).name:
            return response

        return await super().get_response("index.html", scope)


@app.get("/")
async def frontend_root() -> RedirectResponse:
    return RedirectResponse(url="/task", status_code=307)


@app.get("/task")
async def frontend_task() -> FileResponse:
    return _serve_frontend_index()


@app.get("/projects")
async def frontend_projects() -> FileResponse:
    return _serve_frontend_index()


@app.get("/projects/{project_id}")
async def frontend_project_detail(project_id: str) -> FileResponse:
    _ = project_id
    return _serve_frontend_index()


if WEB_DIR.exists():
    app.mount("/", SPAStaticFiles(directory=str(WEB_DIR), html=True), name="web")
