# models/interview.py
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Interview(Base):
    __tablename__ = "interviews"
    __table_args__ = (
        CheckConstraint(
            "core_question_target > 0",
            name="ck_interviews_core_question_target_positive",
        ),
        CheckConstraint(
            "core_questions_asked >= 0",
            name="ck_interviews_core_questions_asked_nonnegative",
        ),
        CheckConstraint(
            "followups_asked >= 0",
            name="ck_interviews_followups_asked_nonnegative",
        ),
        CheckConstraint(
            "max_followups >= 0",
            name="ck_interviews_max_followups_nonnegative",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    resume_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resumes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="preparing",
        nullable=False,
        index=True,
    )

    core_question_target: Mapped[int] = mapped_column(
        Integer,
        default=5,
        nullable=False,
    )

    core_questions_asked: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    followups_asked: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    max_followups: Mapped[int] = mapped_column(
        Integer,
        default=2,
        nullable=False,
    )

    context_summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    interview_plan: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    final_feedback: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
