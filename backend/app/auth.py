# ── TEMPORARY DEACTIVATION NOTICE ─────────────────────────────────────────────
# Google OAuth token verification has been temporarily bypassed for local/offline testing.
# When BYPASS_GOOGLE_AUTH is set to True, the verify_google_token function automatically
# returns a mock demo user instead of sending external network requests to Google.
# To re-enable Google Auth, set BYPASS_GOOGLE_AUTH = False.
# ──────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import requests as _requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import User

logger = logging.getLogger(__name__)
settings = get_settings()

security = HTTPBearer()


# ─────────────────────────────────────────────────────────────────────────────
# Google token verification
# ─────────────────────────────────────────────────────────────────────────────
BYPASS_GOOGLE_AUTH = False

def verify_google_token(id_token: str) -> Dict[str, Any]:
    """Verify a Google ID token and return the user's info dict.

    Returns a dict with keys: sub, email, name, picture.
    Raises HTTPException 401 on failure.
    """
    if BYPASS_GOOGLE_AUTH:
        logger.info("Bypassing Google OAuth token verification. Returning mock demo user.")
        return {
            "sub": "mock_google_id_123456789",
            "email": "demo.user@example.com",
            "name": "Demo User",
            "picture": "",
        }

    # Original verification logic wrapped in conditional block to avoid code removal
    if not BYPASS_GOOGLE_AUTH:
        try:
            request = google_requests.Request()
            id_info = google_id_token.verify_oauth2_token(
                id_token,
                request,
                settings.GOOGLE_CLIENT_ID,
                clock_skew_in_seconds=10,
            )
            return {
                "sub": id_info.get("sub", ""),
                "email": id_info.get("email", ""),
                "name": id_info.get("name", ""),
                "picture": id_info.get("picture", ""),
            }
        except ValueError as exc:
            logger.warning("Google token verification failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Google ID token",
            ) from exc
        except Exception as exc:
            logger.error("Unexpected error during Google token verification: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not verify Google token",
            ) from exc


# ─────────────────────────────────────────────────────────────────────────────
# JWT helpers
# ─────────────────────────────────────────────────────────────────────────────
def create_access_token(user_id: uuid.UUID, email: str) -> str:
    """Create a signed JWT valid for ACCESS_TOKEN_EXPIRE_MINUTES minutes."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT. Raises HTTPException 401 on failure."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI dependency
# ─────────────────────────────────────────────────────────────────────────────
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract bearer token, decode JWT, and return the authenticated User."""
    token = credentials.credentials
    payload = decode_token(token)

    user_id_str: str | None = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
        )

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user id in token",
        ) from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user: User | None = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user
