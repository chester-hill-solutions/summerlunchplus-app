# Zoom API Service

A hosted REST API for Zoom meeting management and attendance reporting, with an interactive developer portal (Swagger UI) at `/docs`.

## Prerequisites

- Python 3.11+
- A Zoom account (Pro plan or higher for Reports API)
- A Server-to-Server OAuth app created in Zoom Marketplace

## Zoom Setup

1. Go to https://marketplace.zoom.us/develop/create
2. Choose **Server-to-Server OAuth** → Create
3. Under **Scopes**, add:
   - `report:read:meeting:admin`
   - `report:read:list_history_meetings:admin`
   - `report:read:list_meeting_participants:admin`
   - `meeting:read:meeting:admin`
   - `meeting:write:meeting:admin`
   - `user:read:user:admin`
4. Fill in Contact info, then **Activate** the app
5. Copy your **Account ID**, **Client ID**, and **Client Secret**

## Local Setup

```bash
# 1. Navigate to the zoom-api directory
cd zoom-api

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # macOS / Linux
.venv\Scripts\activate.bat       # Windows (Command Prompt)
.venv\Scripts\Activate.ps1       # Windows (PowerShell)

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables
cp .env.example .env
# Edit .env and fill in your Zoom credentials and API key

# 5. Run the server
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.
Swagger UI (interactive docs) at `http://localhost:8000/docs`.

### Generating an API key

`API_KEY` is a secret you generate yourself. Any strong random string works:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

## Running Tests

```bash
# Install dev dependencies
pip install -r requirements-dev.txt

# Run the test suite
pytest tests/ -v
```

## API Endpoints

All endpoints except `/health` require `Authorization: Bearer <api_key>`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Unauthenticated liveness check |
| `GET` | `/healthz` | Authenticated readiness check |
| `POST` | `/zoom/connect` | Validate Zoom credentials |
| `GET` | `/hosts` | List active Zoom users for host assignment |
| `GET` | `/meetings/past` | List past meetings (`?days=30&force_refresh=false`) |
| `GET` | `/meetings/{uuid}/participants` | Attendance report for a meeting (`?force_refresh=false`) |
| `POST` | `/meetings` | Create a scheduled meeting (`host_zoom_user_id` or `host_zoom_user_email` optional) |
| `PATCH` | `/meetings/{id}` | Update a scheduled meeting (`topic`, `start_time`, `duration`) |
| `POST` | `/meetings/{id}/registrants` | Bulk register participants |
| `DELETE` | `/meetings/{id}/registrants/{registrant_id}` | Remove a registrant from meeting |

Full request/response schemas are documented in Swagger UI at `/docs`.

## Notes

- Reports API requires a **Pro** plan or higher
- Meeting participant reports are available for up to **1 month** after a meeting ends
- Reports become available approximately **15 minutes** after a meeting concludes
- The in-memory cache does not persist across server restarts
