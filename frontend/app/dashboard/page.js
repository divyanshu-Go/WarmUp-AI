// frontend/app/dashboard/page.js
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Mic,
  Play,
  Upload,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const RESUME_STORAGE_KEY = "warmup_resume_id";
const ACTIVE_INTERVIEW_STORAGE_KEY = "warmup_active_interview_id";

function formatDate(dateString) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusBadge(status) {
  switch (status) {
    case "completed":
      return {
        label: "Completed",
        className: "border-emerald-700 bg-emerald-500/10 text-emerald-800",
        Icon: CheckCircle2,
      };
    case "in_progress":
    case "concluding":
    case "evaluating":
      return {
        label: "In Progress",
        className: "border-amber-700 bg-amber-500/10 text-amber-800",
        Icon: Clock,
      };
    default:
      return {
        label: status.replace("_", " "),
        className: "border-border bg-surface-raised text-muted",
        Icon: Clock,
      };
  }
}

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [resumes, setResumes] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [isFetchingData, setIsFetchingData] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showResumeText, setShowResumeText] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  const loadUserSpace = useCallback(async () => {
    setIsFetchingData(true);
    setError("");

    try {
      const [resumesRes, interviewsRes] = await Promise.all([
        fetch(`${API_URL}/api/resumes`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`${API_URL}/api/interviews`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      if (!resumesRes.ok || !interviewsRes.ok) {
        throw new Error("Unable to load your workspace data.");
      }

      const [resumesData, interviewsData] = await Promise.all([
        resumesRes.json(),
        interviewsRes.json(),
      ]);

      setResumes(resumesData);
      setInterviews(interviewsData);

      // Keep localStorage synced with the latest resume if available
      if (resumesData.length > 0) {
        try {
          window.localStorage.setItem(RESUME_STORAGE_KEY, resumesData[0].id);
        } catch {
          // Ignore storage restrictions
        }
      }
    } catch (loadError) {
      setError(loadError.message || "Something went wrong loading your space.");
    } finally {
      setIsFetchingData(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && user) {
      loadUserSpace();
    }
  }, [isLoading, user, loadUserSpace]);

  async function handleResumeUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_URL}/api/resumes/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Unable to upload resume.");
      }

      await loadUserSpace();
      setShowResumeText(false);
    } catch (uploadError) {
      setError(uploadError.message || "Resume upload failed.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleStartNewInterview(resumeId) {
    try {
      window.localStorage.setItem(RESUME_STORAGE_KEY, resumeId);
      window.sessionStorage.removeItem(ACTIVE_INTERVIEW_STORAGE_KEY);
    } catch {
      // Ignore storage restrictions
    }
    router.push(`/dashboard/interview?resumeId=${encodeURIComponent(resumeId)}`);
  }

  function handleResumeActiveSession(interviewId) {
    try {
      window.sessionStorage.setItem(ACTIVE_INTERVIEW_STORAGE_KEY, interviewId);
    } catch {
      // Ignore storage restrictions
    }
    router.push("/dashboard/interview");
  }

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted">
        Checking your session...
      </div>
    );
  }

  const currentResume = resumes[0] || null;

  return (
    <main className="mx-auto w-full max-w-[var(--content-width)] flex-1 px-[var(--page-gutter)] py-[var(--ui-space-section)]">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {user.name ? `${user.name}'s Space` : "Your Space"}
          </h1>
          <p className="mt-1 truncate text-sm text-muted">{user.email}</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleResumeUpload}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border-2 border-foreground bg-surface px-4 py-2 text-sm font-bold transition hover:bg-surface-raised disabled:opacity-50"
        >
          {isUploading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Upload size={16} />
          )}
          {currentResume ? "Upload New Resume" : "Upload Resume (PDF)"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {isFetchingData ? (
        <div className="mt-10 flex items-center gap-3 text-sm text-muted">
          <Loader2 size={18} className="animate-spin text-primary" />
          Loading your resume and interview history...
        </div>
      ) : (
        <>
          {/* Section 1: Current Resume */}
          <section className="mt-8 rounded-[var(--radius-card)] border-2 border-foreground bg-surface p-[var(--ui-space-card)] shadow-[3px_3px_0_var(--primary)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Current Active Resume
              </span>
              {resumes.length > 1 && (
                <span className="text-xs text-muted">
                  {resumes.length} total versions uploaded
                </span>
              )}
            </div>

            {currentResume ? (
              <div className="mt-3">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-foreground bg-surface-raised text-primary">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold break-all">
                        {currentResume.filename}
                      </h2>
                      <p className="mt-1 text-xs text-muted">
                        Uploaded {formatDate(currentResume.created_at)}
                        {currentResume.file_size_bytes
                          ? ` • ${formatFileSize(currentResume.file_size_bytes)}`
                          : ""}
                        {currentResume.candidate_name
                          ? ` • Parsed as ${currentResume.candidate_name}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <a
                      href={`${API_URL}/api/resumes/${currentResume.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border-2 border-border bg-background px-3 py-2 text-xs font-bold transition hover:border-foreground"
                    >
                      View PDF <ExternalLink size={14} />
                    </a>

                    {currentResume.resume_text && (
                      <button
                        type="button"
                        onClick={() => setShowResumeText((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border-2 border-border bg-background px-3 py-2 text-xs font-bold transition hover:border-foreground"
                      >
                        {showResumeText ? "Hide Extracted Text" : "Extracted Text"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleStartNewInterview(currentResume.id)}
                      className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2 text-xs font-bold text-white shadow-[2px_2px_0_var(--foreground)] transition hover:bg-primary-hover"
                    >
                      <Mic size={14} /> Start Practice Interview
                    </button>
                  </div>
                </div>

                {showResumeText && currentResume.resume_text && (
                  <pre className="mt-4 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-control)] border-2 border-border bg-background p-3 font-mono text-xs leading-relaxed text-muted">
                    {currentResume.resume_text}
                  </pre>
                )}
              </div>
            ) : (
              <div className="mt-3">
                <h2 className="text-lg font-bold">No resume uploaded yet</h2>
                <p className="mt-1 text-sm text-muted">
                  Upload a PDF resume to unlock personalized AI voice interviews.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-[2px_2px_0_var(--foreground)] transition hover:bg-primary-hover"
                >
                  <Upload size={16} /> Upload PDF Resume
                </button>
              </div>
            )}
          </section>

          {/* Section 2: Previous Interviews & Feedback */}
          <section className="mt-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight">
                  Previous Interviews & Feedback
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Review past evaluations alongside the exact resume version used.
                </p>
              </div>
              <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-bold text-muted">
                {interviews.length} {interviews.length === 1 ? "session" : "sessions"}
              </span>
            </div>

            {interviews.length === 0 ? (
              <div className="mt-4 rounded-[var(--radius-card)] border-2 border-dashed border-border bg-surface/50 p-8 text-center">
                <p className="text-sm font-medium">
                  You haven&apos;t taken any practice interviews yet.
                </p>
                <p className="mt-1 text-xs text-muted">
                  Completed interviews and detailed question-by-question feedback will appear here.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {interviews.map((item) => {
                  const badge = getStatusBadge(item.status);
                  const BadgeIcon = badge.Icon;
                  const isResumable = ["in_progress", "concluding", "evaluating"].includes(
                    item.status
                  );

                  return (
                    <article
                      key={item.id}
                      className="rounded-[var(--radius-card)] border-2 border-foreground bg-surface p-5 shadow-[2px_2px_0_var(--border)] transition hover:shadow-[3px_3px_0_var(--primary)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-2">
                          {/* Top metadata row */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${badge.className}`}
                            >
                              <BadgeIcon size={12} />
                              {badge.label}
                            </span>

                            <span className="text-xs text-muted">
                              {formatDate(item.completed_at || item.created_at)}
                            </span>

                            <span className="text-xs text-muted">
                              • {item.core_questions_asked}/{item.core_question_target} core questions
                            </span>
                          </div>

                          {/* Score & Verdict if available */}
                          {item.has_feedback ? (
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="inline-flex items-center gap-1.5 text-base font-bold">
                                <Award size={18} className="text-primary" />
                                {item.overall_score} / {item.max_score}
                              </span>
                              {item.readiness_verdict && (
                                <span className="rounded-md border border-border bg-surface-raised px-2 py-0.5 text-xs font-semibold">
                                  {item.readiness_verdict}
                                </span>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm font-semibold">
                              Technical Practice Session
                            </p>
                          )}

                          {/* Resume snapshot tag */}
                          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted">
                            <span>Taken on resume:</span>
                            <a
                              href={`${API_URL}/api/resumes/${item.resume_id}/file`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 font-medium text-foreground transition hover:border-primary"
                              title="Open the exact PDF resume used for this interview"
                            >
                              <FileText size={12} className="text-primary" />
                              {item.resume_filename}
                              <ExternalLink size={11} className="text-muted" />
                            </a>
                          </div>
                        </div>

                        {/* Action button */}
                        <div className="flex items-center self-center">
                          {item.has_feedback ? (
                            <Link
                              href={`/dashboard/interview/${item.id}`}
                              className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2 text-xs font-bold text-white shadow-[2px_2px_0_var(--foreground)] transition hover:bg-primary-hover"
                            >
                              View Feedback <ArrowRight size={14} />
                            </Link>
                          ) : isResumable ? (
                            <button
                              type="button"
                              onClick={() => handleResumeActiveSession(item.id)}
                              className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border-2 border-foreground bg-surface-raised px-4 py-2 text-xs font-bold transition hover:border-primary"
                            >
                              <Play size={14} /> Resume Interview
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}