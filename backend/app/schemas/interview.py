# schemas/interview.py
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.adaptive_interview import AnswerVerdict


class InterviewCreateRequest(BaseModel):
    resume_id: UUID
    auto_speak: bool = True


class InterviewQuestionResponse(BaseModel):
    id: UUID
    sequence_number: int
    kind: Literal["core", "followup", "conclusion"]
    stage: Literal[
        "introduction",
        "project",
        "skill",
        "hr",
        "conclusion",
    ] | None
    topic: str | None
    text: str
    audio_url: str | None


class InterviewResponse(BaseModel):
    id: UUID
    status: Literal[
        "preparing",
        "in_progress",
        "evaluating",
        "concluding",
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
        "concluding",
        "completed",
        "failed",
    ]
    transcript: str | None
    next_question: InterviewQuestionResponse | None
    created_at: datetime
    updated_at: datetime


class QuestionEvaluationResponse(BaseModel):
    question_id: UUID
    sequence_number: int
    kind: Literal["core", "followup", "conclusion"]
    stage: Literal[
        "introduction",
        "project",
        "skill",
        "hr",
        "conclusion",
    ] | None
    topic: str | None
    question_text: str
    candidate_transcript: str
    score: int
    verdict: AnswerVerdict
    what_went_well: list[str]
    what_was_wrong_or_missing: list[str]
    critique: str
    improved_answer: str


class InterviewFeedbackResponse(BaseModel):
    overall_score: float
    max_score: int = 10
    readiness_verdict: str
    executive_summary: str
    strengths: list[str]
    weaknesses: list[str]
    actionable_improvements: list[str]
    question_evaluations: list[QuestionEvaluationResponse]