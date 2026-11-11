# app/api/routes/interviews.py
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.interview import Interview
from app.models.interview_answer import InterviewAnswer
from app.models.interview_question import InterviewQuestion
from app.models.user import User
from app.schemas.interview import (
    InterviewCreateRequest,
    InterviewAnswerResponse,
    InterviewFeedbackResponse,
    InterviewQuestionResponse,
    InterviewResponse,
)
from app.services.interview_service import (
    create_interview,
    get_interview,
    get_question_audio_path,
    retry_answer_transcription,
    submit_answer as submit_interview_answer,
)
from app.services.interview_turn_service import (
    complete_interview_after_conclusion,
    retry_answer_evaluation,
)


router = APIRouter(
    prefix="/api/interviews",
    tags=["Interviews"],
)


def build_interview_response(
    interview: Interview,
    current_question: InterviewQuestion | None,
) -> InterviewResponse:
    question_response = None

    if current_question:
        question_response = InterviewQuestionResponse(
            id=current_question.id,
            sequence_number=current_question.sequence_number,
            kind=current_question.kind,
            stage=current_question.stage,
            topic=current_question.topic,
            text=current_question.text,
            audio_url=(
                f"/api/interviews/{current_question.interview_id}/"
                f"questions/{current_question.id}/audio"
                if current_question.audio_path
                else None
            ),
        )

    return InterviewResponse(
        id=interview.id,
        status=interview.status,
        core_question_target=interview.core_question_target,
        core_questions_asked=interview.core_questions_asked,
        followups_asked=interview.followups_asked,
        max_followups=interview.max_followups,
        current_question=question_response,
        created_at=interview.created_at,
        updated_at=interview.updated_at,
        completed_at=interview.completed_at,
    )


def build_answer_response(
    answer: InterviewAnswer,
    interview: Interview,
    next_question: InterviewQuestion | None,
) -> InterviewAnswerResponse:
    interview_response = build_interview_response(interview, next_question)

    return InterviewAnswerResponse(
        id=answer.id,
        status=answer.status,
        interview_status=interview_response.status,
        transcript=answer.transcript,
        next_question=interview_response.current_question,
        created_at=answer.created_at,
        updated_at=answer.updated_at,
    )


@router.post(
    "",
    response_model=InterviewResponse,
    status_code=201,
)
def start_interview(
    payload: InterviewCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # The service creates the interview and its first resume-based question.
    interview, first_question = create_interview(
        db=db,
        user_id=user.id,
        resume_id=payload.resume_id,
        auto_speak=payload.auto_speak,
    )

    return build_interview_response(interview, first_question)


@router.get(
    "/{interview_id}",
    response_model=InterviewResponse,
)
def read_interview(
    interview_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    interview, current_question = get_interview(
        db=db,
        user_id=user.id,
        interview_id=interview_id,
    )

    return build_interview_response(interview, current_question)


@router.get(
    "/{interview_id}/questions/{question_id}/audio",
    response_class=FileResponse,
)
def read_question_audio(
    interview_id: uuid.UUID,
    question_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    audio_path = get_question_audio_path(
        db=db,
        user_id=user.id,
        interview_id=interview_id,
        question_id=question_id,
    )

    return FileResponse(
        path=audio_path,
        media_type="audio/wav",
        headers={"Cache-Control": "private, no-store"},
    )


@router.post(
    "/{interview_id}/questions/{question_id}/answers",
    response_model=InterviewAnswerResponse,
)
def submit_answer(
    interview_id: uuid.UUID,
    question_id: uuid.UUID,
    auto_speak: bool = True,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # The response contains the transcript and the next question, if any.
    answer, interview, next_question = submit_interview_answer(
        db=db,
        user_id=user.id,
        interview_id=interview_id,
        question_id=question_id,
        audio_file=file,
        auto_speak=auto_speak,
    )

    return build_answer_response(answer, interview, next_question)


@router.post(
    "/{interview_id}/answers/{answer_id}/retry-transcription",
    response_model=InterviewAnswerResponse,
)
def retry_transcription(
    interview_id: uuid.UUID,
    answer_id: uuid.UUID,
    auto_speak: bool = True,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    answer, interview, next_question = retry_answer_transcription(
        db=db,
        user_id=user.id,
        interview_id=interview_id,
        answer_id=answer_id,
        auto_speak=auto_speak,
    )

    return build_answer_response(answer, interview, next_question)


@router.post(
    "/{interview_id}/answers/{answer_id}/retry-evaluation",
    response_model=InterviewAnswerResponse,
)
def retry_evaluation(
    interview_id: uuid.UUID,
    answer_id: uuid.UUID,
    auto_speak: bool = True,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    answer, interview, next_question = retry_answer_evaluation(
        db=db,
        user_id=user.id,
        interview_id=interview_id,
        answer_id=answer_id,
        auto_speak=auto_speak,
    )

    return build_answer_response(answer, interview, next_question)


@router.post(
    "/{interview_id}/complete",
    response_model=InterviewResponse,
)
def complete_interview(
    interview_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    interview, conclusion = complete_interview_after_conclusion(
        db=db,
        user_id=user.id,
        interview_id=interview_id,
    )
    return build_interview_response(interview, conclusion)


@router.get(
    "/{interview_id}/feedback",
    response_model=InterviewFeedbackResponse,
)
def read_interview_feedback(
    interview_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Keep final feedback private until all interview turns are complete.
    interview, _ = get_interview(
        db=db,
        user_id=user.id,
        interview_id=interview_id,
    )

    if interview.status != "completed" or not interview.final_feedback:
        raise HTTPException(409, "Interview feedback is not ready yet.")

    return InterviewFeedbackResponse.model_validate(interview.final_feedback)
