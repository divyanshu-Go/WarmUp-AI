"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function TranscriptDrawer({ transcript }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!transcript) return null;

  return (
    <div className="mt-6 rounded-[var(--radius-control)] border-2 border-border bg-surface">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted hover:text-foreground"
      >
        <span>Last Answer Transcript</span>
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {isOpen && (
        <div className="border-t-2 border-border px-4 py-3 text-sm leading-relaxed text-foreground">
          {transcript}
        </div>
      )}
    </div>
  );
}