// frontend/app/dashboard/interview/page.js
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Mic } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

import InterviewHeader from "./_components/InterviewHeader";
import VoiceOrbVisualizer from "./_components/VoiceOrbVisualizer";
import QuestionCard from "./_components/QuestionCard";
import RecordingControlBar from "./_components/RecordingControlBar";
import TranscriptDrawer from "./_components/TranscriptDrawer";
import FeedbackReport from "./_components/FeedbackReport";

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
  const searchParams = useSearchParams();
  const queryResumeId = searchParams.get("resumeId") || "";
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
  useEffect(() => {
    if (!queryResumeId) return;
    setResumeId(queryResumeId);
    try {
      window.localStorage.setItem(RESUME_STORAGE_KEY, queryResumeId);
    } catch (storageError) {
      console.warn("Unable to save resume ID from URL.", storageError);
    }
  }, [queryResumeId]);
  const [interview, setInterview] = useState(null);
  const [question, setQuestion] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [latestTranscript, setLatestTranscript] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
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

  const restoreInterviewSession = useCallback(async (interviewId) => {
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
      console.warn("Unable to restore interview from browser storage.", storageError);
      return undefined;
    }

    if (!activeInterviewId) return undefined;

    let isMounted = true;

    Promise.resolve()
      .then(() => (isMounted ? restoreInterviewSession(activeInterviewId) : undefined))
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError.message || "Unable to restore the interview.");
          setPhase("ready");
          try {
            window.sessionStorage.removeItem(ACTIVE_INTERVIEW_STORAGE_KEY);
          } catch (storageError) {
            console.warn("Unable to clear saved interview ID.", storageError);
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isLoading, user, restoreInterviewSession]);

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

  // Auto-play audio or start reading countdown when question arrives
  useEffect(() => {
    if (phase !== "question_ready" || !question) return;

    if (autoSpeak && question.audio_url) {
      playQuestionAudio();
    } else {
      if (question.kind === "conclusion") {
        completeInterviewAfterConclusion();
      } else {
        startThinkingCountdown(10);
      }
    }
  }, [phase, question, autoSpeak]);

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

  function showNextInterviewTurn(interviewData, nextQuestion) {
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

  async function completeInterviewAfterConclusion() {
    if (!interview) return;

    setPhase("completing");
    setError("");

    try {
      const completionResponse = await fetch(
        `${API_URL}/api/interviews/${interview.id}/complete`,
        { method: "POST", credentials: "include" }
      );
      const completedInterview = await readResponse(completionResponse);
      setInterview(completedInterview);

      const feedbackResponse = await fetch(
        `${API_URL}/api/interviews/${interview.id}/feedback`,
        { credentials: "include", cache: "no-store" }
      );
      setFeedback(await readResponse(feedbackResponse));
      setPhase("complete");
    } catch (completionError) {
      setError(
        completionError.message || "Unable to prepare final interview feedback."
      );
      setPhase("error");
    }
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
        body: JSON.stringify({
          resume_id: resumeId.trim(),
          auto_speak: autoSpeak,
        }),
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

  async function playQuestionAudio() {
    if (!question?.audio_url) {
      startThinkingCountdown(10);
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
      audioRef.current.onended = () => {
        if (question.kind === "conclusion") {
          completeInterviewAfterConclusion();
        } else {
          startThinkingCountdown(5);
        }
      };
      await audioRef.current.play();
      setPhase("playing");
    } catch (playError) {
      setError(playError.message || "Unable to play question audio.");
      startThinkingCountdown(10);
    }
  }

  function startThinkingCountdown(seconds = 5) {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
    }
    setCountdown(seconds);
    setPhase("thinking");
    let remaining = seconds;

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
        submitAnswerRecording(recording, recorder.mimeType || "audio/webm");
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

  async function submitAnswerRecording(recording, mimeType) {
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
        `${API_URL}/api/interviews/${interview.id}/questions/${currentQuestion.id}/answers?auto_speak=${autoSpeak}`,
        {
          method: "POST",
          credentials: "include",
          body: formData,
        }
      );
      const data = await readResponse(response);
      setLatestTranscript(data.transcript || "");
      showNextInterviewTurn(
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

  async function retryAnswerProcessing() {
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
      showNextInterviewTurn(
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

  async function endInterviewSession() {
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
      console.warn("Unable to clear saved interview ID.", storageError);
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
    "completing",
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
        Technical Interview
      </h1>
      <p className="mt-2 text-sm text-muted">
        Adaptive voice practice session powered by AI.
      </p>

      <section className="mt-6 rounded-[var(--radius-card)] border-2 border-foreground bg-surface p-[var(--ui-space-card)] shadow-[3px_3px_0_var(--primary)]">
        {/* Start Interview Form */}
        {phase === "ready" && (
          <form onSubmit={startInterview}>
            <label htmlFor="resume-id" className="block text-sm font-bold">
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
              Uses your latest uploaded resume text to generate dynamic technical probes.
            </p>
            <div className="mt-4 flex items-start gap-3">
              <input
                id="auto-speak"
                type="checkbox"
                checked={autoSpeak}
                onChange={(event) => setAutoSpeak(event.target.checked)}
                aria-describedby="auto-speak-description"
                className="mt-0.5 h-4 w-4 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
              <div>
                <label
                  htmlFor="auto-speak"
                  className="cursor-pointer text-sm font-bold"
                >
                  Speak questions automatically
                </label>
                <p id="auto-speak-description" className="mt-1 text-xs text-muted">
                  Turn off to skip generated question audio. Questions stay visible and answers are still recorded.
                </p>
              </div>
            </div>
            <button
              type="submit"
              disabled={!resumeId.trim()}
              className="mt-5 inline-flex items-center gap-2 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-[2px_2px_0_var(--foreground)] transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
              Start Technical Interview
            </button>
          </form>
        )}

        {/* Loading Spinner Indicator */}
        {isBusy && (
          <div className="flex items-center gap-3 py-8">
            <Loader2 size={22} className="animate-spin text-primary" />
            <p className="text-sm font-medium">
              {phase === "starting" && "Analyzing resume roadmap & preparing intro..."}
              {phase === "loading" && "Restoring session..."}
              {phase === "loading_audio" && "Synthesizing voice audio..."}
              {phase === "uploading" && "Transcribing recording via Whisper STT..."}
              {phase === "processing" && "Evaluating answer & planning next probe..."}
              {phase === "completing" && "Generating overall interview feedback..."}
            </p>
          </div>
        )}

        {/* Voice Room View */}
        {question && !["ready", "starting", "loading", "complete"].includes(phase) && (
          <div>
            <InterviewHeader
              question={question}
              interview={interview}
              autoSpeak={autoSpeak}
              onToggleAutoSpeak={() => setAutoSpeak((prev) => !prev)}
            />

            <VoiceOrbVisualizer
              phase={phase}
              countdown={countdown}
              autoSpeak={autoSpeak}
            />

            <QuestionCard questionText={question.text} />

            <RecordingControlBar
              phase={phase}
              onStopRecording={stopRecording}
              audioMeterBarsRef={audioMeterBarsRef}
            />

            <TranscriptDrawer transcript={latestTranscript} />

            {/* Error Handlers */}
            {phase === "error" && retry && (
              <button
                type="button"
                onClick={retryAnswerProcessing}
                className="mt-4 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-hover"
              >
                Retry Processing
              </button>
            )}

            {phase === "error" && question.kind === "conclusion" && (
              <button
                type="button"
                onClick={completeInterviewAfterConclusion}
                className="mt-4 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-hover"
              >
                Retry Final Feedback
              </button>
            )}

            {phase !== "complete" && (
              <div className="mt-6 border-t-2 border-border pt-4">
                <button
                  type="button"
                  onClick={endInterviewSession}
                  disabled={isBusy}
                  className="text-xs font-semibold text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                >
                  End Interview Session
                </button>
              </div>
            )}
          </div>
        )}

        {/* Final Feedback View */}
        {phase === "complete" && feedback && (
          <div>
            <FeedbackReport
              feedback={feedback}
              onStartOver={endInterviewSession}
            />
            <TranscriptDrawer transcript={latestTranscript} />
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-red-600">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}