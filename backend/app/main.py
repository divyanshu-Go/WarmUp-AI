# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.interviews import router as interviews_router
from app.api.routes.resumes import router as resumes_router
from app.core.config import settings

app = FastAPI(title="Voice Interview API")

allowed_origins = ["http://localhost:3000"]
frontend_origin = settings.frontend_url.strip().rstrip("/")
if frontend_origin and frontend_origin not in allowed_origins:
    allowed_origins.append(frontend_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(interviews_router)
app.include_router(resumes_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}