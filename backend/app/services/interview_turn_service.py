import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
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
    generate_final_feedback,
    generate_question_speech,
)
from app.services.langchain_service import generate_adaptive_turn
from app.services.rubric_state_service import (
    determine_next_stage,
    parse_topic_rubric,
    update_rubric_and_ledger,
)


def evaluate_answer_and_prepare_next_turn(
    db: Session,
    answer: InterviewAnswer,
    user_id: uuid.UUID,
    interview_id: uuid.UUID,
) -> tuple[InterviewAnswer, Interview, InterviewQuestion | None]:
    """
    Core adaptive turn engine loop:
    1. Loads conversation context and current rubric state.
    2. Calls LangChain adaptive turn engine for dynamic Bridge + Question generation.
    3. Updates TopicRubric and Memory Ledger in DB.
    4. Synthesizes question speech audio and stores the new question.
    """
    interview = db.scalar(
        select(Interview)
        .where(
            Interview.id == interview_id,
            Interview.user_id == user_id,
        )
        .with_for_update()
    )
    if not interview or interview.status != "in_progress":
        raise HTTPException(409, "Interview is not currently accepting answers.")

    question = db.scalar(
        select(InterviewQuestion).where(
            InterviewQuestion.id == answer.question_id,
            InterviewQuestion.interview_id == interview.id,
        )
    )
    resume = db.get(Resume, interview.resume_id)

    if not question or not answer.transcript or not resume or not resume.resume_text:
        raise HTTPException(409, "Interview turn context is incomplete.")

    answer.status = "evaluating"
    db.commit()

    audio_filename = None
    try:
        topic_rubric = parse_topic_rubric(interview)
        prior_history = _load_prior_conversation_turns(db, interview.id, question.id)
        current_stage = determine_next_stage(
            topic_rubric, question.stage or "introduction"
        )

        total_turns_asked = (
            interview.core_questions_asked + interview.followups_asked
        )
        max_target_turns = interview.core_question_target

        # Generate dynamic adaptive response (Bridge + Question)
        decision = generate_adaptive_turn(
            resume_summary=topic_rubric.candidate_summary,
            topic_rubric=topic_rubric,
            running_summary=interview.context_summary or "",
            active_stage=current_stage,
            turn_count=total_turns_asked,
            max_turns=max_target_turns,
            conversation_history=prior_history,
            last_transcript=answer.transcript,
        )

        # Update rubric item state and context memory ledger
        update_rubric_and_ledger(interview, decision)

        # Determine spoken turn text and interview flow
        if decision.is_conclusion or total_turns_asked >= max_target_turns:
            full_spoken_text = (
                "That brings us to the end of our interview. Thank you for sharing "
                "your experience today, and I wish you all the best with your next steps!"
            )
            next_kind = "conclusion"
            next_stage = "conclusion"
        else:
            full_spoken_text = (
                f"{decision.bridge_phrase} {decision.next_question}".strip()
            )
            next_kind = "followup" if decision.action == "DRILL_DOWN" else "core"
            next_stage = decision.active_stage

        # Generate TTS Audio File
        audio_filename = generate_question_speech(full_spoken_text)

        # Create Next Question Record
        next_question = InterviewQuestion(
            interview_id=interview.id,
            sequence_number=question.sequence_number + 1,
            kind=next_kind,
            stage=next_stage,
            topic=decision.active_topic_id or "General",
            text=full_spoken_text,
            parent_question_id=question.id if next_kind == "followup" else None,
            audio_path=audio_filename,
        )
        db.add(next_question)

        # Update interview counters & status
        if next_kind == "conclusion":
            interview.status = "concluding"
        elif next_kind == "followup":
            interview.followups_asked += 1
        else:
            interview.core_questions_asked += 1

        answer.status = "ready_for_next"
        db.commit()

        db.refresh(answer)
        db.refresh(next_question)
        return answer, interview, next_question

    except (
        GroqNotConfiguredError,
        GroqProviderError,
        AudioStorageError,
        Exception,
    ) as exc:
        db.rollback()
        if audio_filename:
            delete_question_speech(audio_filename)

        answer.status = "evaluation_failed"
        db.commit()

        raise HTTPException(
            status_code=500,
            detail={
                "message": "Failed to prepare adaptive interview turn. You can retry.",
                "answer_id": str(answer.id),
                "retryable": True,
            },
        ) from exc


def retry_answer_evaluation(
    db: Session,
    user_id: uuid.UUID,
    interview_id: uuid.UUID,
    answer_id: uuid.UUID,
) -> tuple[InterviewAnswer, Interview, InterviewQuestion | None]:
    """Retries evaluating an answer from its saved transcript."""
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

    return evaluate_answer_and_prepare_next_turn(
        db=db,
        answer=answer,
        user_id=user_id,
        interview_id=interview_id,
    )


def complete_interview_after_conclusion(
    db: Session,
    user_id: uuid.UUID,
    interview_id: uuid.UUID,
) -> tuple[Interview, InterviewQuestion | None]:
    """Generates final feedback summary after conclusion audio completes."""
    interview = db.scalar(
        select(Interview).where(
            Interview.id == interview_id,
            Interview.user_id == user_id,
        )
    )
    if not interview:
        raise HTTPException(404, "Interview not found.")

    conclusion = db.scalar(
        select(InterviewQuestion)
        .where(InterviewQuestion.interview_id == interview.id)
        .order_by(InterviewQuestion.sequence_number.desc())
        .limit(1)
    )
    if interview.status == "completed":
        return interview, conclusion

    if (
        interview.status != "concluding"
        or not conclusion
        or conclusion.kind != "conclusion"
    ):
        raise HTTPException(409, "The interview conclusion is not ready.")

    resume = db.get(Resume, interview.resume_id)
    if not resume or not resume.resume_text:
        raise HTTPException(409, "The interview resume is not available.")

    evaluations = _load_saved_evaluation_context(db, interview.id)
    try:
        final_feedback = generate_final_feedback(
            resume_text=resume.resume_text,
            evaluations=evaluations,
        )
    except GroqNotConfiguredError as exc:
        raise HTTPException(
            503,
            "Interview AI is not configured. Please try again later.",
        ) from exc
    except GroqProviderError as exc:
        raise HTTPException(
            502,
            "Unable to generate final interview feedback. Please try again.",
        ) from exc

    interview.final_feedback = final_feedback.model_dump()
    interview.status = "completed"
    interview.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(interview)
    return interview, conclusion


def _load_prior_conversation_turns(
    db: Session,
    interview_id: uuid.UUID,
    current_question_id: uuid.UUID,
) -> list[dict[str, str]]:
    """Loads past turns ordered chronologically for standard chat memory."""
    rows = db.execute(
        select(InterviewQuestion, InterviewAnswer)
        .join(InterviewAnswer, InterviewAnswer.question_id == InterviewQuestion.id)
        .where(
            InterviewQuestion.interview_id == interview_id,
            InterviewQuestion.id != current_question_id,
        )
        .order_by(InterviewQuestion.sequence_number.asc())
    ).all()

    return [
        {
            "question": q.text,
            "answer": a.transcript or "",
        }
        for q, a in rows
    ]


def _load_saved_evaluation_context(
    db: Session,
    interview_id: uuid.UUID,
) -> list[dict[str, object]]:
    """Loads overall turns context for the final feedback generator."""
    rows = db.execute(
        select(InterviewQuestion, InterviewAnswer)
        .join(
            InterviewAnswer,
            InterviewAnswer.question_id == InterviewQuestion.id,
        )
        .where(InterviewQuestion.interview_id == interview_id)
        .order_by(InterviewQuestion.sequence_number.asc())
    ).all()

    return [
        {
            "question": question.text[:500],
            "topic": question.topic,
            "evaluation": answer.evaluation or {},
        }
        for question, answer in rows
    ]