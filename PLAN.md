# Zoom API Service — Project Plan

A hosted REST API with developer portal, built on the existing Zoom REST API Evaluator as a reference implementation.

---

## Status

**Phase:** Built and tested — ready for deployment.

**Completed:**
- Project scaffolded and committed to git
- `config.py` — typed env var settings via pydantic-settings
- `auth.py` — Bearer token auth via `HTTPBearer`
- `zoom.py` — Zoom API client (S2S OAuth, all operations)
- `cache.py` — in-memory TTL cache
- `main.py` — all API endpoints implemented
- Full test suite (23 tests, all passing)
- `CLAUDE.md` — project standards and developer guidance

**Remaining:**
1. Write `Dockerfile` and deploy to Render
2. Add no-op transformation layer for participant and meeting data (before summerlunchplus integration)
3. Close [issue #239](https://github.com/chester-hill-solutions/summerlunchplus-app/issues/239) once transformation layer is in place

---

## Goals

- Expose Zoom attendance and meeting management functionality as a team-accessible REST API
- Provide an interactive developer portal (Swagger UI) for documentation and testing
- Support a small, known team of users via API key authentication
- Deploy to a managed cloud host with minimal operational overhead

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | FastAPI (Python) | Auto-generates Swagger UI, typed schemas, async support |
| Auth | Single `API_KEY` env var | Simple, sufficient for a small known team; no DB overhead |
| Caching | `cachetools` (in-memory TTL) | Zero infrastructure; sufficient for single-process deployment |
| Hosting | Render | Simple git-connected deploys |
| Settings | `pydantic-settings` | Typed env var config, `.env` support |

---

## Authentication

A single `API_KEY` environment variable. All endpoints except `/health` require:

```
Authorization: Bearer <api_key>
```

The key is set as an environment variable in Render's dashboard for production, and in `.env` for local development.

---

## Caching

In-memory TTL cache using `cachetools.TTLCache`. Cache is scoped to the running process (does not persist across restarts).

| Endpoint | TTL |
|---|---|
| Past meetings list | 10 minutes |
| Participant attendance report | 30 minutes |

Any GET endpoint accepts `?force_refresh=true` to bypass and repopulate the cache.

---

## API Surface

```
GET   /health                                      # liveness check; GET→200, all other methods→405
GET   /healthz                                     # auth check; valid API key→200, invalid→401

POST  /zoom/connect                                # validate Zoom credentials (no cache)

GET   /meetings/past?days=30&force_refresh=false   # list past meetings
GET   /meetings/{uuid}/participants?force_refresh=false  # attendance report
POST  /meetings                                    # create a scheduled meeting; response includes join_url
POST  /meetings/{id}/registrants                   # bulk register participants
```

All endpoints except `/health` require `Authorization: Bearer <api_key>`.

### `/health` vs `/healthz`

- `/health` — unauthenticated liveness probe. Returns `200` for GET; `405` for all other methods.
- `/healthz` — authenticated readiness check. Returns `200` if the key is valid, `401` if not.

---

## Request Lifecycle

```
Incoming request
  → API key validation (auth.py)
  → Cache check (GET endpoints only)
      Cache hit  → return cached response
      Cache miss → call Zoom API → store in cache → return response
```

---

## Project Structure

```
zoom-api/
├── app/
│   ├── main.py          # FastAPI app, route registration
│   ├── config.py        # Typed settings from env vars
│   ├── auth.py          # API key validation dependency (HTTPBearer)
│   ├── zoom.py          # Zoom API client (token management, all calls)
│   └── cache.py         # TTL cache abstraction
├── tests/
│   ├── conftest.py      # fixtures
│   └── test_main.py     # 23 tests, all passing
├── CLAUDE.md            # project standards and developer guidance
├── Dockerfile           # (pending)
├── requirements.txt
├── requirements-dev.txt
├── pytest.ini
└── .env.example
```

---

## Developer Portal

FastAPI's built-in Swagger UI at `/docs` serves as the developer portal:

- Interactive endpoint testing with auth header support
- Auto-generated request/response schemas from Pydantic models
- No additional build or maintenance overhead

ReDoc also available at `/redoc` for read-only reference documentation.

### OpenAPI Spec

The machine-readable spec is available at `/openapi.json`. All request/response models are fully typed via Pydantic so the spec is auto-generated without manual annotation.

---

## Hosting (Render)

- Connect GitHub repository; Render deploys on push to `main`
- Set environment variables in Render dashboard: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `API_KEY`
- Free tier is sufficient for a small internal team

---

## Open Design Questions

### Participant data transformation — [issue #239](https://github.com/chester-hill-solutions/summerlunchplus-app/issues/239) (resolved)

**Decision:** Return Zoom's raw response for now. A no-op transformation layer will be added before summerlunchplus integration begins, so future normalization can be introduced in one place without touching the route handlers.

### Zoom session link association — per class (resolved)

**Decision:** One Zoom meeting is created per class (not per workshop). Unique per-user registration links are preferred via `POST /meetings/{id}/registrants`; a single shared join URL is acceptable as a fallback.

---

## Future Considerations

### Zoom Token Caching
A new Zoom bearer token is minted on every request. Tokens are valid for one hour — caching the token with a TTL of ~55 minutes would reduce latency and Zoom API calls. Requires only a small change to `zoom.py`.

### Redis Cache
The in-memory cache does not survive process restarts and is not shared across instances. The `cache.py` abstraction layer is designed to make a Redis swap straightforward if needed.

### CI/CD
No pipeline is configured initially. The project structure is ready for a GitHub Actions workflow that runs tests and triggers a Render deploy on merge to `main`.
