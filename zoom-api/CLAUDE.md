# zoom-api

FastAPI service exposing Zoom attendance and meeting management as a REST API.

## GitHub

Primary consumer and issue tracker: `chester-hill-solutions/summerlunchplus-app`

- All issues and tasks related to zoom-api integration go here
- Sai's GitHub username: `sai-sy`

## Running the app

```bash
.venv/bin/uvicorn app.main:app --reload
```

Swagger UI: http://localhost:8000/docs

## Running tests

```bash
.venv/bin/pytest tests/ -v
```

## Development standards

Always default to best practices. When there are tradeoffs (e.g. convenience vs. correctness, speed vs. reliability), choose the best-practice option by default. If a tradeoff is genuinely worth making, explain it explicitly and get confirmation before proceeding — never make it silently.

Correctness over speed. Before marking any task complete:

- Does the implementation match the API contract (status codes, response shapes, error behavior)?
- Is the developer experience correct — not just the logic? (e.g. Swagger UI, error messages, OpenAPI spec)
- Are there tests that would catch a regression if this code changed?

If the answer to any of these is no, the task is not done.

## Pace and review

Go slow. For every file created or modified:

1. Explain what the file does and why before writing it.
2. Write the file.
3. Pause and invite questions before moving to the next file.

Never batch multiple file changes silently. The user reviews each change before the next one begins.

## Auth checklist

When modifying authentication (`app/auth.py`):

- Auth must use `HTTPBearer` from `fastapi.security` — not a raw `Header(...)` parameter. `HTTPBearer` registers the security scheme in the OpenAPI spec, which is required for the Authorize button and lock icons to appear in Swagger UI.
- After any auth change, open Swagger UI and confirm the Authorize button is visible in the top right.
- `test_openapi_declares_security_scheme` in `tests/test_main.py` enforces this automatically — it must stay green.
