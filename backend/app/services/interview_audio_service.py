from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.config import settings


CHUNK_SIZE = 1024 * 1024
SUPPORTED_AUDIO_TYPES = {
    ".flac": {"audio/flac", "audio/x-flac", "application/octet-stream"},
    ".m4a": {"audio/mp4", "audio/x-m4a", "application/octet-stream"},
    ".mp3": {"audio/mpeg", "audio/mp3", "application/octet-stream"},
    ".mp4": {"audio/mp4", "video/mp4", "application/octet-stream"},
    ".mpeg": {"audio/mpeg", "application/octet-stream"},
    ".mpga": {"audio/mpeg", "application/octet-stream"},
    ".ogg": {"audio/ogg", "application/ogg", "application/octet-stream"},
    ".wav": {"audio/wav", "audio/x-wav", "application/octet-stream"},
    ".webm": {
        "audio/webm",
        "video/webm",
        "application/octet-stream",
    },
}


async def read_validated_answer_audio(file: UploadFile) -> tuple[str, bytes]:
    """Validate browser recording format and 4 MB limit, returning (filename, bytes) in RAM."""
    filename = Path(file.filename or "answer.webm").name
    extension = Path(filename).suffix.lower()
    accepted_content_types = SUPPORTED_AUDIO_TYPES.get(extension)

    if not accepted_content_types:
        raise HTTPException(
            415,
            "Unsupported audio format. Upload a WAV, WebM, MP3, M4A, MP4, OGG, or FLAC recording.",
        )

    content_type = (file.content_type or "").lower().split(";", 1)[0].strip()

    if content_type not in accepted_content_types:
        raise HTTPException(415, "The uploaded file type does not match its format.")

    max_size = settings.interview_max_answer_audio_mb * 1024 * 1024
    buffer = bytearray()

    try:
        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break

            buffer.extend(chunk)

            if len(buffer) > max_size:
                raise HTTPException(
                    413,
                    f"Recording must be smaller than {settings.interview_max_answer_audio_mb} MB.",
                )

        if not buffer:
            raise HTTPException(400, "The uploaded recording is empty.")

        return filename, bytes(buffer)
    finally:
        await file.close()