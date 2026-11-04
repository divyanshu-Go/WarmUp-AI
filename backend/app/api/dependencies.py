from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.services.session_service import get_active_session


SESSION_COOKIE = "warmup_session"


def get_optional_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)

    # No cookie means guest upload.
    if not token:
        return None

    session = get_active_session(db, token)

    if not session:
        raise HTTPException(401, "Session expired or invalid.")

    user = db.get(User, session.user_id)

    if not user:
        raise HTTPException(401, "User not found.")

    return user


def get_current_user(
    user: User | None = Depends(get_optional_current_user),
) -> User:
    if not user:
        raise HTTPException(401, "Not authenticated.")

    return user