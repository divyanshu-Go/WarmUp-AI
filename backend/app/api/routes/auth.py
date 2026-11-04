# backend/app/api/routes/auth.py
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.email_otp import EmailOTP
from app.schemas.auth import GoogleAuthRequest, SendOTPRequest, SendOTPResponse, VerifyOTPRequest, AuthResponse, UserResponse
from app.services.email_service import send_otp_email
from app.api.dependencies import get_current_user

from app.models.user import User
from app.models.user_session import UserSession
from app.services.session_service import (
    create_session,
    get_active_session,
    revoke_session,
)
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token


router = APIRouter(prefix="/api/auth", tags=["Authentication"])

SESSION_COOKIE = "warmup_session"
OTP_EXPIRY_MINUTES = 10


def hash_otp(email: str, otp: str) -> str:
    value = f"{email}:{otp}".encode()
    return hmac.new(
        settings.otp_hash_secret.encode(),
        value,
        hashlib.sha256,
    ).hexdigest()


@router.post("/send-otp", response_model=SendOTPResponse, status_code=202)
def send_otp(
    payload: SendOTPRequest,
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().lower()
    otp = f"{secrets.randbelow(1_000_000):06d}"

    # Invalidate previous unused codes for this email.
    db.execute(
        update(EmailOTP)
        .where(
            EmailOTP.email == email,
            EmailOTP.consumed_at.is_(None),
        )
        .values(consumed_at=datetime.now(timezone.utc))
    )

    challenge = EmailOTP(
        email=email,
        otp_hash=hash_otp(email, otp),
        expires_at=datetime.now(timezone.utc)
        + timedelta(minutes=OTP_EXPIRY_MINUTES),
    )

    db.add(challenge)
    db.commit()

    try:
        send_otp_email(email, otp)
    except Exception:
        # Don't leave a usable code when email delivery fails.
        challenge.consumed_at = datetime.now(timezone.utc)
        db.commit()

        raise HTTPException(
            status_code=503,
            detail={
                "code": "EMAIL_DELIVERY_FAILED",
                "message": "Unable to send the verification email. Please try again.",
            },
        )

    return SendOTPResponse(
        message="If the address can be verified, a code has been sent.",
        expires_in_seconds=OTP_EXPIRY_MINUTES * 60,
    )



def set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=False,  # Local development only
        samesite="lax",
        max_age=settings.session_expiry_days * 86400,
        path="/",
    )


@router.post("/verify-otp", response_model=AuthResponse)
def verify_otp(
    payload: VerifyOTPRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().lower()
    now = datetime.now(timezone.utc)

    challenge = db.scalar(
        select(EmailOTP)
        .where(
            EmailOTP.email == email,
            EmailOTP.consumed_at.is_(None),
        )
        .order_by(EmailOTP.created_at.desc())
        .limit(1)
    )

    if not challenge or challenge.expires_at <= now:
        raise HTTPException(400, "Invalid or expired OTP.")

    if challenge.attempts >= 5:
        raise HTTPException(429, "Too many attempts. Request a new OTP.")

    challenge.attempts += 1

    expected_hash = hash_otp(email, payload.otp)

    if not hmac.compare_digest(challenge.otp_hash, expected_hash):
        db.commit()
        raise HTTPException(400, "Invalid or expired OTP.")

    challenge.consumed_at = now

    user = db.scalar(
        select(User).where(User.email == email)
    )

    if not user:
        user = User(
            email=email,
            email_verified_at=now,
        )
        db.add(user)
        db.flush()
    elif user.email_verified_at is None:
        user.email_verified_at = now

    token, session = create_session(db, user.id)

    # Commit OTP consumption, user creation and session together.
    db.commit()

    set_session_cookie(response, token)

    return AuthResponse(
        message="Authentication successful.",
        user=UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            picture_url=user.picture_url,
        ),
    )


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        picture_url=user.picture_url,
    )


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    token = request.cookies.get(SESSION_COOKIE)

    if token:
        revoke_session(db, token)

    response.delete_cookie(
        key=SESSION_COOKIE,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
    )

    return {"message": "Logged out successfully."}



@router.post("/google", response_model=AuthResponse)
def google_login(
    payload: GoogleAuthRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    # 1. Check Google configuration.
    if not settings.google_client_id:
        raise HTTPException(
            status_code=500,
            detail="Google authentication is not configured.",
        )

    # 2. Verify the ID token with Google.
    try:
        claims = id_token.verify_oauth2_token(
            payload.credential,
            GoogleRequest(),
            settings.google_client_id,
        )
    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="Invalid Google authentication token.",
        )

    # 3. Extract verified identity information.
    google_sub = claims.get("sub")
    email = claims.get("email", "").lower().strip()
    email_verified = claims.get("email_verified")

    if not google_sub or not email or email_verified is not True:
        raise HTTPException(
            status_code=401,
            detail="Google account email is not verified.",
        )

    name = claims.get("name")
    picture_url = claims.get("picture")

    # 4. First, look for an existing Google-linked account.
    user = db.scalar(
        select(User).where(User.google_sub == google_sub)
    )

    if user is None:
        # 5. Check whether this email already exists
        # through our OTP authentication.
        user = db.scalar(
            select(User).where(User.email == email)
        )

        if user:
            # Don't overwrite another Google account association.
            if user.google_sub and user.google_sub != google_sub:
                raise HTTPException(
                    status_code=409,
                    detail="This email is linked to another Google account.",
                )

            # Link the verified Google identity to the existing user.
            user.google_sub = google_sub

            if user.email_verified_at is None:
                user.email_verified_at = datetime.now(timezone.utc)

        else:
            # 6. Create a new WarmUp user.
            user = User(
                email=email,
                google_sub=google_sub,
                name=name,
                picture_url=picture_url,
                email_verified_at=datetime.now(timezone.utc),
            )

            db.add(user)

    # Update profile details for Google-linked users.
    user.name = name or user.name
    user.picture_url = picture_url or user.picture_url

    try:
        # Ensure a newly created user has an ID before creating
        # the session associated with that user.
        db.flush()

        # 7. Create the SAME application session used by OTP login.
        token, _ = create_session(db, user.id)

        db.commit()

    except Exception:
        db.rollback()
        raise

    # 8. Set the existing HttpOnly session cookie.
    set_session_cookie(response, token)

    # 9. Return the normal WarmUp user response.
    return AuthResponse(
        message="Google sign-in successful.",
        user=UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            picture_url=user.picture_url,
        ),
    )
