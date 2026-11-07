import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.interview import Interview
from app.models.interview_answer import InterviewAnswer
from app.models.interview_question import InterviewQuestion
from app.models.resume import Resume
from app.services.interview_audio_service import (
    delete_answer_audio,
    get_answer_audio_path,
    save_answer_audio,
)
from app.services.groq_service import (
    AudioStorageError,
    GroqNotConfiguredError,
    GroqProviderError,
    delete_question_speech,
    generate_initial_question,
    generate_question_speech,
    transcribe_answer_audio,
)
from app.services.interview_turn_service import process_saved_answer


CORE_QUESTION_TARGET = 5
MAX_FOLLOWUPS = 2


def create_interview(
    db: Session,
    user_id: uuid.UUID,
    resume_id: uuid.UUID,
) -> tuple[Interview, InterviewQuestion]:
    resume = db.get(Resume, resume_id)

    if not resume or resume.user_id != user_id:
        raise HTTPException(404, "Resume not found.")

    if not resume.resume_text or not resume.resume_text.strip():
        raise HTTPException(
            409,
            "This resume is not ready to use for an interview.",
        )

    try:
        generated_question = generate_initial_question(resume.resume_text)
        audio_filename = generate_question_speech(
            generated_question.question
        )
    except GroqNotConfiguredError as exc:
        raise HTTPException(
            503,
            "Interview AI is not configured. Please try again later.",
        ) from exc
    except GroqProviderError as exc:
        raise HTTPException(
            502,
            "Unable to prepare the interview question. Please try again.",
        ) from exc
    except AudioStorageError as exc:
        raise HTTPException(
            500,
            "Unable to save the interview question audio.",
        ) from exc

    interview = Interview(
        user_id=user_id,
        resume_id=resume_id,
        status="in_progress",
        core_question_target=CORE_QUESTION_TARGET,
        core_questions_asked=1,
        followups_asked=0,
        max_followups=MAX_FOLLOWUPS,
    )

    try:
        db.add(interview)
        db.flush()

        question = InterviewQuestion(
            interview_id=interview.id,
            sequence_number=1,
            kind="core",
            topic=generated_question.topic,
            text=generated_question.question,
            audio_path=audio_filename,
        )
        db.add(question)
        db.commit()
    except Exception:
        db.rollback()
        delete_question_speech(audio_filename)
        raise

    db.refresh(interview)
    db.refresh(question)

    return interview, question


def get_interview(
    db: Session,
    user_id: uuid.UUID,
    interview_id: uuid.UUID,
) -> tuple[Interview, InterviewQuestion | None]:
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


def get_question_audio_path(
    db: Session,
    user_id: uuid.UUID,
    interview_id: uuid.UUID,
    question_id: uuid.UUID,
) -> Path:
    question = db.scalar(
        select(InterviewQuestion)
        .join(Interview, Interview.id == InterviewQuestion.interview_id)
        .where(
            Interview.id == interview_id,
            Interview.user_id == user_id,
            InterviewQuestion.id == question_id,
        )
    )

    if not question or not question.audio_path:
        raise HTTPException(404, "Question audio not found.")

    storage_directory = Path(settings.interview_audio_storage_dir).resolve()
    audio_path = (storage_directory / question.audio_path).resolve()

    if audio_path.parent != storage_directory or not audio_path.is_file():
        raise HTTPException(404, "Question audio not found.")

    return audio_path


def submit_answer(
    db: Session,
    user_id: uuid.UUID,
    interview_id: uuid.UUID,
    question_id: uuid.UUID,
    audio_file: UploadFile,
) -> tuple[InterviewAnswer, Interview, InterviewQuestion | None]:
    audio_filename = save_answer_audio(audio_file)

    try:
        interview = db.scalar(
            select(Interview)
            .where(
                Interview.id == interview_id,
                Interview.user_id == user_id,
            )
            .with_for_update()
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
                "An answer can only be submitted for the current question.",
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

        answer = InterviewAnswer(
            question_id=current_question.id,
            status="transcribing",
            audio_path=audio_filename,
        )
        db.add(answer)
        db.commit()
        db.refresh(answer)
    except Exception:
        db.rollback()
        delete_answer_audio(audio_filename)
        raise

    return transcribe_saved_answer(
        db=db,
        answer=answer,
        user_id=user_id,
        interview_id=interview_id,
    )


def retry_answer_transcription(
    db: Session,
    user_id: uuid.UUID,
    interview_id: uuid.UUID,
    answer_id: uuid.UUID,
) -> tuple[InterviewAnswer, Interview, InterviewQuestion | None]:
    answer = db.scalar(
        select(InterviewAnswer)
        .join(
            InterviewQuestion,
            InterviewQuestion.id == InterviewAnswer.question_id,
        )
        .join(Interview, Interview.id == InterviewQuestion.interview_id)
        .where(
            Interview.id == interview_id,
            Interview.user_id == user_id,
            InterviewAnswer.id == answer_id,
        )
        .with_for_update()
    )

    if not answer:
        raise HTTPException(404, "Answer not found.")

    if answer.status != "transcription_failed" or not answer.audio_path:
        raise HTTPException(
            409,
            "This answer is not eligible for transcription retry.",
        )

    answer.status = "transcribing"
    db.commit()

    return transcribe_saved_answer(
        db=db,
        answer=answer,
        user_id=user_id,
        interview_id=interview_id,
    )


def transcribe_saved_answer(
    db: Session,
    answer: InterviewAnswer,
    user_id: uuid.UUID,
    interview_id: uuid.UUID,
) -> tuple[InterviewAnswer, Interview, InterviewQuestion | None]:
    try:
        if not answer.audio_path:
            raise AudioStorageError("Answer audio path is missing.")

        audio_path = get_answer_audio_path(answer.audio_path)
        transcript = transcribe_answer_audio(audio_path)
    except GroqNotConfiguredError as exc:
        answer.status = "transcription_failed"
        db.commit()
        raise HTTPException(
            503,
            detail={
                "message": "Speech recognition is not configured. Please try again later.",
                "answer_id": str(answer.id),
                "retryable": True,
            },
        ) from exc
    except GroqProviderError as exc:
        answer.status = "transcription_failed"
        db.commit()
        raise HTTPException(
            502,
            detail={
                "message": "Unable to transcribe this answer. You can retry processing.",
                "answer_id": str(answer.id),
                "retryable": True,
            },
        ) from exc
    except AudioStorageError as exc:
        answer.status = "transcription_failed"
        db.commit()
        raise HTTPException(
            500,
            detail={
                "message": "Unable to read the saved answer recording.",
                "answer_id": str(answer.id),
                "retryable": False,
            },
        ) from exc
    except HTTPException as exc:
        answer.status = "transcription_failed"
        db.commit()
        raise HTTPException(
            500,
            detail={
                "message": "Unable to read the saved answer recording.",
                "answer_id": str(answer.id),
                "retryable": False,
            },
        ) from exc

    audio_filename = answer.audio_path
    answer.transcript = transcript
    answer.audio_path = None
    answer.status = "ready_for_next"
    db.commit()
    db.refresh(answer)
    if audio_filename:
        delete_answer_audio(audio_filename)

    return process_saved_answer(
        db=db,
        answer=answer,
        user_id=user_id,
        interview_id=interview_id,
    )
