# AGENTS.md
Operational guide for coding agents working in this repository.
## 1) Repository map
- Backend: `apps/api/` (FastAPI + SQLite + job orchestration services).
- Frontend: `apps/web/` (static HTML + vanilla ES modules + CSS/Tailwind utilities).
- Runtime data: `data/` (`app.db`, `jobs/*` artifacts, exports).
- Utility scripts: `scripts/` (`smoke_check.py` integration check).
- Startup script: `start.bat` in repository root.
- Tooling reality: no root `package.json`, no monorepo task runner, no committed first-party tests yet.
## 2) Environment and startup
Use the repo-local interpreter for all Python commands:
```bash
".\env\python.exe" --version
```
Install backend dependencies:
```bash
".\env\python.exe" -m pip install -r apps/api/requirements.txt
```
Create env file:
```bash
copy apps/api/.env.example apps/api/.env
```
Important `apps/api/.env` keys used by this repo:
- `STARTUP_PYTHON_EXE` (required by `start.bat`, usually `.\env\python.exe`)
- `STARTUP_APP_PORT` (optional; fallback `8000`)
- `LLM_PROVIDER` (`gpt`, `gemini`, or `openai-compatible`)
- `OPENAI_API_KEY` and/or `GPT_API_KEY` (for `gpt` provider)
- `GEMINI_API_KEY` (for `gemini` provider)
- `OPENAI_COMPAT_API_KEY` (for `openai-compatible` provider)
- `MINERU_TOKEN` (required)
Preferred startup:
```bash
start.bat
```
Manual backend startup:
```bash
".\env\python.exe" -m uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8000 --reload
```
## 3) Build/lint/test commands
Use these defaults unless project tooling changes.
Backend syntax sanity check (minimum after Python edits):
```bash
".\env\python.exe" -m compileall apps/api/app
```
Backend lint (optional, only if installed):
```bash
ruff check apps/api/app
```
Backend formatting (optional, run only when requested):
```bash
ruff format apps/api/app
```
Pytest status:
- There is currently no committed test directory under `apps/api/tests/`.
- If tests are added, run them through the repo interpreter.
Test commands:
```bash
# all tests
".\env\python.exe" -m pytest
# one test file
".\env\python.exe" -m pytest apps/api/tests/test_example.py
# one test case (primary single-test pattern)
".\env\python.exe" -m pytest apps/api/tests/test_example.py::test_case_name
# keyword expression
".\env\python.exe" -m pytest -k "job and not slow"
```
Smoke/integration check (with server already running):
```bash
".\env\python.exe" scripts/smoke_check.py --base-url http://127.0.0.1:8000
```
Frontend checks (no build/lint/test pipeline configured):
```bash
node --check apps/web/app.js
node --check apps/web/src/main.js
```
Manual browser verification should include:
- `/task`
- `/projects`
- `/projects/{id}`
## 4) Cursor and Copilot local rules
Repository scan result at time of writing:
- `.cursorrules`: not found
- `.cursor/rules/`: not found
- `.github/copilot-instructions.md`: not found
If any of these files appear later, treat them as higher-priority local instructions and update this document.
## 5) Python style guide (`apps/api/`)
Follow existing conventions and keep diffs narrow.
### Imports and module boundaries
- Group imports in order: stdlib, third-party, local; keep one blank line between groups.
- Prefer explicit imports; avoid wildcard imports.
- Use relative imports for internal modules under `apps/api/app/`.
- Keep route modules HTTP-focused; move orchestration/business logic into services.
### Typing and function signatures
- Use Python 3.11 type syntax (`str | None`, `list[str]`, `dict[str, Any]`).
- Add return type hints for new or modified public functions.
- Keep FastAPI handler parameters explicit (`job_id`, payload model, `BackgroundTasks`, `UploadFile`).
- Convert Pydantic objects at boundaries via `payload.model_dump()`.
### Naming and formatting
- `snake_case`: functions, variables, module files.
- `PascalCase`: classes, exceptions, pydantic models.
- `UPPER_SNAKE_CASE`: constants.
- Keep formatting Black-compatible; avoid formatting-only churn unless requested.
### API and persistence conventions
- Preserve endpoint paths and response shapes unless explicitly requested otherwise.
- Keep common payload patterns stable (`{"status": "ok"}`, `{"job_id": "..."}`).
- Preserve lifecycle vocabulary already used by UI/API (`created`, `running`, `done`, `failed`, `completed`).
- Prefer a single canonical route shape (for example `/jobs/sync`) and avoid adding new compatibility aliases unless explicitly required.
- Prefer `pathlib.Path` over manual path string operations.
- Keep path-safety protections intact (`resolve_job_path`, `require_job`).
- Reuse DB helpers in `apps/api/app/db.py`; avoid ad hoc SQL in route handlers.
- Preserve JSON-in-SQLite pattern (`*_json` columns store serialized dict/list values).
- Favor additive/backward-compatible DB changes.
### Error handling
- Use `ApiError` for domain/validation failures in routes.
- Use explicit HTTP status codes (`4xx` client/domain, `5xx` unexpected/server).
- Chain wrapped exceptions: `raise ApiError(...) from exc`.
- In background jobs, persist failure state/message through DB helper calls.
- Do not silently swallow exceptions unless intentionally non-fatal.
## 6) JavaScript style guide (`apps/web/`)
- Preserve the vanilla ES module architecture under `src/` (`api/`, `controller/`, `events/`, `pipeline/`, `state/`, `ui/`, `views/`).
- Keep current formatting style: semicolons, 4-space indentation, readable multiline imports.
- Prefer `const`; use `let` only for reassignment.
- Use `camelCase` for vars/functions and `UPPER_SNAKE_CASE` for constants.
- Keep DOM wiring and listeners centralized in controller/events modules.
- Reuse shared API/error helpers (`src/api/http.js`, `src/api/error-map.js`).
- Preserve SPA routing behavior (`/task`, `/projects`, `/projects/:id`) and history handling.
- Preserve existing user-facing language mix (Chinese + English labels/messages).
- Do not introduce React/Vue/Svelte unless explicitly requested.
## 7) Security and safety guardrails
- Never commit secrets (`apps/api/.env`, API keys, tokens, private keys).
- Be careful with `data/jobs/*/repo/checkout` (external repository checkouts).
- Keep local path validation for user-provided paths and repo settings.
- Avoid destructive cleanup/removal commands unless explicitly requested.
## 8) Agent workflow expectations
- Prefer surgical edits over broad rewrites.
- Avoid unrelated refactors while implementing a feature/fix.
- After backend edits, run at least compile sanity check.
- Run smoke checks when API behavior or flow orchestration changes.
- If a validation step cannot be run, explicitly report what was skipped and why.
- Update this file when tooling, workflows, or repository conventions change.
## 9) Practical entrypoints
- Backend app entrypoint: `apps/api/app/main.py`
- Main API routes: `apps/api/app/routes/jobs.py`
- DB helper layer: `apps/api/app/db.py`
- Job orchestration service: `apps/api/app/services/job_service.py`
- Repo handling service: `apps/api/app/services/repo_service.py`
- Frontend bootstrap: `apps/web/app.js`
- Frontend controller root: `apps/web/src/controller/app-controller.js`
- Smoke check script: `scripts/smoke_check.py`
