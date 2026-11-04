import hmac
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Header,
    HTTPException,
    UploadFile,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_current_user,
    get_optional_current_user,
)
from app.core.config import settings
from app.db.session import get_db
from app.models.resume import Resume
from app.models.user import User
from app.schemas.resume import (
    ResumeClaimRequest,
    ResumeStatusResponse,
    ResumeUploadResponse,
)
from app.services.resume_service import (
    create_claim_token,
    extract_basic_information,
    extract_resume_text,
    get_guest_expiry,
    get_storage_directory,
    hash_claim_token,
    save_resume_file,
)


router = APIRouter(
    prefix="/api/resumes",
    tags=["Resumes"],
)


def get_resume_response(resume: Resume):
    return ResumeStatusResponse(
        id=str(resume.id),
        filename=resume.original_filename,
        file_size_bytes=resume.file_size_bytes,
        status=resume.status,
        processing_stage=resume.processing_stage,
        candidate_name=resume.candidate_name,
        candidate_email=resume.candidate_email,
        error_message=resume.error_message,
        created_at=resume.created_at,
    )


def verify_guest_access(
    resume: Resume,
    claim_token: str | None,
):
    if resume.user_id is not None:
        raise HTTPException(404, "Resume not found.")

    if not resume.expires_at or resume.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(410, "This temporary resume has expired.")

    if not claim_token or not resume.claim_token_hash:
        raise HTTPException(401, "Resume access token required.")

    if not hmac.compare_digest(
        resume.claim_token_hash,
        hash_claim_token(claim_token),
    ):
        raise HTTPException(401, "Invalid resume access token.")


@router.post(
    "/upload",
    response_model=ResumeUploadResponse,
    status_code=201,
)
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            400,
            "Please upload a PDF resume.",
        )

    resume_id = uuid.uuid4()

    storage_path, file_size = await save_resume_file(
        file,
        resume_id,
    )

    try:
        resume_text = extract_resume_text(storage_path)
        basic_info = extract_basic_information(resume_text)

    except HTTPException:
        # Do not keep invalid or unprocessable uploads.
        (get_storage_directory() / storage_path).unlink(missing_ok=True)
        raise

    claim_token = None
    claim_token_hash = None
    expires_at = None

    if user is None:
        claim_token, claim_token_hash = create_claim_token()
        expires_at = get_guest_expiry()

    resume = Resume(
        id=resume_id,
        user_id=user.id if user else None,
        original_filename=Path(file.filename).name[:255],
        storage_path=storage_path,
        file_size_bytes=file_size,
        claim_token_hash=claim_token_hash,
        expires_at=expires_at,
        status="awaiting_auth" if user is None else "ready_for_details",
        processing_stage="authentication" if user is None else "authentication_complete",
        candidate_name=basic_info["candidate_name"],
        candidate_email=basic_info["candidate_email"],
        resume_text=resume_text,
    )

    try:
        db.add(resume)
        db.commit()
        db.refresh(resume)

    except Exception:
        db.rollback()
        (get_storage_directory() / storage_path).unlink(missing_ok=True)
        raise

    return ResumeUploadResponse(
        id=str(resume.id),
        filename=resume.original_filename,
        file_size_bytes=resume.file_size_bytes,
        status=resume.status,
        processing_stage=resume.processing_stage,
        candidate_name=resume.candidate_name,
        candidate_email=resume.candidate_email,
        claim_token=claim_token,
    )


@router.get(
    "/{resume_id}",
    response_model=ResumeStatusResponse,
)
def get_resume_status(
    resume_id: uuid.UUID,
    claim_token: str | None = Header(
        default=None,
        alias="X-Resume-Claim-Token",
    ),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_current_user),
):
    resume = db.get(Resume, resume_id)

    if not resume:
        raise HTTPException(404, "Resume not found.")

    if user:
        if resume.user_id != user.id:
            raise HTTPException(404, "Resume not found.")
    else:
        verify_guest_access(resume, claim_token)

    return get_resume_response(resume)


@router.post(
    "/{resume_id}/claim",
    response_model=ResumeStatusResponse,
)
def claim_resume(
    resume_id: uuid.UUID,
    payload: ResumeClaimRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resume = db.scalar(
        select(Resume)
        .where(Resume.id == resume_id)
        .with_for_update()
    )

    if not resume:
        raise HTTPException(404, "Resume not found.")

    # Allow a retry if this resume is already owned by this user.
    if resume.user_id == user.id:
        return get_resume_response(resume)

    if resume.user_id is not None:
        raise HTTPException(404, "Resume not found.")

    verify_guest_access(resume, payload.claim_token)

    resume.user_id = user.id
    resume.claim_token_hash = None
    resume.expires_at = None

    resume.status = "ready_for_details"
    resume.processing_stage = "authentication_complete"

    db.commit()
    db.refresh(resume)

    return get_resume_response(resume)