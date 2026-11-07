from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class InterviewCreateRequest(BaseModel):
    resume_id: UUID


class InterviewQuestionResponse(BaseModel):
    id: UUID
    sequence_number: int
    kind: Literal["core", "followup"]
    topic: str | None
    text: str
    audio_url: str | None


class InterviewResponse(BaseModel):
    id: UUID
    status: Literal[
        "preparing",
        "in_progress",
        "evaluating",
        "completed",
        "failed",
        "abandoned",
    ]
    core_question_target: int
    core_questions_asked: int
    followups_asked: int
    max_followups: int
    current_question: InterviewQuestionResponse | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class InterviewAnswerResponse(BaseModel):
    id: UUID
    status: Literal[
        "transcribing",
        "evaluating",
        "evaluation_failed",
        "ready_for_next",
        "transcription_failed",
    ]
    interview_status: Literal[
        "in_progress",
        "evaluating",
        "completed",
        "failed",
    ]
    transcript: str | None
    next_question: InterviewQuestionResponse | None
    created_at: datetime
    updated_at: datetime


class InterviewFeedbackResponse(BaseModel):
    overall_score: int
    summary: str
    strengths: list[str]
    improvements: list[str]
    practice_suggestions: list[str]
