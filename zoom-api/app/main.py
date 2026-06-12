from fastapi import Depends, FastAPI, Query
from pydantic import BaseModel, Field

from app.auth import get_api_key
from app.cache import _participants_cache, _past_meetings_cache, get_cached, set_cached
from app.config import settings
from app.transforms import transform_meetings, transform_participants
from app.zoom import ZoomClient

app = FastAPI(title="Zoom API Service")


def _zoom() -> ZoomClient:
    return ZoomClient(
        account_id=settings.zoom_account_id,
        client_id=settings.zoom_client_id,
        client_secret=settings.zoom_client_secret,
    )


class CreateMeetingRequest(BaseModel):
    topic: str
    start_time: str = Field(
        description="Meeting start time in ISO 8601 format. Include a timezone offset or 'Z' for UTC — "
        "e.g. '2026-06-15T10:00:00Z' (for UTC) or '2026-06-15T10:00:00-04:00' (for EDT). "
        "Bare datetimes with no offset are interpreted as UTC by Zoom.",
        examples=["2026-06-15T10:00:00Z"],
    )
    duration: int    # minutes


class Registrant(BaseModel):
    first_name: str
    last_name: str
    email: str


# --- Liveness / auth checks ---

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/healthz", dependencies=[Depends(get_api_key)])
def healthz():
    return {"status": "ok"}


# --- Zoom credential check ---

@app.post("/zoom/connect", dependencies=[Depends(get_api_key)])
def zoom_connect():
    return _zoom().validate_credentials()


# --- Meetings ---

@app.get("/meetings/past", dependencies=[Depends(get_api_key)])
def list_past_meetings(
    days: int = Query(default=30, ge=1, le=365),
    force_refresh: bool = Query(default=False),
):
    cache_key = f"past_meetings:{days}"
    if not force_refresh:
        cached = get_cached(_past_meetings_cache, cache_key)
        if cached is not None:
            return cached
    result = _zoom().list_past_meetings(days=days)
    set_cached(_past_meetings_cache, cache_key, result)
    return transform_meetings(result)


@app.get("/meetings/{uuid}/participants", dependencies=[Depends(get_api_key)])
def get_participants(
    uuid: str,
    force_refresh: bool = Query(default=False),
):
    cache_key = f"participants:{uuid}"
    if not force_refresh:
        cached = get_cached(_participants_cache, cache_key)
        if cached is not None:
            return cached
    result = _zoom().get_participants(uuid)
    set_cached(_participants_cache, cache_key, result)
    return transform_participants(result)


@app.post("/meetings", dependencies=[Depends(get_api_key)])
def create_meeting(body: CreateMeetingRequest):
    result = _zoom().create_meeting(
        topic=body.topic,
        start_time=body.start_time,
        duration=body.duration,
    )
    return {"id": result["id"], "uuid": result["uuid"], "join_url": result["join_url"]}


@app.post("/meetings/{meeting_id}/registrants", dependencies=[Depends(get_api_key)])
def register_participants(meeting_id: str, registrants: list[Registrant]):
    return _zoom().register_participants(
        meeting_id=meeting_id,
        registrants=[r.model_dump() for r in registrants],
    )
