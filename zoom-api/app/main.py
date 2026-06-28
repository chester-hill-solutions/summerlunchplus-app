import os

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.auth import get_api_key
from app.cache import _participants_cache, _past_meetings_cache, get_cached, set_cached
from app.config import settings
from app.transforms import transform_meetings, transform_participants
from app.zoom import MeetingInProgressError, ZoomClient

app = FastAPI(title="Zoom API Service")


@app.on_event("startup")
def log_runtime_port() -> None:
    print(f"[zoom-api] startup PORT={os.getenv('PORT', '<unset>')}")


def _zoom() -> ZoomClient:
    return ZoomClient(
        account_id=settings.zoom_account_id,
        client_id=settings.zoom_client_id,
        client_secret=settings.zoom_client_secret,
    )


class CreateMeetingRequest(BaseModel):
    topic: str = Field(description="Meeting title.", examples=["Summer Lunch Program - Week 3"])
    start_time: str = Field(
        description="Meeting start time in ISO 8601 format. Include a timezone offset or 'Z' for UTC — "
        "e.g. '2026-06-15T10:00:00Z' (for UTC) or '2026-06-15T10:00:00-04:00' (for EDT). "
        "Bare datetimes with no offset are interpreted as UTC by Zoom.",
        examples=["2026-06-15T10:00:00Z"],
    )
    duration: int = Field(description="Meeting duration in minutes.", examples=[60])
    host_zoom_user_id: str | None = Field(
        default=None,
        description="Optional Zoom host user ID. If omitted, `host_zoom_user_email` can be used."
        " If both are omitted, Zoom API defaults to `me`.",
        examples=["fA1b2C3d4E5f6G7h8I9j"],
    )
    host_zoom_user_email: str | None = Field(
        default=None,
        description="Optional Zoom host user email. If omitted, `host_zoom_user_id` can be used."
        " If both are omitted, Zoom API defaults to `me`.",
        examples=["host1@example.com"],
    )

    @model_validator(mode="after")
    def validate_host_selector(self):
        if self.host_zoom_user_id and self.host_zoom_user_email:
            raise ValueError("Provide only one of host_zoom_user_id or host_zoom_user_email.")
        return self


class CreateMeetingResponse(BaseModel):
    id: int = Field(description="Numeric meeting ID used for registration.")
    uuid: str = Field(description="Unique meeting UUID used for participant reports.")
    join_url: str = Field(description="URL participants use to join the meeting.")


class ZoomUserSummary(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str | None = Field(default=None, description="Zoom user ID.")
    email: str | None = Field(default=None, description="Zoom user email.")
    first_name: str | None = Field(default=None, description="User first name.")
    last_name: str | None = Field(default=None, description="User last name.")


class HostsResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    users: list[ZoomUserSummary] = Field(
        default_factory=list,
        description="Active users available in the connected Zoom account.",
    )


class PastMeeting(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int | str | None = Field(default=None, description="Zoom meeting ID.")
    uuid: str | None = Field(default=None, description="Zoom meeting UUID.")
    topic: str | None = Field(default=None, description="Meeting topic.")
    start_time: str | None = Field(default=None, description="Meeting start time.")
    duration: int | None = Field(default=None, description="Meeting duration in minutes.")
    participants_count: int | None = Field(default=None, description="Number of participants.")


class PastMeetingsResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    meetings: list[PastMeeting] = Field(default_factory=list, description="List of past meetings.")


class ParticipantReportRow(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str | None = Field(default=None, description="Participant display name.")
    user_email: str | None = Field(default=None, description="Participant email, when available.")
    join_time: str | None = Field(default=None, description="Participant join timestamp.")
    leave_time: str | None = Field(default=None, description="Participant leave timestamp.")
    duration: int | None = Field(default=None, description="Session duration in seconds.")


class ParticipantsResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    participants: list[ParticipantReportRow] = Field(
        default_factory=list,
        description="Participant rows for the meeting report.",
    )


class Registrant(BaseModel):
    first_name: str = Field(description="Registrant's first name.", examples=["Jane"])
    last_name: str = Field(description="Registrant's last name.", examples=["Doe"])
    email: str = Field(description="Registrant's email address.", examples=["jane.doe@example.com"])


# --- Liveness / auth checks ---

@app.get("/health")
def health() -> dict[str, str]:
    """Unauthenticated liveness check. Returns `{"status": "ok"}` if the server is running."""
    return {"status": "ok"}


@app.get("/healthz", dependencies=[Depends(get_api_key)])
def healthz() -> dict[str, str]:
    """Authenticated readiness check. Returns `{"status": "ok"}` if the server is running and the API key is valid."""
    return {"status": "ok"}


# --- Zoom credential check ---


def _as_http_exception(exc: httpx.HTTPStatusError) -> HTTPException:
    status = exc.response.status_code
    if status == 404:
        detail = "Zoom resource not found. Check meeting/user identifiers."
    elif status == 403:
        detail = "Zoom access forbidden for this operation."
    elif status == 429:
        detail = "Zoom rate limit exceeded. Retry shortly."
    else:
        detail = f"Zoom API request failed with status {status}."
    return HTTPException(status_code=status, detail=detail)

@app.post("/zoom/connect", dependencies=[Depends(get_api_key)])
def zoom_connect() -> ZoomUserSummary:
    """Validates the configured Zoom Server-to-Server OAuth credentials by calling the Zoom /users/me endpoint.
    Returns the full Zoom user profile on success, or raises an HTTP error if credentials are invalid.
    """
    try:
        return _zoom().validate_credentials()
    except httpx.HTTPStatusError as exc:
        raise _as_http_exception(exc) from exc


@app.get("/hosts", dependencies=[Depends(get_api_key)], response_model=HostsResponse)
def list_hosts() -> HostsResponse:
    """Lists active users in the connected Zoom account for host selection."""
    try:
        return _zoom().list_hosts()
    except httpx.HTTPStatusError as exc:
        raise _as_http_exception(exc) from exc


# --- Meetings ---

@app.get("/meetings/past", dependencies=[Depends(get_api_key)])
def list_past_meetings(
    days: int = Query(default=30, ge=1, le=365, description="Number of days to look back for past meetings."),
    force_refresh: bool = Query(default=False, description="Bypass the in-memory cache and fetch fresh data from Zoom."),
) -> PastMeetingsResponse:
    """Returns a list of past meetings for the authenticated Zoom user within the specified date range.
    Results are cached in memory; use `force_refresh=true` to bypass the cache.
    Response shape mirrors the Zoom Reports API: a `meetings` array with id, uuid, topic, start_time, and duration per meeting.
    """
    cache_key = f"past_meetings:{days}"
    if not force_refresh:
        cached = get_cached(_past_meetings_cache, cache_key)
        if cached is not None:
            return cached
    try:
        result = _zoom().list_past_meetings(days=days)
    except httpx.HTTPStatusError as exc:
        raise _as_http_exception(exc) from exc
    set_cached(_past_meetings_cache, cache_key, result)
    return transform_meetings(result)


@app.get("/meetings/{uuid}/participants", dependencies=[Depends(get_api_key)], response_model=ParticipantsResponse)
def get_participants(
    uuid: str,
    force_refresh: bool = Query(default=False, description="Bypass the in-memory cache and fetch fresh data from Zoom."),
) -> ParticipantsResponse:
    """Returns the participant attendance report for a completed meeting.
    The `uuid` must be double-URL-encoded if it contains special characters (handled automatically by this service).
    Results are cached in memory; use `force_refresh=true` to bypass the cache.
    Response shape mirrors the Zoom Reports API: a `participants` array with name, user_email, join_time, and leave_time per attendee.
    Returns 409 if the meeting is still in progress or the report has not yet been generated.
    """
    cache_key = f"participants:{uuid}"
    if not force_refresh:
        cached = get_cached(_participants_cache, cache_key)
        if cached is not None:
            return cached
    try:
        result = _zoom().get_participants(uuid)
    except httpx.HTTPStatusError as exc:
        raise _as_http_exception(exc) from exc
    except MeetingInProgressError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    set_cached(_participants_cache, cache_key, result)
    return transform_participants(result)


@app.post("/meetings", dependencies=[Depends(get_api_key)])
def create_meeting(body: CreateMeetingRequest) -> CreateMeetingResponse:
    """Creates a scheduled Zoom meeting for the authenticated user.
    Returns the numeric meeting `id` (used for registration), the `uuid` (used for participant reports), and the `join_url`.
    """
    try:
        result = _zoom().create_meeting(
            topic=body.topic,
            start_time=body.start_time,
            duration=body.duration,
            host_zoom_user_id=body.host_zoom_user_id,
            host_zoom_user_email=body.host_zoom_user_email,
        )
    except httpx.HTTPStatusError as exc:
        raise _as_http_exception(exc) from exc
    return {"id": result["id"], "uuid": result["uuid"], "join_url": result["join_url"]}


@app.post("/meetings/{meeting_id}/registrants", dependencies=[Depends(get_api_key)])
def register_participants(meeting_id: str, registrants: list[Registrant]) -> list[dict]:
    """Bulk-registers a list of participants for a scheduled meeting.
    Use the numeric meeting `id` (not the uuid) from `POST /meetings` as `meeting_id`.
    Each registrant is registered individually; results are returned as a list of Zoom registrant response objects.
    """
    try:
        return _zoom().register_participants(
            meeting_id=meeting_id,
            registrants=[r.model_dump() for r in registrants],
        )
    except httpx.HTTPStatusError as exc:
        raise _as_http_exception(exc) from exc
