from app.models.interview import Interview
from app.schemas.adaptive_interview import TopicRubric, TurnDecision


def parse_topic_rubric(interview: Interview) -> TopicRubric:
    """Parses the stored JSON dict on interview.interview_plan into a TopicRubric model."""
    if not interview.interview_plan:
        return TopicRubric(
            candidate_summary="Candidate interview",
            projects=[],
            skills=[],
            hr_topics=[]
        )
    return TopicRubric.model_validate(interview.interview_plan)


def update_rubric_and_ledger(
    interview: Interview,
    decision: TurnDecision
) -> None:
    """
    Updates rubric statuses/depth counts and appends candidate's claims
    to the running context summary ledger.
    """
    rubric = parse_topic_rubric(interview)

    # 1. Update tested depth and status for active topic
    if decision.active_topic_id:
        all_items = rubric.projects + rubric.skills + rubric.hr_topics
        for item in all_items:
            if item.id == decision.active_topic_id:
                item.tested_depth += 1
                if item.status == "untouched":
                    item.status = "in_progress"
                
                # Mark completed if depth limit reached or topic pivoted
                if item.tested_depth >= item.max_depth or decision.action == "PIVOT_TOPIC":
                    item.status = "completed"
                break

    # 2. Persist updated TopicRubric back to interview.interview_plan
    interview.interview_plan = rubric.model_dump(mode="json")

    # 3. Append new bullet point to running context summary
    if decision.running_summary_bullet and decision.running_summary_bullet.strip():
        new_bullet = f"• {decision.running_summary_bullet.strip()}"
        if interview.context_summary:
            interview.context_summary = f"{interview.context_summary}\n{new_bullet}"
        else:
            interview.context_summary = new_bullet


def determine_next_stage(rubric: TopicRubric, current_stage: str) -> str:
    """
    Determines the active stage based on remaining untouched/in-progress rubric items.
    """
    if current_stage == "introduction":
        return "project" if rubric.projects else ("skill" if rubric.skills else "hr")
    
    if current_stage == "project":
        has_active_projects = any(p.status != "completed" for p in rubric.projects)
        if has_active_projects:
            return "project"
        return "skill" if rubric.skills else "hr"

    if current_stage == "skill":
        has_active_skills = any(s.status != "completed" for s in rubric.skills)
        if has_active_skills:
            return "skill"
        return "hr"

    if current_stage == "hr":
        has_active_hr = any(h.status != "completed" for h in rubric.hr_topics)
        if has_active_hr:
            return "hr"
        return "conclusion"

    return "conclusion"