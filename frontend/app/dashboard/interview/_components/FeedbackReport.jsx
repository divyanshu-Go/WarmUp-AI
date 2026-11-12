// frontend/app/dashboard/interview/_components/FeedbackReport.jsx
"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  MessageSquareQuote,
  Sparkles,
  XCircle,
} from "lucide-react";

const VERDICT_LABELS = {
  missing_or_off_topic: "No Answer / Off-Topic",
  incorrect: "Incorrect",
  weak: "Weak / Superficial",
  partial: "Partial",
  strong: "Strong",
  exceptional: "Exceptional",
};

function getScoreBadgeClasses(score, max = 10) {
  const ratio = score / max;
  if (ratio < 0.35) {
    return "border-red-500/60 bg-red-500/15 text-red-400";
  }
  if (ratio < 0.55) {
    return "border-orange-500/60 bg-orange-500/15 text-orange-400";
  }
  if (ratio < 0.7) {
    return "border-amber-500/60 bg-amber-500/15 text-amber-300";
  }
  return "border-emerald-500/60 bg-emerald-500/15 text-emerald-400";
}

function getReadinessBadgeClasses(verdict) {
  switch (verdict) {
    case "Not Ready":
      return "border-red-500/60 bg-red-500/15 text-red-400";
    case "Needs Work":
      return "border-orange-500/60 bg-orange-500/15 text-orange-400";
    case "Borderline":
      return "border-amber-500/60 bg-amber-500/15 text-amber-300";
    case "Strong":
    case "Exceptional":
      return "border-emerald-500/60 bg-emerald-500/15 text-emerald-400";
    default:
      return "border-border bg-surface text-muted";
  }
}

export default function FeedbackReport({ feedback, onStartOver }) {
  const questions = feedback?.question_evaluations || [];
  const [expandedIds, setExpandedIds] = useState(() =>
    questions.length > 0 ? new Set([questions[0].question_id]) : new Set()
  );

  if (!feedback) return null;

  const maxScore = feedback.max_score || 10;
  const allExpanded =
    questions.length > 0 && expandedIds.size === questions.length;

  function toggleQuestion(questionId) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }

  function toggleAllQuestions() {
    if (allExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(questions.map((q) => q.question_id)));
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-foreground">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={26} className="text-primary" />
          <h2 className="text-2xl font-bold">Interview Evaluation Report</h2>
        </div>
        {feedback.readiness_verdict && (
          <span
            className={`rounded-full border px-3.5 py-1 text-xs font-bold uppercase tracking-wider ${getReadinessBadgeClasses(
              feedback.readiness_verdict
            )}`}
          >
            {feedback.readiness_verdict}
          </span>
        )}
      </div>

      {/* Overall Score & Executive Summary Card */}
      <div className="rounded-[var(--radius-card)] border-2 border-foreground bg-surface-raised p-6 shadow-[3px_3px_0_var(--primary)]">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          Overall Performance Score
        </p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-4xl font-extrabold text-foreground">
            {Number(feedback.overall_score).toFixed(1)}
          </span>
          <span className="text-xl font-medium text-muted">/ {maxScore}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-foreground/90">
          {feedback.executive_summary}
        </p>
      </div>

      {/* Strengths & Weaknesses */}
      <div className="grid gap-4 sm:grid-cols-2">
        <AssessmentListCard
          title="Demonstrated Strengths"
          items={feedback.strengths || []}
          emptyMessage="No clear strengths were demonstrated in this interview."
          accentClass="bg-emerald-400"
        />
        <AssessmentListCard
          title="Key Weaknesses & Gaps"
          items={feedback.weaknesses || []}
          emptyMessage="No major weaknesses recorded."
          accentClass="bg-red-400"
        />
      </div>

      {/* Actionable Improvements */}
      <AssessmentListCard
        title="Actionable Next Steps"
        items={feedback.actionable_improvements || []}
        emptyMessage="No specific improvement items generated."
        accentClass="bg-primary"
      />

      {/* Question-by-Question Breakdown */}
      {questions.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-foreground">
                Question-by-Question Breakdown ({questions.length})
              </h3>
              <p className="text-xs text-muted">
                Strict evaluation based strictly on your spoken answers.
              </p>
            </div>
            <button
              type="button"
              onClick={toggleAllQuestions}
              className="rounded-[var(--radius-control)] border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary"
            >
              {allExpanded ? "Collapse All" : "Expand All"}
            </button>
          </div>

          <div className="space-y-3">
            {questions.map((item) => (
              <QuestionEvaluationCard
                key={item.question_id}
                item={item}
                maxScore={maxScore}
                isExpanded={expandedIds.has(item.question_id)}
                onToggle={() => toggleQuestion(item.question_id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Restart CTA */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onStartOver}
          className="inline-flex items-center rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-5 py-3 text-sm font-bold text-white shadow-[2px_2px_0_var(--foreground)] transition hover:bg-primary-hover"
        >
          Start New Interview
        </button>
      </div>
    </div>
  );
}

function AssessmentListCard({ title, items, emptyMessage, accentClass }) {
  return (
    <div className="rounded-[var(--radius-card)] border-2 border-border bg-surface p-5">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm italic text-muted">{emptyMessage}</p>
      ) : (
        <ul className="mt-3 space-y-2.5 text-sm text-foreground/85">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${accentClass}`}
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuestionEvaluationCard({ item, maxScore, isExpanded, onToggle }) {
  const verdictLabel = VERDICT_LABELS[item.verdict] || item.verdict;

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border-2 border-border bg-surface transition">
      {/* Accordion Header */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-start justify-between gap-4 p-4 text-left transition hover:bg-surface-raised/60"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-extrabold text-primary">
              Q{item.sequence_number}
            </span>
            {item.kind === "followup" && (
              <span className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                Follow-up Drill-Down
              </span>
            )}
            {item.stage && (
              <span className="rounded border border-border px-2 py-0.5 text-[11px] font-medium capitalize text-muted">
                {item.stage}
              </span>
            )}
            {item.topic && item.topic !== "General" && (
              <span className="truncate text-xs text-muted">• {item.topic}</span>
            )}
          </div>
          <p className="line-clamp-2 text-sm font-semibold text-foreground">
            {item.question_text}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <span
            className={`rounded-md border px-2.5 py-1 text-xs font-extrabold ${getScoreBadgeClasses(
              item.score,
              maxScore
            )}`}
          >
            {item.score} / {maxScore}
          </span>
          {isExpanded ? (
            <ChevronUp size={18} className="text-muted" />
          ) : (
            <ChevronDown size={18} className="text-muted" />
          )}
        </div>
      </button>

      {/* Accordion Body */}
      {isExpanded && (
        <div className="space-y-5 border-t border-border bg-background/40 p-5">
          {/* Verdict Banner & Critique */}
          <div className="rounded-[var(--radius-control)] border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                Evaluator Critique
              </span>
              <span
                className={`rounded border px-2 py-0.5 text-[11px] font-bold ${getScoreBadgeClasses(
                  item.score,
                  maxScore
                )}`}
              >
                {verdictLabel}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">
              {item.critique}
            </p>
          </div>

          {/* Question & Candidate Transcript */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[var(--radius-control)] border border-border bg-surface p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">
                Question Asked
              </p>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {item.question_text}
              </p>
            </div>

            <div className="rounded-[var(--radius-control)] border border-border bg-surface p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                <MessageSquareQuote size={14} className="text-primary" />
                <span>Your Spoken Answer</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground/85">
                {item.candidate_transcript || "(No transcript recorded)"}
              </p>
            </div>
          </div>

          {/* What Went Well vs What Was Wrong / Missing */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[var(--radius-control)] border border-border bg-surface p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                <Sparkles size={14} />
                <span>What Went Well</span>
              </div>
              {item.what_went_well?.length > 0 ? (
                <ul className="mt-2.5 space-y-2 text-sm text-foreground/85">
                  {item.what_went_well.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2.5 text-sm italic text-muted">
                  Nothing technically valid was demonstrated in this answer.
                </p>
              )}
            </div>

            <div className="rounded-[var(--radius-control)] border border-border bg-surface p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-400">
                <XCircle size={14} />
                <span>What Was Wrong or Missing</span>
              </div>
              {item.what_was_wrong_or_missing?.length > 0 ? (
                <ul className="mt-2.5 space-y-2 text-sm text-foreground/85">
                  {item.what_was_wrong_or_missing.map((gap, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <AlertTriangle
                        size={14}
                        className="mt-0.5 shrink-0 text-red-400"
                      />
                      <span>{gap}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2.5 text-sm italic text-muted">
                  No major technical gaps identified.
                </p>
              )}
            </div>
          </div>

          {/* Example Improved Answer */}
          <div className="rounded-[var(--radius-control)] border-2 border-primary/50 bg-primary/5 p-4">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <Lightbulb size={14} />
              <span>Example Strong Answer</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              &ldquo;{item.improved_answer}&rdquo;
            </p>
          </div>
        </div>
      )}
    </div>
  );
}