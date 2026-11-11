from typing import Literal
from pydantic import BaseModel, Field


class TopicRubricItem(BaseModel):
    """Represents a single project, skill, or HR scenario in the interview roadmap."""

    id: str = Field(description="Unique key, e.g., 'proj_warmup', 'skill_react'")
    category: Literal["project", "skill", "hr"] = Field(description="Rubric category")
    name: str = Field(description="Display name of project, skill, or HR theme")
    target_aspects: list[str] = Field(
        default_factory=list,
        description="Key technical or architectural topics to probe for this item"
    )
    status: Literal["untouched", "in_progress", "completed"] = Field(
        default="untouched",
        description="Current evaluation status"
    )
    tested_depth: int = Field(default=0, description="Probes asked so far for this item")
    max_depth: int = Field(default=2, description="Maximum probes allowed for this item")


class TopicRubric(BaseModel):
    """Roadmap generated from the candidate's resume instead of fixed question strings."""

    candidate_summary: str = Field(description="1-2 sentence profile summary from resume")
    projects: list[TopicRubricItem] = Field(default_factory=list, description="Extracted projects")
    skills: list[TopicRubricItem] = Field(default_factory=list, description="Extracted tech skills")
    hr_topics: list[TopicRubricItem] = Field(default_factory=list, description="Extracted behavioral themes")


class TurnDecision(BaseModel):
    """Output produced by the dynamic turn engine after analyzing every candidate answer."""

    last_answer_depth: Literal["shallow", "adequate", "strong", "off_topic"] = Field(
        description="Quality assessment of candidate's last response"
    )
    running_summary_bullet: str = Field(
        description="A concise bullet point of key technical claims stated in the last answer"
    )
    active_stage: Literal["introduction", "project", "skill", "hr", "conclusion"] = Field(
        description="Active stage for the upcoming question"
    )
    active_topic_id: str | None = Field(
        default=None,
        description="ID of active TopicRubricItem being tested"
    )
    action: Literal["DRILL_DOWN", "ELEVATE_DIFFICULTY", "PIVOT_TOPIC", "CONCLUDE"] = Field(
        description="Conversational trajectory chosen by the AI"
    )
    bridge_phrase: str = Field(
        description="1 conversational sentence directly acknowledging what candidate just said"
    )
    next_question: str = Field(
        description="1 targeted question building on the bridge phrase"
    )
    is_conclusion: bool = Field(
        default=False,
        description="Set to true when interview is concluding"
    )