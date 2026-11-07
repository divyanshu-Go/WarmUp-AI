import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.interview import Interview
from app.models.interview_answer import InterviewAnswer
from app.models.interview_question import InterviewQuestion
from app.models.resume import Resume
from app.services.groq_service import (
    AudioStorageError,
    GroqNotConfiguredError,
    GroqProviderError,
    delete_question_speech,
    evaluate_answer_and_choose_next,
    generate_final_feedback,
    generate_question_speech,
)


def retry_answer_evaluation(
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

    if answer.status != "evaluation_failed" or not answer.transcript:
        raise HTTPException(
            409,
            "This answer is not eligible for evaluation retry.",
        )

    return process_saved_answer(
        db=db,
        answer=answer,
        user_id=user_id,
        interview_id=interview_id,
    )


def process_saved_answer(
    db: Session,
    answer: InterviewAnswer,
    user_id: uuid.UUID,
    interview_id: uuid.UUID,
) -> tuple[InterviewAnswer, Interview, InterviewQuestion | None]:
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

    question = db.scalar(
        select(InterviewQuestion).where(
            InterviewQuestion.id == answer.question_id,
            InterviewQuestion.interview_id == interview.id,
        )
    )
    resume = db.get(Resume, interview.resume_id)

    if not question or not answer.transcript:
        raise HTTPException(409, "The answer is not ready to evaluate.")

    if not resume or not resume.resume_text:
        raise HTTPException(409, "The interview resume is not available.")

    answer.status = "evaluating"
    db.commit()

    evaluation = None
    audio_filename = None

    try:
        previous_turns = _get_prior_turns(
            db=db,
            interview_id=interview.id,
            current_question_id=question.id,
        )
        result = evaluate_answer_and_choose_next(
            resume_text=resume.resume_text,
            prior_turns=previous_turns,
            current_question=question.text,
            current_answer=answer.transcript,
            core_questions_asked=interview.core_questions_asked,
            core_question_target=interview.core_question_target,
            followups_asked=interview.followups_asked,
            max_followups=interview.max_followups,
        )
        evaluation = result.evaluation.model_dump()
        _validate_next_action(interview, result.next_action, result.next_question)

        final_feedback = None
        next_question = None

        if result.next_action == "finish":
            final_feedback = generate_final_feedback(
                resume_text=resume.resume_text,
                evaluations=_get_final_evaluation_context(
                    db=db,
                    interview_id=interview.id,
                    current_question=question,
                    current_evaluation=evaluation,
                ),
            )
        else:
            if not result.next_question:
                raise GroqProviderError(
                    "The next interview question was missing."
                )

            audio_filename = generate_question_speech(
                result.next_question.question
            )
            next_question = InterviewQuestion(
                interview_id=interview.id,
                sequence_number=question.sequence_number + 1,
                kind=(
                    "followup"
                    if result.next_action == "followup"
                    else "core"
                ),
                topic=result.next_question.topic,
                text=result.next_question.question,
                parent_question_id=(
                    question.id if result.next_action == "followup" else None
                ),
                audio_path=audio_filename,
            )

        answer.evaluation = evaluation
        answer.status = "ready_for_next"

        if next_question:
            db.add(next_question)
            if result.next_action == "followup":
                interview.followups_asked += 1
            else:
                interview.core_questions_asked += 1
        else:
            interview.status = "completed"
            interview.final_feedback = final_feedback.model_dump()
            interview.completed_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(answer)

        if next_question:
            db.refresh(next_question)

        return answer, interview, next_question
    except (GroqNotConfiguredError, GroqProviderError, AudioStorageError) as exc:
        db.rollback()
        if audio_filename:
            delete_question_speech(audio_filename)

        answer.status = "evaluation_failed"
        if evaluation:
            answer.evaluation = evaluation
        db.commit()

        status_code = (
            503 if isinstance(exc, GroqNotConfiguredError)
            else 500 if isinstance(exc, AudioStorageError)
            else 502
        )
        message = (
            "Interview AI is not configured. Please try again later."
            if isinstance(exc, GroqNotConfiguredError)
            else "Unable to save question speech."
            if isinstance(exc, AudioStorageError)
            else "Unable to evaluate this answer or prepare the next turn. You can retry."
        )

        raise HTTPException(
            status_code,
            detail={
                "message": message,
                "answer_id": str(answer.id),
                "retryable": True,
            },
        ) from exc
    except SQLAlchemyError:
        db.rollback()
        if audio_filename:
            delete_question_speech(audio_filename)
        answer.status = "evaluation_failed"
        db.commit()
        raise


def _validate_next_action(
    interview: Interview,
    action: str,
    next_question,
) -> None:
    if action == "finish":
        if interview.core_questions_asked < interview.core_question_target:
            raise GroqProviderError(
                "The interview cannot finish before all core questions are asked."
            )
        if next_question is not None:
            raise GroqProviderError(
                "A finished interview cannot include another question."
            )
        return

    if next_question is None:
        raise GroqProviderError("The next interview question was missing.")

    if action == "followup" and interview.followups_asked >= interview.max_followups:
        raise GroqProviderError("The follow-up question limit was exceeded.")

    if action == "next_core" and interview.core_questions_asked >= interview.core_question_target:
        raise GroqProviderError("The core question target has already been reached.")


def _get_prior_turns(
    db: Session,
    interview_id: uuid.UUID,
    current_question_id: uuid.UUID,
) -> list[dict[str, object]]:
    rows = db.execute(
        select(InterviewQuestion, InterviewAnswer)
        .join(
            InterviewAnswer,
            InterviewAnswer.question_id == InterviewQuestion.id,
        )
        .where(
            InterviewQuestion.interview_id == interview_id,
            InterviewQuestion.id != current_question_id,
        )
        .order_by(InterviewQuestion.sequence_number.desc())
        .limit(6)
    ).all()

    return [
        {
            "question": prior_question.text[:500],
            "kind": prior_question.kind,
            "topic": prior_question.topic,
            "answer": (prior_answer.transcript or "")[:1_000],
            "evaluation": prior_answer.evaluation,
        }
        for prior_question, prior_answer in reversed(rows)
    ]


def _get_final_evaluation_context(
    db: Session,
    interview_id: uuid.UUID,
    current_question: InterviewQuestion,
    current_evaluation: dict[str, object],
) -> list[dict[str, object]]:
    rows = db.execute(
        select(InterviewQuestion, InterviewAnswer)
        .join(
            InterviewAnswer,
            InterviewAnswer.question_id == InterviewQuestion.id,
        )
        .where(InterviewQuestion.interview_id == interview_id)
        .where(InterviewQuestion.id != current_question.id)
        .order_by(InterviewQuestion.sequence_number)
    ).all()

    evaluations = [
        {
            "question": question.text[:500],
            "topic": question.topic,
            "evaluation": answer.evaluation,
        }
        for question, answer in rows
        if answer.evaluation
    ]

    evaluations.append(
        {
            "question": current_question.text[:500],
            "topic": current_question.topic,
            "evaluation": current_evaluation,
        }
    )

    return evaluations[:7]
