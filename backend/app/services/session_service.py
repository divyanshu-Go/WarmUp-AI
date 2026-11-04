# backend/app/services/session_service.py
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user_session import UserSession


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user_id):
    # Generate an unpredictable session token.
    token = secrets.token_urlsafe(32)

    session = UserSession(
        user_id=user_id,
        token_hash=hash_token(token),
        expires_at=datetime.now(timezone.utc)
        + timedelta(days=settings.session_expiry_days),
    )

    db.add(session)
    db.flush()

    return token, session


def get_active_session(db: Session, token: str):
    statement = select(UserSession).where(
        UserSession.token_hash == hash_token(token),
        UserSession.revoked_at.is_(None),
        UserSession.expires_at > datetime.now(timezone.utc),
    )

    return db.scalar(statement)


def revoke_session(db: Session, token: str):
    session = get_active_session(db, token)

    if session:
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()
