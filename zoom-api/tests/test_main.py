from unittest.mock import Mock, patch


# ── Mock helpers ──────────────────────────────────────────────────────────────

TOKEN_RESP = {"access_token": "fake-bearer-token"}

USER_RESP = {
    "id": "uid-123",
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane@example.com",
}

MEETINGS_RESP = {
    "meetings": [
        {
            "id": "111",
            "uuid": "abc==",
            "topic": "Team Standup",
            "start_time": "2026-05-01T10:00:00Z",
            "duration": 30,
            "participants_count": 5,
        }
    ]
}

PARTICIPANTS_RESP = {
    "participants": [
        {
            "name": "Alice",
            "user_email": "alice@example.com",
            "join_time": "2026-05-01T10:00:00Z",
            "leave_time": "2026-05-01T10:30:00Z",
            "duration": 1800,
        }
    ]
}

CREATE_RESP = {
    "id": 99999,
    "uuid": "meeting-uuid-123",
    "topic": "Q2 Review",
    "start_time": "2026-06-01T14:00:00Z",
    "join_url": "https://zoom.us/j/99999",
}

REG_RESP = {
    "registrant_id": "reg-abc",
    "join_url": "https://zoom.us/w/99999?tk=abc",
}

REGISTRANTS = [
    {"first_name": "Alice", "last_name": "A", "email": "alice@example.com"},
    {"first_name": "Bob",   "last_name": "B", "email": "bob@example.com"},
]


def ok(data):
    m = Mock()
    m.json.return_value = data
    m.raise_for_status.return_value = None
    return m


# ── OpenAPI spec ─────────────────────────────────────────────────────────────

def test_openapi_declares_security_scheme(client):
    schema = client.get("/openapi.json").json()
    assert "HTTPBearer" in schema["components"]["securitySchemes"]


# ── GET /health ───────────────────────────────────────────────────────────────

def test_health(client):
    assert client.get("/health").status_code == 200


def test_health_method_not_allowed(client):
    assert client.post("/health").status_code == 405


# ── GET /healthz ──────────────────────────────────────────────────────────────

def test_healthz_valid_key(client, headers):
    assert client.get("/healthz", headers=headers).status_code == 200


def test_healthz_invalid_key(client):
    assert client.get("/healthz", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_healthz_missing_auth(client):
    assert client.get("/healthz").status_code == 401


# ── POST /zoom/connect ────────────────────────────────────────────────────────

def test_zoom_connect_success(client, headers):
    with patch("app.zoom.httpx.post", return_value=ok(TOKEN_RESP)), \
         patch("app.zoom.httpx.get", return_value=ok(USER_RESP)):
        resp = client.post("/zoom/connect", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "jane@example.com"


def test_zoom_connect_missing_auth(client):
    assert client.post("/zoom/connect").status_code == 401


# ── GET /meetings/past ────────────────────────────────────────────────────────

def test_list_past_meetings_success(client, headers):
    with patch("app.zoom.httpx.post", return_value=ok(TOKEN_RESP)), \
         patch("app.zoom.httpx.get", return_value=ok(MEETINGS_RESP)):
        resp = client.get("/meetings/past?days=7", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["meetings"]) == 1
    assert data["meetings"][0]["topic"] == "Team Standup"
    assert data["meetings"][0]["participants_count"] == 5


def test_list_past_meetings_cache_hit(client, headers):
    with patch("app.zoom.httpx.post", return_value=ok(TOKEN_RESP)), \
         patch("app.zoom.httpx.get", return_value=ok(MEETINGS_RESP)) as mock_get:
        client.get("/meetings/past", headers=headers)
        client.get("/meetings/past", headers=headers)
    assert mock_get.call_count == 1


def test_list_past_meetings_force_refresh(client, headers):
    with patch("app.zoom.httpx.post", return_value=ok(TOKEN_RESP)), \
         patch("app.zoom.httpx.get", return_value=ok(MEETINGS_RESP)) as mock_get:
        client.get("/meetings/past", headers=headers)
        client.get("/meetings/past?force_refresh=true", headers=headers)
    assert mock_get.call_count == 2


def test_list_past_meetings_invalid_auth(client):
    resp = client.get("/meetings/past", headers={"Authorization": "Bearer wrong"})
    assert resp.status_code == 401


def test_list_past_meetings_missing_auth(client):
    assert client.get("/meetings/past").status_code == 401


# ── GET /meetings/{uuid}/participants ─────────────────────────────────────────

def test_get_participants_success(client, headers):
    with patch("app.zoom.httpx.post", return_value=ok(TOKEN_RESP)), \
         patch("app.zoom.httpx.get", return_value=ok(PARTICIPANTS_RESP)):
        resp = client.get("/meetings/abc123/participants", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["participants"][0]["name"] == "Alice"


def test_get_participants_cache_hit(client, headers):
    with patch("app.zoom.httpx.post", return_value=ok(TOKEN_RESP)), \
         patch("app.zoom.httpx.get", return_value=ok(PARTICIPANTS_RESP)) as mock_get:
        client.get("/meetings/abc123/participants", headers=headers)
        client.get("/meetings/abc123/participants", headers=headers)
    assert mock_get.call_count == 1


def test_get_participants_force_refresh(client, headers):
    with patch("app.zoom.httpx.post", return_value=ok(TOKEN_RESP)), \
         patch("app.zoom.httpx.get", return_value=ok(PARTICIPANTS_RESP)) as mock_get:
        client.get("/meetings/abc123/participants", headers=headers)
        client.get("/meetings/abc123/participants?force_refresh=true", headers=headers)
    assert mock_get.call_count == 2


def test_get_participants_missing_auth(client):
    assert client.get("/meetings/abc123/participants").status_code == 401


# ── POST /meetings ────────────────────────────────────────────────────────────

def test_create_meeting_success(client, headers):
    with patch("app.zoom.httpx.post", side_effect=[ok(TOKEN_RESP), ok(CREATE_RESP)]):
        resp = client.post("/meetings", headers=headers, json={
            "topic": "Q2 Review",
            "start_time": "2026-06-01T14:00:00",
            "duration": 60,
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == 99999
    assert data["uuid"] == "meeting-uuid-123"
    assert data["join_url"] == "https://zoom.us/j/99999"


def test_create_meeting_missing_fields(client, headers):
    resp = client.post("/meetings", headers=headers, json={"topic": "Test"})
    assert resp.status_code == 422


def test_create_meeting_missing_auth(client):
    resp = client.post("/meetings", json={
        "topic": "Test", "start_time": "2026-06-01T14:00:00", "duration": 60,
    })
    assert resp.status_code == 401


# ── POST /meetings/{id}/registrants ──────────────────────────────────────────

def test_register_participants_success(client, headers):
    # 1 token fetch + 1 post per registrant = 3 total httpx.post calls
    with patch("app.zoom.httpx.post", side_effect=[ok(TOKEN_RESP), ok(REG_RESP), ok(REG_RESP)]):
        resp = client.post("/meetings/99999/registrants", headers=headers, json=REGISTRANTS)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["join_url"] == "https://zoom.us/w/99999?tk=abc"


def test_register_participants_missing_fields(client, headers):
    resp = client.post("/meetings/99999/registrants", headers=headers,
                       json=[{"email": "alice@example.com"}])
    assert resp.status_code == 422


def test_register_participants_missing_auth(client):
    assert client.post("/meetings/99999/registrants", json=REGISTRANTS).status_code == 401
