# backend/app/schemas/auth.py
from pydantic import BaseModel, EmailStr, Field


class SendOTPRequest(BaseModel):
    email: EmailStr


class SendOTPResponse(BaseModel):
    message: str
    expires_in_seconds: int
    

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(pattern=r"^\d{6}$")


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None = None
    picture_url: str | None = None


class AuthResponse(BaseModel):
    message: str
    user: UserResponse

class GoogleAuthRequest(BaseModel):
    credential: str