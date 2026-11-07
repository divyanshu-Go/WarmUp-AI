import uuid
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


def save_answer_audio(file: UploadFile) -> str:
    extension = Path(file.filename or "").suffix.lower()
    accepted_content_types = SUPPORTED_AUDIO_TYPES.get(extension)

    if not accepted_content_types:
        raise HTTPException(
            415,
            "Unsupported audio format. Upload a WAV, WebM, MP3, M4A, MP4, OGG, or FLAC recording.",
        )

    content_type = (file.content_type or "").lower().split(";", 1)[0].strip()

    if content_type not in accepted_content_types:
        raise HTTPException(415, "The uploaded file type does not match its format.")

    storage_directory = Path(
        settings.interview_answer_audio_storage_dir
    ).resolve()
    filename = f"{uuid.uuid4()}{extension}"
    audio_path = storage_directory / filename
    max_size = settings.interview_max_answer_audio_mb * 1024 * 1024
    total_size = 0

    try:
        storage_directory.mkdir(parents=True, exist_ok=True)

        with audio_path.open("wb") as output:
            while True:
                chunk = file.file.read(CHUNK_SIZE)

                if not chunk:
                    break

                total_size += len(chunk)

                if total_size > max_size:
                    raise HTTPException(
                        413,
                        "The recording exceeds the maximum allowed size.",
                    )

                output.write(chunk)

        if total_size == 0:
            raise HTTPException(400, "The uploaded recording is empty.")

        return filename
    except Exception:
        audio_path.unlink(missing_ok=True)
        raise
    finally:
        file.file.close()


def get_answer_audio_path(filename: str) -> Path:
    storage_directory = Path(
        settings.interview_answer_audio_storage_dir
    ).resolve()
    audio_path = (storage_directory / filename).resolve()

    if audio_path.parent != storage_directory or not audio_path.is_file():
        raise HTTPException(404, "Answer audio not found.")

    return audio_path


def delete_answer_audio(filename: str) -> None:
    storage_directory = Path(
        settings.interview_answer_audio_storage_dir
    ).resolve()
    audio_path = (storage_directory / filename).resolve()

    if audio_path.parent == storage_directory:
        audio_path.unlink(missing_ok=True)
