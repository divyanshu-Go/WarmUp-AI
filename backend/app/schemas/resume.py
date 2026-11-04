from datetime import datetime

from pydantic import BaseModel


class ResumeUploadResponse(BaseModel):
    id: str
    filename: str
    file_size_bytes: int

    status: str
    processing_stage: str

    candidate_name: str | None
    candidate_email: str | None

    # Only returned for guest uploads.
    claim_token: str | None = None


class ResumeClaimRequest(BaseModel):
    claim_token: str


class ResumeStatusResponse(BaseModel):
    id: str
    filename: str
    file_size_bytes: int

    status: str
    processing_stage: str

    candidate_name: str | None
    candidate_email: str | None

    error_message: str | None
    created_at: datetime