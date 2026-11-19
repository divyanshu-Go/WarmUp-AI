import hashlib
import io
import logging
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import cloudinary
import cloudinary.uploader
from cloudinary.exceptions import AuthorizationRequired
from fastapi import HTTPException, UploadFile
from pypdf import PdfReader

from app.core.config import settings


logger = logging.getLogger(__name__)

EMAIL_PATTERN = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)

MAX_FILE_SIZE = settings.resume_max_size_mb * 1024 * 1024
CHUNK_SIZE = 1024 * 1024
CLOUDINARY_FOLDER = "warmup/resumes"


def _configure_cloudinary() -> None:
    if not (
        settings.cloudinary_cloud_name
        and settings.cloudinary_api_key
        and settings.cloudinary_api_secret
    ):
        raise HTTPException(
            status_code=503,
            detail="Resume storage service is not configured.",
        )

    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name.strip(),
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )


def hash_claim_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_claim_token():
    token = secrets.token_urlsafe(32)
    return token, hash_claim_token(token)


async def read_validated_resume_bytes(file: UploadFile) -> bytes:
    """Read and validate PDF bytes in RAM within the 4 MB serverless cap."""
    buffer = bytearray()
    first_chunk = True

    try:
        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break

            buffer.extend(chunk)

            if len(buffer) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"Resume must be smaller than {settings.resume_max_size_mb} MB.",
                )

            if first_chunk:
                first_chunk = False
                if not chunk.startswith(b"%PDF-"):
                    raise HTTPException(
                        status_code=400,
                        detail="The uploaded file is not a valid PDF.",
                    )

        if not buffer:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty.",
            )

        return bytes(buffer)
    finally:
        await file.close()


def extract_resume_text(pdf_bytes: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))

        if reader.is_encrypted:
            raise HTTPException(
                status_code=400,
                detail="Password-protected PDFs are not supported.",
            )

        if len(reader.pages) > 50:
            raise HTTPException(
                status_code=400,
                detail="Resume PDF must contain 50 pages or fewer.",
            )

        text_parts = []
        for page in reader.pages:
            text = page.extract_text() or ""
            if text.strip():
                text_parts.append(text)

        resume_text = "\n".join(text_parts).strip()

        if not resume_text:
            raise HTTPException(
                status_code=422,
                detail=(
                    "We couldn't extract text from this PDF. "
                    "It may be scanned or image-based."
                ),
            )

        return resume_text

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=422,
            detail="Unable to read this PDF. Please upload a valid resume.",
        )


def upload_resume_to_cloudinary(
    pdf_bytes: bytes,
    resume_id: uuid.UUID,
) -> tuple[str, str]:
    """Upload a validated PDF and return its secure URL and Cloudinary public ID."""
    _configure_cloudinary()

    try:
        filename = f"{resume_id}.pdf"
        result = cloudinary.uploader.upload(
            io.BytesIO(pdf_bytes),
            resource_type="raw",
            folder=CLOUDINARY_FOLDER,
            public_id=filename,
            overwrite=True,
            filename=filename,
        )
        secure_url = result.get("secure_url")
        public_id = result.get("public_id")
        if not secure_url or not public_id:
            raise RuntimeError("Cloudinary response is missing asset metadata.")
        return secure_url, public_id
    except HTTPException:
        raise
    except AuthorizationRequired as exc:
        logger.exception("Cloudinary rejected resume storage configuration.")
        raise HTTPException(
            status_code=503,
            detail=(
                "Resume storage is misconfigured. Check the Cloudinary cloud name "
                "and API credentials."
            ),
        ) from exc
    except Exception as exc:
        logger.exception("Cloudinary resume upload failed.")
        raise HTTPException(
            status_code=502,
            detail="Unable to upload resume file to cloud storage. Please try again.",
        ) from exc


def delete_resume_from_cloudinary(public_id: str) -> None:
    """Best-effort cleanup if the database commit fails after Cloudinary upload."""
    try:
        _configure_cloudinary()
        result = cloudinary.uploader.destroy(public_id, resource_type="raw")
        if result.get("result") not in {"ok", "not found"}:
            logger.error(
                "Cloudinary resume cleanup returned an unexpected result (%s).",
                result.get("result", "missing"),
            )
    except Exception:
        logger.exception("Cloudinary resume cleanup failed after database rollback.")


def extract_basic_information(resume_text: str):
    """
    Basic extraction only. Name detection is a heuristic, not AI analysis.
    """
    email_match = EMAIL_PATTERN.search(resume_text)
    candidate_email = email_match.group(0).lower() if email_match else None

    lines = [line.strip() for line in resume_text.splitlines() if line.strip()]
    candidate_name = None

    if lines:
        first_line = lines[0]
        if (
            len(first_line) <= 120
            and "@" not in first_line
            and not first_line.lower().startswith("http")
        ):
            candidate_name = first_line

    return {
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
    }


def get_guest_expiry():
    return datetime.now(timezone.utc) + timedelta(
        hours=settings.guest_resume_expiry_hours
    )