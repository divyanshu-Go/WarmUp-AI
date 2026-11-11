"use client";

import { Volume2, VolumeX } from "lucide-react";

export default function InterviewHeader({
  question,
  interview,
  autoSpeak,
  onToggleAutoSpeak,
}) {
  if (!question) return null;

  function getQuestionLabel(q) {
    if (q.kind === "followup") return "Follow-up Probe";
    const labels = {
      introduction: "Introduction",
      project: "Project Spotlight",
      skill: "Technical Depth",
      hr: "Behavioral & HR",
      conclusion: "Wrap-up",
    };
    return labels[q.stage] || "Technical Probe";
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-border pb-4">
      {/* Stage Badge & Active Topic */}
      <div className="flex items-center gap-2">
        <span className="rounded-[var(--radius-small)] border-2 border-foreground bg-secondary px-3 py-1 text-xs font-bold uppercase tracking-wider text-foreground">
          {getQuestionLabel(question)}
        </span>
        {question.topic && question.topic !== "General" && (
          <span className="truncate text-xs font-semibold text-muted">
            • {question.topic}
          </span>
        )}
      </div>

      {/* Speaker Toggle Button */}
      <button
        type="button"
        onClick={onToggleAutoSpeak}
        className={`inline-flex items-center gap-2 rounded-[var(--radius-control)] border-2 px-3 py-1.5 text-xs font-bold transition ${
          autoSpeak
            ? "border-foreground bg-primary text-white shadow-[2px_2px_0_var(--foreground)]"
            : "border-border bg-surface text-muted hover:text-foreground"
        }`}
      >
        {autoSpeak ? <Volume2 size={15} /> : <VolumeX size={15} />}
        Auto-Speak {autoSpeak ? "ON" : "OFF"}
      </button>
    </div>
  );
}