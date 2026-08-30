from datetime import datetime, timedelta, timezone
from secrets import compare_digest
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

settings = get_settings()
security = HTTPBearer(auto_error=False)

DEMO_USERS = {
    "admin": {"id": "ADMIN-001", "name": "Assam Control Room", "role": "ADMIN"},
    "driver": {"id": "MED-001", "name": "Rahul Das", "role": "DRIVER"},
    "field": {"id": "FO-014", "name": "Field Officer 014", "role": "FIELD_OFFICER"},
}


def authenticate(username: str, password: str) -> dict | None:
    passwords = {
        "admin": settings.demo_admin_password,
        "driver": settings.demo_driver_password,
        "field": settings.demo_field_password,
    }
    user = DEMO_USERS.get(username)
    expected = passwords.get(username)
    if not user or not expected or not compare_digest(password, expected):
        return None
    return {"username": username, **user}


def create_access_token(user: dict) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": user["username"], "role": user["role"], "name": user["name"], "exp": expires},
        settings.jwt_secret,
        algorithm="HS256",
    )


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = decode_token(credentials.credentials)
    user = DEMO_USERS.get(payload.get("sub", ""))
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return {"username": payload["sub"], **user}


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


def require_roles(*roles: str):
    def dependency(user: Annotated[dict, Depends(current_user)]) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Role is not allowed for this action")
        return user
    return dependency
