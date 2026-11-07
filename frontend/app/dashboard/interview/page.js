"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mic,
  Square,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const RESUME_STORAGE_KEY = "warmup_resume_id";
const ACTIVE_INTERVIEW_STORAGE_KEY = "warmup_active_interview_id";

function getErrorMessage(detail, fallback) {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail.message === "string") return detail.message;
  return fallback;
}

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      getErrorMessage(data.detail, "The request could not be completed.")
    );
    error.detail = data.detail;
    throw error;
  }

  return data;
}

function getRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Audio recording is not supported in this browser.");
  }

  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function getAudioExtension(mimeType) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  return "webm";
}

export default function InterviewPrototypePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const discardRecordingRef = useRef(false);
  const countdownTimerRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);
  const currentQuestionRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioMeterFrameRef = useRef(null);
  const audioMeterBarsRef = useRef([]);

  const [resumeId, setResumeId] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(RESUME_STORAGE_KEY) || "";
    } catch (storageError) {
      console.warn("Unable to load the saved resume ID.", storageError);
      return "";
    }
  });
  const [interview, setInterview] = useState(null);
  const [question, setQuestion] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [latestTranscript, setLatestTranscript] = useState("");
  const [phase, setPhase] = useState(() => {
    if (typeof window === "undefined") return "ready";
    try {
      return window.sessionStorage.getItem(ACTIVE_INTERVIEW_STORAGE_KEY)
        ? "loading"
        : "ready";
    } catch (storageError) {
      console.warn("Unable to read the saved interview ID.", storageError);
      return "ready";
    }
  });
  const [countdown, setCountdown] = useState(5);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(null);

  function updateInterviewProgress(interviewData, nextQuestion, status) {
    const updatedInterview = { ...interviewData, status };
    if (nextQuestion?.kind === "core") {
      updatedInterview.core_questions_asked += 1;
    } else if (nextQuestion?.kind === "followup") {
      updatedInterview.followups_asked += 1;
    }
    return updatedInterview;
  }

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    currentQuestionRef.current = question;
  }, [question]);

  const loadInterview = useCallback(async (interviewId) => {
    const response = await fetch(
      `${API_URL}/api/interviews/${interviewId}`,
      { credentials: "include", cache: "no-store" }
    );
    const data = await readResponse(response);

    setInterview(data);
    setQuestion(data.current_question);

    if (data.status === "completed") {
      const feedbackResponse = await fetch(
        `${API_URL}/api/interviews/${interviewId}/feedback`,
        { credentials: "include", cache: "no-store" }
      );
      setFeedback(await readResponse(feedbackResponse));
      setPhase("complete");
    } else if (data.current_question) {
      setPhase("question_ready");
    } else {
      setPhase("ready");
    }
  }, []);

  useEffect(() => {
    if (isLoading || !user) return undefined;

    let activeInterviewId;
    try {
      activeInterviewId = window.sessionStorage.getItem(
        ACTIVE_INTERVIEW_STORAGE_KEY
      );
    } catch (storageError) {
      console.warn("Unable to restore the interview from browser storage.", storageError);
      return undefined;
    }

    if (!activeInterviewId) return undefined;

    let isMounted = true;

    Promise.resolve()
      .then(() => (isMounted ? loadInterview(activeInterviewId) : undefined))
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError.message || "Unable to restore the interview.");
          setPhase("ready");
          try {
            window.sessionStorage.removeItem(ACTIVE_INTERVIEW_STORAGE_KEY);
          } catch (storageError) {
            console.warn("Unable to clear the saved interview ID.", storageError);
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isLoading, user, loadInterview]);

  useEffect(() => () => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
    }
    discardRecordingRef.current = true;
    stopAudioMeter();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }
  }, []);

  function stopAudioMeter() {
    if (audioMeterFrameRef.current !== null) {
      window.cancelAnimationFrame(audioMeterFrameRef.current);
      audioMeterFrameRef.current = null;
    }

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      audioContext.close().catch((audioError) => {
        console.warn("Unable to close microphone level meter.", audioError);
      });
    }

    audioMeterBarsRef.current.forEach((bar) => {
      if (bar) bar.style.transform = "scaleY(0.12)";
    });
  }

  function startAudioMeter(stream) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      stopAudioMeter();
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioContext;

      const samples = new Uint8Array(analyser.fftSize);
      const multipliers = [0.65, 1, 1.3, 1, 0.65];
      const updateLevel = () => {
        if (audioContextRef.current !== audioContext) return;

        analyser.getByteTimeDomainData(samples);
        const sumSquares = samples.reduce((sum, sample) => {
          const amplitude = (sample - 128) / 128;
          return sum + amplitude * amplitude;
        }, 0);
        const level = Math.sqrt(sumSquares / samples.length);

        audioMeterBarsRef.current.forEach((bar, index) => {
          if (!bar) return;
          const height = Math.min(1, Math.max(0.12, level * 10 * multipliers[index]));
          bar.style.transform = `scaleY(${height})`;
        });

        audioMeterFrameRef.current = window.requestAnimationFrame(updateLevel);
      };

      audioContext.resume().catch((audioError) => {
        console.warn("Unable to start microphone level meter.", audioError);
      });
      audioMeterFrameRef.current = window.requestAnimationFrame(updateLevel);
    } catch (audioError) {
      console.warn("Microphone level meter is unavailable.", audioError);
    }
  }

  function setCurrentTurn(interviewData, nextQuestion) {
    setInterview(interviewData);
    setQuestion(nextQuestion);
    setRetry(null);

    if (interviewData.status === "completed") {
      fetch(`${API_URL}/api/interviews/${interviewData.id}/feedback`, {
        credentials: "include",
        cache: "no-store",
      })
        .then(readResponse)
        .then((data) => {
          setFeedback(data);
          setPhase("complete");
        })
        .catch((feedbackError) => {
          setError(feedbackError.message || "Unable to load final feedback.");
          setPhase("error");
        });
      return;
    }

    setPhase("question_ready");
  }

  async function startInterview(event) {
    event.preventDefault();
    setError("");

    if (!resumeId.trim()) {
      setError("Enter a resume ID, or upload a resume first.");
      return;
    }

    if (!API_URL) {
      setError("The backend URL is not configured.");
      return;
    }

    setPhase("starting");
    setLatestTranscript("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone recording is not supported in this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const response = await fetch(`${API_URL}/api/interviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ resume_id: resumeId.trim() }),
      });
      const data = await readResponse(response);

      setInterview(data);
      setQuestion(data.current_question);
      try {
        window.localStorage.setItem(RESUME_STORAGE_KEY, resumeId.trim());
        window.sessionStorage.setItem(ACTIVE_INTERVIEW_STORAGE_KEY, data.id);
      } catch (storageError) {
        console.warn("Unable to save interview state in browser storage.", storageError);
      }
      setPhase("question_ready");
    } catch (startError) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setError(startError.message || "Unable to start the interview.");
      setPhase("ready");
    }
  }

  async function playQuestion() {
    if (!question?.audio_url) {
      setError("This question has no speech audio.");
      return;
    }

    setError("");
    setPhase("loading_audio");

    try {
      const response = await fetch(new URL(question.audio_url, API_URL), {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Unable to load question audio.");
      }

      const audioBlob = await response.blob();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      audioUrlRef.current = URL.createObjectURL(audioBlob);
      audioRef.current = new Audio(audioUrlRef.current);
      audioRef.current.onended = beginThinkingCountdown;
      await audioRef.current.play();
      setPhase("playing");
    } catch (playError) {
      setError(playError.message || "Unable to play question audio.");
      setPhase("question_ready");
    }
  }

  function beginThinkingCountdown() {
    setCountdown(5);
    setPhase("thinking");
    let remaining = 5;

    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);

      if (remaining <= 0) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        startRecording();
      }
    }, 1000);
  }

  function startRecording() {
    const stream = mediaStreamRef.current;
    if (!stream?.active) {
      setError("Microphone access was lost. Start the interview again.");
      setPhase("error");
      return;
    }

    try {
      const mimeType = getRecordingMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      recordingChunksRef.current = [];
      discardRecordingRef.current = false;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        if (discardRecordingRef.current) {
          recordingChunksRef.current = [];
          return;
        }
        const recording = new Blob(recordingChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        uploadAnswer(recording, recorder.mimeType || "audio/webm");
      };

      recorder.start();
      startAudioMeter(stream);
      setPhase("recording");
    } catch (recordError) {
      setError(recordError.message || "Unable to start recording.");
      setPhase("error");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    stopAudioMeter();
  }

  async function uploadAnswer(recording, mimeType) {
    const currentQuestion = currentQuestionRef.current;
    if (!interview || !currentQuestion) {
      setError("The current interview question is missing.");
      setPhase("error");
      return;
    }

    setPhase("uploading");
    setError("");
    const formData = new FormData();
    formData.append(
      "file",
      recording,
      `answer.${getAudioExtension(mimeType)}`
    );

    try {
      const response = await fetch(
        `${API_URL}/api/interviews/${interview.id}/questions/${currentQuestion.id}/answers`,
        {
          method: "POST",
          credentials: "include",
          body: formData,
        }
      );
      const data = await readResponse(response);
      setLatestTranscript(data.transcript || "");
      setCurrentTurn(
        updateInterviewProgress(
          interview,
          data.next_question,
          data.interview_status
        ),
        data.next_question
      );
    } catch (uploadError) {
      const detail = uploadError.detail;
      setError(uploadError.message || "Unable to submit the recording.");

      if (detail?.answer_id && detail.retryable) {
        setRetry({
          answerId: detail.answer_id,
          action: detail.message?.includes("transcribe")
            ? "retry-transcription"
            : "retry-evaluation",
        });
      }
      setPhase("error");
    }
  }

  async function retryProcessing() {
    if (!retry || !interview) return;

    setPhase("processing");
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/interviews/${interview.id}/answers/${retry.answerId}/${retry.action}`,
        { method: "POST", credentials: "include" }
      );
      const data = await readResponse(response);
      setLatestTranscript(data.transcript || "");
      setCurrentTurn(
        updateInterviewProgress(
          interview,
          data.next_question,
          data.interview_status
        ),
        data.next_question
      );
    } catch (retryError) {
      const detail = retryError.detail;
      setError(retryError.message || "Unable to retry answer processing.");
      if (!detail?.answer_id) {
        setRetry(null);
      }
      setPhase("error");
    }
  }

  async function stopInterview() {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    discardRecordingRef.current = true;
    stopAudioMeter();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    try {
      window.sessionStorage.removeItem(ACTIVE_INTERVIEW_STORAGE_KEY);
    } catch (storageError) {
      console.warn("Unable to clear the saved interview ID.", storageError);
    }
    setInterview(null);
    setQuestion(null);
    setFeedback(null);
    setLatestTranscript("");
    setRetry(null);
    setPhase("ready");
    setError("");
  }

  if (isLoading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center px-[var(--page-gutter)]">
        <p className="text-sm text-muted">Checking your session...</p>
      </main>
    );
  }

  const isBusy = [
    "starting",
    "loading",
    "loading_audio",
    "uploading",
    "processing",
  ].includes(phase);

  return (
    <main className="mx-auto w-full max-w-[var(--content-width)] flex-1 px-[var(--page-gutter)] py-[var(--ui-space-section)]">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft size={16} /> Dashboard
      </Link>

      <h1 className="mt-5 text-3xl font-bold tracking-tight">
        Interview prototype
      </h1>
      <p className="mt-2 text-sm text-muted">
        A simple end-to-end check of interview questions, audio, recording,
        transcription, and feedback.
      </p>

      <section className="mt-6 rounded-[var(--radius-card)] border-2 border-foreground bg-surface p-[var(--ui-space-card)] shadow-[3px_3px_0_var(--primary)]">
        {phase === "ready" && (
          <form onSubmit={startInterview}>
            <label
              htmlFor="resume-id"
              className="block text-sm font-bold"
            >
              Resume ID
            </label>
            <input
              id="resume-id"
              value={resumeId}
              onChange={(event) => setResumeId(event.target.value)}
              placeholder="Uses your latest uploaded resume"
              className="mt-2 w-full rounded-[var(--radius-control)] border-2 border-foreground bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <p className="mt-2 text-xs text-muted">
              This prototype uses the latest resume uploaded while signed in.
              You can also paste another resume ID.
            </p>
            <button
              type="submit"
              disabled={!resumeId.trim()}
              className="mt-5 inline-flex items-center gap-2 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-[2px_2px_0_var(--primary)] transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
              Start interview
            </button>
          </form>
        )}

        {isBusy && (
          <div className="flex items-center gap-3 py-4">
            <Loader2 size={19} className="animate-spin text-primary" />
            <p className="text-sm font-medium">
              {phase === "starting" && "Preparing your first question..."}
              {phase === "loading" && "Restoring your interview..."}
              {phase === "loading_audio" && "Loading question audio..."}
              {phase === "uploading" && "Uploading and transcribing your answer..."}
              {phase === "processing" && "Evaluating your answer..."}
            </p>
          </div>
        )}

        {question && !["ready", "starting", "loading", "complete"].includes(phase) && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                {question.kind === "followup" ? "Follow-up" : "Core question"}{" "}
                {question.sequence_number}
              </p>
              <p className="text-xs text-muted">
                {interview?.core_questions_asked || 0} /{" "}
                {interview?.core_question_target || 5} core questions
                {" · "}
                {interview?.followups_asked || 0} /{" "}
                {interview?.max_followups || 2} follow-ups
              </p>
            </div>
            <h2 className="mt-4 text-xl font-bold leading-snug">
              {question.text}
            </h2>

            {phase === "question_ready" && (
              <button
                type="button"
                onClick={playQuestion}
                className="mt-5 inline-flex items-center gap-2 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-[2px_2px_0_var(--primary)] transition hover:bg-primary-hover"
              >
                <Volume2 size={17} /> Play question
              </button>
            )}

            {phase === "playing" && (
              <p className="mt-5 text-sm font-medium text-muted">
                Listen to the question. Recording starts after it finishes.
              </p>
            )}

            {phase === "thinking" && (
              <p className="mt-5 text-lg font-bold text-primary" aria-live="polite">
                Recording starts in {countdown}...
              </p>
            )}

            {latestTranscript && (
              <div className="mt-5 rounded-[var(--radius-control)] border-2 border-border bg-surface-raised p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  Your last answer (transcript)
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {latestTranscript}
                </p>
              </div>
            )}

            {phase === "recording" && (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-bold text-red-700">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
                  Recording — speak now
                </span>
                <div
                  className="flex h-8 items-center gap-1 px-1"
                  role="img"
                  aria-label="Live microphone input level"
                >
                  {[0, 1, 2, 3, 4].map((index) => (
                    <span
                      key={index}
                      ref={(element) => {
                        audioMeterBarsRef.current[index] = element;
                      }}
                      className="h-6 w-1.5 origin-center scale-y-[0.12] rounded-full bg-primary transition-transform duration-75"
                      style={{ transform: "scaleY(0.12)" }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-[2px_2px_0_var(--primary)] hover:bg-primary-hover"
                >
                  <Square size={15} fill="currentColor" /> Stop and submit
                </button>
              </div>
            )}

            {phase === "error" && retry && (
              <button
                type="button"
                onClick={retryProcessing}
                className="mt-4 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-[2px_2px_0_var(--primary)] hover:bg-primary-hover"
              >
                Retry processing
              </button>
            )}

            {phase !== "complete" && (
              <button
                type="button"
                onClick={stopInterview}
                disabled={isBusy}
                className="ml-3 mt-4 text-sm font-medium text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
              >
                End prototype interview
              </button>
            )}
          </div>
        )}

        {phase === "complete" && feedback && (
          <div>
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle2 size={22} />
              <h2 className="text-xl font-bold">Interview complete</h2>
            </div>
            {latestTranscript && (
              <div className="mt-4 rounded-[var(--radius-control)] border-2 border-border bg-surface-raised p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  Your last answer (transcript)
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {latestTranscript}
                </p>
              </div>
            )}
            <p className="mt-4 text-sm font-bold">
              Overall score: {feedback.overall_score} / 5
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {feedback.summary}
            </p>
            <FeedbackList title="Strengths" items={feedback.strengths} />
            <FeedbackList title="Areas to improve" items={feedback.improvements} />
            <FeedbackList title="Practice next" items={feedback.practice_suggestions} />
            <button
              type="button"
              onClick={stopInterview}
              className="mt-5 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-[2px_2px_0_var(--primary)] hover:bg-primary-hover"
            >
              Start over
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

function FeedbackList({ title, items }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-bold">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
