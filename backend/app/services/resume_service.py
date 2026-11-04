import hashlib
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile
from pypdf import PdfReader

from app.core.config import settings


EMAIL_PATTERN = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)

MAX_FILE_SIZE = settings.resume_max_size_mb * 1024 * 1024
CHUNK_SIZE = 1024 * 1024


def hash_claim_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_claim_token():
    token = secrets.token_urlsafe(32)
    return token, hash_claim_token(token)


def get_storage_directory() -> Path:
    directory = Path(settings.resume_storage_dir).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    return directory


async def save_resume_file(file: UploadFile, resume_id: uuid.UUID):
    """
    Save a PDF privately without loading the entire file into memory.
    Returns (relative_path, file_size).
    """
    filename = f"{resume_id}.pdf"
    storage_path = get_storage_directory() / filename

    total_size = 0
    first_chunk = True

    try:
        with storage_path.open("wb") as output:
            while True:
                chunk = await file.read(CHUNK_SIZE)

                if not chunk:
                    break

                total_size += len(chunk)

                if total_size > MAX_FILE_SIZE:
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

                output.write(chunk)

        if total_size == 0:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty.",
            )

        return filename, total_size

    except Exception:
        storage_path.unlink(missing_ok=True)
        raise

    finally:
        await file.close()


def extract_resume_text(storage_path: str) -> str:
    file_path = get_storage_directory() / storage_path

    try:
        reader = PdfReader(str(file_path))

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


def extract_basic_information(resume_text: str):
    """
    Basic extraction only. Name detection is a heuristic, not AI analysis.
    """
    email_match = EMAIL_PATTERN.search(resume_text)

    candidate_email = (
        email_match.group(0).lower()
        if email_match
        else None
    )

    lines = [
        line.strip()
        for line in resume_text.splitlines()
        if line.strip()
    ]

    candidate_name = None

    if lines:
        first_line = lines[0]

        # Avoid treating an email or URL as the candidate's name.
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