"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  FileText,
  Loader2,
  Mic,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import FeedbackReport from "../_components/FeedbackReport";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const RESUME_STORAGE_KEY = "warmup_resume_id";
const ACTIVE_INTERVIEW_STORAGE_KEY = "warmup_active_interview_id";

function formatDateTime(dateString) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PersistentInterviewFeedbackPage({ params }) {
  const { interviewId } = use(params);
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [interview, setInterview] = useState(null);
  const [resume, setResume] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [showResumeText, setShowResumeText] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (isLoading || !user || !interviewId) return undefined;

    let isMounted = true;

    async function loadInterviewDetails() {
      setIsLoadingData(true);
      setError("");

      try {
        const [interviewRes, feedbackRes] = await Promise.all([
          fetch(`${API_URL}/api/interviews/${interviewId}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`${API_URL}/api/interviews/${interviewId}/feedback`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        if (!interviewRes.ok) {
          const errData = await interviewRes.json().catch(() => ({}));
          throw new Error(errData.detail || "Interview not found.");
        }

        if (!feedbackRes.ok) {
          const errData = await feedbackRes.json().catch(() => ({}));
          throw new Error(errData.detail || "Feedback is not available for this interview.");
        }

        const [interviewData, feedbackData] = await Promise.all([
          interviewRes.json(),
          feedbackRes.json(),
        ]);

        let resumeData = null;
        if (interviewData.resume_id) {
          const resumeRes = await fetch(
            `${API_URL}/api/resumes/${interviewData.resume_id}`,
            {
              credentials: "include",
              cache: "no-store",
            }
          );
          if (resumeRes.ok) {
            resumeData = await resumeRes.json();
          }
        }

        if (isMounted) {
          setInterview(interviewData);
          setFeedback(feedbackData);
          setResume(resumeData);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message || "Unable to load interview feedback.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingData(false);
        }
      }
    }

    loadInterviewDetails();

    return () => {
      isMounted = false;
    };
  }, [isLoading, user, interviewId]);

  function handlePracticeAgain() {
    const targetResumeId = interview?.resume_id || "";
    try {
      if (targetResumeId) {
        window.localStorage.setItem(RESUME_STORAGE_KEY, targetResumeId);
      }
      window.sessionStorage.removeItem(ACTIVE_INTERVIEW_STORAGE_KEY);
    } catch {
      // Ignore storage restrictions
    }

    router.push(
      targetResumeId
        ? `/dashboard/interview?resumeId=${encodeURIComponent(targetResumeId)}`
        : "/dashboard/interview"
    );
  }

  if (isLoading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center px-[var(--page-gutter)]">
        <p className="text-sm text-muted">Checking your session...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[var(--content-width)] flex-1 px-[var(--page-gutter)] py-[var(--ui-space-section)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft size={16} /> Back to Your Space
        </Link>

        {interview?.resume_id && (
          <button
            type="button"
            onClick={handlePracticeAgain}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-[2px_2px_0_var(--foreground)] transition hover:bg-primary-hover"
          >
            <Mic size={14} /> Practice Again on This Resume
          </button>
        )}
      </div>

      {isLoadingData ? (
        <div className="mt-10 flex items-center gap-3 text-sm text-muted">
          <Loader2 size={20} className="animate-spin text-primary" />
          Loading interview report and resume snapshot...
        </div>
      ) : error ? (
        <div className="mt-6 rounded-[var(--radius-card)] border-2 border-foreground bg-surface p-6">
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold underline underline-offset-4"
          >
            Return to dashboard
          </Link>
        </div>
      ) : (
        <>
          {/* Resume Snapshot Context Card */}
          <section className="mt-6 rounded-[var(--radius-card)] border-2 border-foreground bg-surface p-5 shadow-[3px_3px_0_var(--border)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-foreground bg-surface-raised text-primary">
                  <FileText size={18} />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                    Interviewed On Resume
                  </span>
                  <h2 className="text-base font-bold break-all">
                    {resume?.filename || "Uploaded Resume"}
                  </h2>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={12} />
                      Completed {formatDateTime(interview?.completed_at || interview?.created_at)}
                    </span>
                    {resume?.created_at && (
                      <span>
                        • Resume uploaded {new Date(resume.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {resume && (
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`${API_URL}/api/resumes/${resume.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border-2 border-border bg-background px-3 py-1.5 text-xs font-bold transition hover:border-foreground"
                  >
                    Open PDF <ExternalLink size={13} />
                  </a>

                  {resume.resume_text && (
                    <button
                      type="button"
                      onClick={() => setShowResumeText((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border-2 border-border bg-background px-3 py-1.5 text-xs font-bold transition hover:border-foreground"
                    >
                      {showResumeText ? "Hide Resume Text" : "View Resume Text"}
                    </button>
                  )}
                </div>
              )}
            </div>

            {showResumeText && resume?.resume_text && (
              <pre className="mt-4 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-control)] border-2 border-border bg-background p-3 font-mono text-xs leading-relaxed text-muted">
                {resume.resume_text}
              </pre>
            )}
          </section>

          {/* Persistent Feedback Report */}
          {feedback && (
            <section className="mt-6 rounded-[var(--radius-card)] border-2 border-foreground bg-surface p-[var(--ui-space-card)] shadow-[3px_3px_0_var(--primary)]">
              <FeedbackReport
                feedback={feedback}
                onStartOver={handlePracticeAgain}
              />
            </section>
          )}
        </>
      )}
    </main>
  );
}