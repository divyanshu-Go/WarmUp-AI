"use client";

import { CheckCircle2 } from "lucide-react";

export default function FeedbackReport({ feedback, onStartOver }) {
  if (!feedback) return null;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center gap-3 text-foreground">
        <CheckCircle2 size={26} className="text-primary" />
        <h2 className="text-2xl font-bold">Interview Complete</h2>
      </div>

      {/* Score Header Card */}
      <div className="rounded-[var(--radius-card)] border-2 border-foreground bg-surface-raised p-6 shadow-[3px_3px_0_var(--primary)]">
        <p className="text-sm font-bold uppercase tracking-wide text-primary">
          Overall Performance Score
        </p>
        <p className="mt-1 text-4xl font-extrabold text-foreground">
          {feedback.overall_score} <span className="text-xl font-medium text-muted">/ 5</span>
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {feedback.summary}
        </p>
      </div>

      {/* Strengths & Improvements */}
      <div className="grid gap-4 sm:grid-cols-2">
        <SectionList title="Strengths" items={feedback.strengths} variant="green" />
        <SectionList title="Areas to Improve" items={feedback.improvements} variant="orange" />
      </div>

      <SectionList title="Practice Suggestions" items={feedback.practice_suggestions} variant="neutral" />

      <button
        type="button"
        onClick={onStartOver}
        className="inline-flex items-center rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-5 py-3 text-sm font-bold text-white shadow-[2px_2px_0_var(--foreground)] transition hover:bg-primary-hover"
      >
        Start New Interview
      </button>
    </div>
  );
}

function SectionList({ title, items, variant }) {
  return (
    <div className="rounded-[var(--radius-card)] border-2 border-border bg-surface p-5">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-muted">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}