"use client";

export default function QuestionCard({ questionText }) {
  if (!questionText) return null;

  return (
    <div className="rounded-[var(--radius-card)] border-2 border-foreground bg-surface p-6 shadow-[3px_3px_0_var(--primary)]">
      <h2 className="text-xl font-bold leading-relaxed tracking-tight text-foreground sm:text-2xl">
        {questionText}
      </h2>
    </div>
  );
}