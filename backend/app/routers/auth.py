from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, verify_google_token
from app.database import get_db
from app.models import User
from app.schemas import GoogleAuthRequest, TokenResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/google", response_model=TokenResponse)
async def google_login(
    body: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Verify a Google ID token and return a JWT + user info.

    Creates the user record on first login; updates name/avatar on subsequent logins.
    """
    google_info = verify_google_token(body.id_token)

    google_id: str = google_info["sub"]
    email: str = google_info["email"]
    full_name: str = google_info.get("name", "")
    avatar_url: str = google_info.get("picture", "")

    # ── Look up existing user by google_id ────────────────────────────────────
    result = await db.execute(select(User).where(User.google_id == google_id))
    user: User | None = result.scalar_one_or_none()

    if user is None:
        # First login – create user
        user = User(
            google_id=google_id,
            email=email,
            full_name=full_name or None,
            avatar_url=avatar_url or None,
        )
        db.add(user)
        await db.flush()
        logger.info("New user created: %s", email)
    else:
        # Subsequent login – refresh mutable fields
        user.full_name = full_name or user.full_name
        user.avatar_url = avatar_url or user.avatar_url
        logger.info("Existing user logged in: %s", email)

    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id, user.email)

    return TokenResponse(
        access_token=access_token,
        user_id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
    )
