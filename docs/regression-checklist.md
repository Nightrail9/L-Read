# Regression Checklist

Use this quick checklist after frontend/backend changes.

## 1) Startup

- Run `start.bat` from repository root.
- Verify browser opens `http://127.0.0.1:<port>/`.
- Verify `GET /health` returns `{ "status": "ok" }`.

## 2) LLM Config

- Open model config modal.
- Click connectivity test with valid config and confirm success text appears.
- Try an invalid key and confirm readable error text appears.

## 3) Core Pipeline

- Create a new task and upload a PDF.
- Run extract stage and confirm progress/status updates.
- Optionally configure a repo and confirm index stage runs.
- Run modules and confirm reading page shows generated notes.

## 4) History and Notes

- Verify project appears in project list and sidebar shortcuts.
- Open history popover in collapsed sidebar mode.
- Open a note, copy markdown, and download markdown.

## 5) Delete Flow

- Delete a project with backend job.
- Confirm backend delete failure is shown with fallback choice.
- Confirm local delete-only branch still works.

## 6) Sanity Commands

- Backend syntax check:
  - `./env/python.exe -m compileall apps/api/app`
- Frontend syntax check:
  - `node --check apps/web/app.js`
  - `node --check apps/web/src/main.js`
- Smoke check (service must be running):
  - `./env/python.exe scripts/smoke_check.py --base-url http://127.0.0.1:8000`
