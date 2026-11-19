import logging
import uuid

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.interview import Interview
from app.models.interview_answer import InterviewAnswer
from app.models.interview_question import InterviewQuestion
from app.models.resume import Resume
from app.services.groq_service import (
    GroqNotConfiguredError,
    GroqProviderError,
    generate_question_speech_data_url,
    transcribe_answer_audio,
)
from app.services.interview_audio_service import read_validated_answer_audio
from app.services.interview_turn_service import (
    evaluate_answer_and_prepare_next_turn,
)
from app.services.langchain_service import generate_topic_rubric

CORE_QUESTION_TARGET = 6
MAX_FOLLOWUPS = 3
logger = logging.getLogger(__name__)


def create_interview(
    db: Session,
    user_id: uuid.UUID,
    resume_id: uuid.UUID,
    auto_speak: bool = True,
) -> tuple[Interview, InterviewQuestion, str | None]:
    """
    Initializes a dynamic adaptive interview:
    1. Extracts a TopicRubric roadmap from candidate resume.
    2. Seeds running context summary with candidate profile overview.
    3. Synthesizes personalized welcome & introduction question (in-memory Data URL).
    """
    resume = db.get(Resume, resume_id)

    if not resume or resume.user_id != user_id:
        raise HTTPException(404, "Resume not found.")

    if not resume.resume_text or not resume.resume_text.strip():
        raise HTTPException(
            409,
            "This resume text is not ready for generating an interview.",
        )

    setup_phase = "roadmap_generation"
    try:
        topic_rubric = generate_topic_rubric(resume.resume_text)

        candidate_first_name = (resume.candidate_name or "there").split()[0]
        introduction_text = (
            f"Hello {candidate_first_name}, welcome! I'm Amy, and I'll be conducting your "
            f"technical interview today. To start things off, could you briefly introduce yourself "
            f"and highlight a recent project or technical achievement you're most proud of?"
        )

        setup_phase = "initial_question_speech"
        audio_data_url = (
            generate_question_speech_data_url(introduction_text)
            if auto_speak
            else None
        )

    except GroqNotConfiguredError as exc:
        _log_interview_setup_failure(setup_phase, exc)
        raise HTTPException(
            503,
            "Interview AI service is not configured. Please try again later.",
        ) from exc
    except GroqProviderError as exc:
        _log_interview_setup_failure(setup_phase, exc)
        if getattr(exc.__cause__, "status_code", None) == 429:
            raise HTTPException(
                429,
                "Interview AI is temporarily rate-limited. Please try again shortly.",
            ) from exc
        detail = (
            "Unable to generate the initial interview question audio. Please try again."
            if setup_phase == "initial_question_speech"
            else "Unable to prepare the interview roadmap. Please try again."
        )
        raise HTTPException(502, detail) from exc
    except Exception as exc:
        _log_interview_setup_failure(setup_phase, exc)
        detail = (
            "Unable to generate the initial interview question audio. Please try again."
            if setup_phase == "initial_question_speech"
            else "Unable to prepare the interview roadmap. Please try again."
        )
        raise HTTPException(502, detail) from exc

    interview = Interview(
        user_id=user_id,
        resume_id=resume_id,
        status="in_progress",
        core_question_target=CORE_QUESTION_TARGET,
        core_questions_asked=1,
        followups_asked=0,
        max_followups=MAX_FOLLOWUPS,
        interview_plan=topic_rubric.model_dump(mode="json"),
        context_summary=f"• Candidate Profile: {topic_rubric.candidate_summary}",
    )

    try:
        db.add(interview)
        db.flush()

        first_question = InterviewQuestion(
            interview_id=interview.id,
            sequence_number=1,
            kind="core",
            stage="introduction",
            topic="Introduction",
            text=introduction_text,
            plan_index=0,
            stage_item_index=0,
            audio_path=None,
        )
        db.add(first_question)
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(interview)
    db.refresh(first_question)

    return interview, first_question, audio_data_url


def _log_interview_setup_failure(phase: str, error: Exception) -> None:
    cause = error.__cause__
    provider_status = getattr(cause, "status_code", None)
    logger.error(
        "Interview setup failed (phase=%s, error_type=%s, cause_type=%s, "
        "provider_status=%s).",
        phase,
        type(error).__name__,
        type(cause).__name__ if cause else "none",
        provider_status if isinstance(provider_status, int) else "none",
    )


def get_interview(
    db: Session,
    user_id: uuid.UUID,
    interview_id: uuid.UUID,
) -> tuple[Interview, InterviewQuestion | None]:
    """Retrieves interview record and its current active question turn."""
    interview = db.scalar(
        select(Interview).where(
            Interview.id == interview_id,
            Interview.user_id == user_id,
        )
    )

    if not interview:
        raise HTTPException(404, "Interview not found.")

    current_question = db.scalar(
        select(InterviewQuestion)
        .where(InterviewQuestion.interview_id == interview.id)
        .order_by(InterviewQuestion.sequence_number.desc())
        .limit(1)
    )

    return interview, current_question


async def submit_answer(
    db: Session,
    user_id: uuid.UUID,
    interview_id: uuid.UUID,
    question_id: uuid.UUID,
    audio_file: UploadFile,
    auto_speak: bool = True,
) -> tuple[InterviewAnswer, Interview, InterviewQuestion | None, str | None]:
    """Reads candidate audio in RAM, transcribes via Groq Whisper, and runs turn engine."""
    filename, audio_bytes = await read_validated_answer_audio(audio_file)

    interview = db.scalar(
        select(Interview).where(
            Interview.id == interview_id,
            Interview.user_id == user_id,
        )
    )

    if not interview:
        raise HTTPException(404, "Interview not found.")

    if interview.status != "in_progress":
        raise HTTPException(409, "This interview is not accepting answers.")

    current_question = db.scalar(
        select(InterviewQuestion)
        .where(InterviewQuestion.interview_id == interview.id)
        .order_by(InterviewQuestion.sequence_number.desc())
        .limit(1)
    )

    if not current_question or current_question.id != question_id:
        raise HTTPException(
            409,
            "An answer can only be submitted for the current active question.",
        )

    existing_answer = db.scalar(
        select(InterviewAnswer).where(
            InterviewAnswer.question_id == current_question.id
        )
    )

    if existing_answer:
        raise HTTPException(
            409,
            "An answer has already been submitted for this question.",
        )

    # Transcribe in RAM before persisting InterviewAnswer so failed STT can be retried cleanly from client Blob.
    try:
        transcript = transcribe_answer_audio(filename, audio_bytes)
    except GroqNotConfiguredError as exc:
        raise HTTPException(
            503,
            detail={
                "message": "Speech recognition is not configured.",
                "retryable": True,
            },
        ) from exc
    except GroqProviderError as exc:
        raise HTTPException(
            502,
            detail={
                "message": "Unable to transcribe audio recording. Please retry.",
                "retryable": True,
            },
        ) from exc

    # Lock interview and persist transcript atomically before adaptive turn evaluation.
    locked_interview = db.scalar(
        select(Interview)
        .where(
            Interview.id == interview_id,
            Interview.user_id == user_id,
        )
        .with_for_update()
    )
    if not locked_interview or locked_interview.status != "in_progress":
        raise HTTPException(409, "This interview is not accepting answers.")

    answer = InterviewAnswer(
        question_id=current_question.id,
        status="ready_for_next",
        transcript=transcript,
        audio_path=None,
    )
    db.add(answer)
    db.commit()
    db.refresh(answer)

    return evaluate_answer_and_prepare_next_turn(
        db=db,
        answer=answer,
        user_id=user_id,
        interview_id=interview_id,
        auto_speak=auto_speak,
    )