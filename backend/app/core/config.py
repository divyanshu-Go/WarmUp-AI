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

    resume_storage_dir: str = "./storage/resumes"
    resume_max_size_mb: int = 10
    guest_resume_expiry_hours: int = 24

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()