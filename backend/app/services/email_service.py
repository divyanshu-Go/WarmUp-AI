import smtplib
from email.message import EmailMessage

from app.core.config import settings


def send_otp_email(to_email: str, otp: str) -> None:
    message = EmailMessage()
    message["Subject"] = "WarmUp verification code"
    message["From"] = settings.smtp_email
    message["To"] = to_email

    message.set_content(
        f"""Your verification code is: {otp}

This code expires in 10 minutes.
If you did not request this code, you can ignore this email.
"""
    )

    with smtplib.SMTP(
        settings.smtp_host,
        settings.smtp_port,
        timeout=15,
    ) as server:
        server.starttls()
        server.login(
            settings.smtp_email,
            settings.smtp_app_password,
        )
        server.send_message(message)