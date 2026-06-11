from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

_bearer = HTTPBearer()


def get_api_key(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> None:
    if credentials.credentials != settings.api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
