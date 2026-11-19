import base64

from groq import Groq, GroqError

from app.core.config import settings


class GroqNotConfiguredError(Exception):
    pass


class GroqProviderError(Exception):
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


def generate_question_speech_data_url(question_text: str) -> str:
    """Synthesize speech in RAM and return a Base64 WAV Data URL."""
    try:
        response = _get_client().audio.speech.create(
            model=settings.groq_tts_model,
            voice=settings.groq_tts_voice,
            response_format="wav",
            input=question_text,
        )
        audio_bytes = response.read()
    except GroqError as exc:
        raise GroqProviderError from exc

    if not audio_bytes:
        raise GroqProviderError("Groq returned empty TTS audio.")

    encoded = base64.b64encode(audio_bytes).decode("ascii")
    return f"data:audio/wav;base64,{encoded}"


def transcribe_answer_audio(filename: str, audio_bytes: bytes) -> str:
    """Send in-memory browser recording bytes to Groq Whisper and return transcript."""
    try:
        response = _get_client().audio.transcriptions.create(
            file=(filename, audio_bytes),
            model=settings.groq_stt_model,
            temperature=0,
            response_format="verbose_json",
        )
    except GroqError as exc:
        raise GroqProviderError from exc

    transcript = response.text.strip()

    if not transcript:
        raise GroqProviderError("Groq returned an empty transcript.")

    return transcript