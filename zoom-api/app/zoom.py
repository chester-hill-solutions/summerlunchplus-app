from base64 import b64encode
from time import monotonic
from urllib.parse import quote

import httpx

ZOOM_OAUTH_URL = "https://zoom.us/oauth/token"
ZOOM_API_BASE = "https://api.zoom.us/v2"


class MeetingInProgressError(Exception):
    pass


class ZoomClient:
    def __init__(self, account_id: str, client_id: str, client_secret: str):
        self.account_id = account_id
        self.client_id = client_id
        self.client_secret = client_secret
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    def _get_token(self) -> str:
        if self._token and monotonic() < self._token_expires_at:
            return self._token

        credentials = b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        response = httpx.post(
            ZOOM_OAUTH_URL,
            params={"grant_type": "account_credentials", "account_id": self.account_id},
            headers={"Authorization": f"Basic {credentials}"},
        )
        response.raise_for_status()
        payload = response.json()
        self._token = payload["access_token"]
        expires_in = int(payload.get("expires_in", 3600))
        self._token_expires_at = monotonic() + max(0, expires_in - 60)
        return self._token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._get_token()}"}

    def validate_credentials(self) -> dict:
        r = httpx.get(f"{ZOOM_API_BASE}/users/me", headers=self._headers())
        r.raise_for_status()
        return r.json()

    def create_meeting(
        self,
        topic: str,
        start_time: str,
        duration: int,
        host_zoom_user_id: str | None = None,
        host_zoom_user_email: str | None = None,
    ) -> dict:
        payload = {
            "topic": topic,
            "type": 2,  # scheduled
            "start_time": start_time,
            "duration": duration,
            "settings": {"approval_type": 0, "registration_type": 1},
        }
        user_id = "me"
        if isinstance(host_zoom_user_id, str) and host_zoom_user_id.strip():
            user_id = host_zoom_user_id.strip()
        elif isinstance(host_zoom_user_email, str) and host_zoom_user_email.strip():
            user_id = host_zoom_user_email.strip()

        encoded_user_id = quote(user_id, safe="")
        r = httpx.post(f"{ZOOM_API_BASE}/users/{encoded_user_id}/meetings", json=payload, headers=self._headers())
        r.raise_for_status()
        return r.json()

    def update_meeting(self, meeting_id: str, topic: str, start_time: str, duration: int) -> dict:
        payload = {
            "topic": topic,
            "start_time": start_time,
            "duration": duration,
        }
        r = httpx.patch(
            f"{ZOOM_API_BASE}/meetings/{meeting_id}",
            json=payload,
            headers=self._headers(),
        )
        r.raise_for_status()
        return {"ok": True}

    def list_hosts(self) -> dict:
        r = httpx.get(
            f"{ZOOM_API_BASE}/users",
            params={"page_size": 300, "status": "active"},
            headers=self._headers(),
        )
        r.raise_for_status()
        return r.json()

    def register_participants(self, meeting_id: str, registrants: list[dict]) -> list[dict]:
        results = []
        headers = self._headers()
        for person in registrants:
            r = httpx.post(
                f"{ZOOM_API_BASE}/meetings/{meeting_id}/registrants",
                json=person,
                headers=headers,
            )
            r.raise_for_status()
            results.append(r.json())
        return results

    def remove_registrant(self, meeting_id: str, registrant_id: str) -> dict:
        encoded_registrant_id = quote(registrant_id, safe="")
        r = httpx.delete(
            f"{ZOOM_API_BASE}/meetings/{meeting_id}/registrants/{encoded_registrant_id}",
            headers=self._headers(),
        )
        r.raise_for_status()
        return {"ok": True}

    def list_past_meetings(self, user_id: str = "me", days: int = 30) -> dict:
        from datetime import date, timedelta
        end = date.today().isoformat()
        start = (date.today() - timedelta(days=days)).isoformat()
        r = httpx.get(
            f"{ZOOM_API_BASE}/report/users/{user_id}/meetings",
            params={"from": start, "to": end, "page_size": 300},
            headers=self._headers(),
        )
        r.raise_for_status()
        return r.json()

    def get_participants(self, meeting_uuid: str) -> dict:
        encoded = quote(quote(meeting_uuid, safe=""), safe="")
        r = httpx.get(
            f"{ZOOM_API_BASE}/report/meetings/{encoded}/participants",
            params={"page_size": 300},
            headers=self._headers(),
        )
        try:
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400:
                raise MeetingInProgressError(
                    "Meeting report not available. The meeting may still be in progress, "
                    "or the report may not yet have been generated."
                ) from e
            raise
        return r.json()
