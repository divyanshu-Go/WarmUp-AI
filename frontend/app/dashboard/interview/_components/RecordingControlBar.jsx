"use client";

import { Square } from "lucide-react";

export default function RecordingControlBar({
  phase,
  onStopRecording,
  audioMeterBarsRef,
}) {
  if (phase !== "recording") return null;

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-control)] border-2 border-foreground bg-surface-raised p-4">
      {/* Live Mic Waveform Bars */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 text-xs font-bold uppercase text-red-600">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
          Live Input
        </span>
        <div
          className="flex h-6 items-center gap-1"
          role="img"
          aria-label="Microphone input volume"
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <span
              key={index}
              ref={(el) => {
                if (audioMeterBarsRef?.current) {
                  audioMeterBarsRef.current[index] = el;
                }
              }}
              className="h-5 w-1.5 origin-center scale-y-[0.12] rounded-full bg-primary transition-transform duration-75"
            />
          ))}
        </div>
      </div>

      {/* Stop & Submit Button */}
      <button
        type="button"
        onClick={onStopRecording}
        className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-[2px_2px_0_var(--foreground)] transition hover:bg-primary-hover"
      >
        <Square size={14} fill="currentColor" /> Stop & Submit Answer
      </button>
    </div>
  );
}