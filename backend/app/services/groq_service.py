# backend/app/services/groq_service.py
import uuid
from pathlib import Path

from groq import Groq, GroqError

from app.core.config import settings


class GroqNotConfiguredError(Exception):
    pass


class GroqProviderError(Exception):
    pass


class AudioStorageError(Exception):
    pass


_client: Groq | None = None


def _get_client() -> Groq:
    """Reuse one configured Groq client for interview audio requests."""
    global _client

    if not settings.groq_api_key.strip():
        raise GroqNotConfiguredError

    if _client is None:
        _client = Groq(api_key=settings.groq_api_key)

    return _client


def generate_question_speech(question_text: str) -> str:
    """Store generated speech privately; the API serves it to the authenticated user."""
    storage_directory = Path(settings.interview_audio_storage_dir).resolve()
    audio_filename = f"{uuid.uuid4()}.wav"
    audio_path = storage_directory / audio_filename

    try:
        storage_directory.mkdir(parents=True, exist_ok=True)
        response = _get_client().audio.speech.create(
            model=settings.groq_tts_model,
            voice=settings.groq_tts_voice,
            response_format="wav",
            input=question_text,
        )
        response.write_to_file(audio_path)
    except GroqError as exc:
        audio_path.unlink(missing_ok=True)
        raise GroqProviderError from exc
    except OSError as exc:
        audio_path.unlink(missing_ok=True)
        raise AudioStorageError from exc

    return audio_filename


def transcribe_answer_audio(audio_path: Path) -> str:
    """Send the saved browser recording to Groq and return its recognized text."""
    try:
        with audio_path.open("rb") as audio_file:
            response = _get_client().audio.transcriptions.create(
                file=(audio_path.name, audio_file.read()),
                model=settings.groq_stt_model,
                temperature=0,
                response_format="verbose_json",
            )
    except GroqError as exc:
        raise GroqProviderError from exc
    except OSError as exc:
        raise AudioStorageError from exc

    transcript = response.text.strip()

    if not transcript:
        raise GroqProviderError("Groq returned an empty transcript.")

    return transcript


def delete_question_speech(audio_filename: str) -> None:
    storage_directory = Path(settings.interview_audio_storage_dir).resolve()
    audio_path = (storage_directory / audio_filename).resolve()

    if audio_path.parent == storage_directory:
        audio_path.unlink(missing_ok=True)