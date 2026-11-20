# backend/app/core/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str

    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_email: str
    smtp_app_password: str

    otp_hash_secret: str

    session_expiry_days: int
    frontend_url: str

    google_client_id: str = ""

    # 4 MB limit stays safely under Vercel's 4.5 MB serverless request body cap.
    resume_max_size_mb: int = 4
    guest_resume_expiry_hours: int = 24

    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    groq_api_key: str = ""
    groq_interview_model: str = "openai/gpt-oss-120b"
    groq_tts_model: str = "canopylabs/orpheus-v1-english"
    groq_tts_voice: str = "autumn"
    groq_stt_model: str = "whisper-large-v3-turbo"
    interview_max_answer_audio_mb: int = 4

    @property
    def is_https_frontend(self) -> bool:
        return self.frontend_url.strip().lower().startswith("https://")

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()