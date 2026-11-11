"use client";

import { Loader2 } from "lucide-react";

export default function VoiceOrbVisualizer({ phase, countdown, autoSpeak }) {
  // Visual state mapping
  const isSpeaking = phase === "playing" || phase === "loading_audio";
  const isThinking = phase === "thinking";
  const isRecording = phase === "recording";
  const isProcessing = phase === "uploading" || phase === "processing";

  return (
    <div className="my-6 flex flex-col items-center justify-center text-center">
      {/* Central Visualizer Ring */}
      <div className="relative flex h-24 w-24 items-center justify-center">
        {/* Pulsing Outer Rings */}
        {isSpeaking && (
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20 duration-1000" />
        )}
        {isRecording && (
          <div className="absolute -inset-2 animate-pulse rounded-full bg-red-500/20" />
        )}

        {/* Center Orb Base */}
        <div
          className={`flex h-20 w-20 items-center justify-center rounded-full border-2 border-foreground shadow-[3px_3px_0_var(--foreground)] transition-all duration-300 ${
            isSpeaking
              ? "bg-primary text-white scale-105"
              : isRecording
              ? "bg-red-600 text-white"
              : isThinking
              ? "bg-secondary text-foreground"
              : "bg-surface-raised text-muted"
          }`}
        >
          {isProcessing ? (
            <Loader2 size={28} className="animate-spin text-primary" />
          ) : isThinking ? (
            <span className="text-2xl font-bold">{countdown}s</span>
          ) : (
            <div
              className={`h-6 w-6 rounded-full ${
                isSpeaking
                  ? "bg-white animate-pulse"
                  : isRecording
                  ? "bg-white"
                  : "bg-primary/40"
              }`}
            />
          )}
        </div>
      </div>

      {/* State Status Text */}
      <p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted">
        {isSpeaking && "Amy is speaking..."}
        {isThinking && (autoSpeak ? "Get ready to answer..." : "Read question & phrase answer...")}
        {isRecording && "Microphone Active — Speak Now"}
        {isProcessing && "Evaluating answer & building next turn..."}
        {phase === "question_ready" && "Ready"}
      </p>
    </div>
  );
}