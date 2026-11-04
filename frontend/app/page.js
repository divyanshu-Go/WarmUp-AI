"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GoogleLogin } from "@react-oauth/google";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const PROCESSING_STEPS = [
  "Reading your experience",
  "Finding your strongest skills",
  "Preparing your interview workspace",
];

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Home() {
  const { user, login } = useAuth();
  const fileInputRef = useRef(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [uploadedResume, setUploadedResume] = useState(null);
  const [flowStage, setFlowStage] = useState("upload");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState(0);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [authStep, setAuthStep] = useState("email");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [claimError, setClaimError] = useState("");

  useEffect(() => {
    if (flowStage !== "processing") return undefined;

    let progress = 50;
    const timer = window.setInterval(() => {
      progress = Math.min(progress + 10, 100);
      setUploadProgress(progress);
      setProcessingStep(
        Math.min(
          Math.floor((progress - 50) / (50 / PROCESSING_STEPS.length)),
          PROCESSING_STEPS.length - 1
        )
      );

      if (progress === 100) {
        window.clearInterval(timer);
        setFlowStage("complete");
      }
    }, 420);

    return () => window.clearInterval(timer);
  }, [flowStage]);

  function selectResume(file) {
    setResumeError("");
    if (!file) return;

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setResumeError("Please choose a PDF resume.");
      return;
    }

    if (!file.size) {
      setResumeError("The selected file is empty.");
      return;
    }

    setResumeFile(file);
  }

  function handleResumeChange(event) {
    selectResume(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    selectResume(event.dataTransfer.files?.[0]);
  }

  async function beginProcessing() {
    setClaimError("");
    setFlowStage("processing");
  }

  async function claimResume() {
    if (!uploadedResume) return;

    if (!uploadedResume.claim_token) {
      setClaimError("We couldn't verify access to this upload. Please upload your resume again.");
      return;
    }

    setLoading(true);
    setClaimError("");

    try {
      const response = await fetch(
        `${API_URL}/api/resumes/${uploadedResume.id}/claim`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ claim_token: uploadedResume.claim_token }),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "We couldn't connect this resume to your account."
        );
      }

      setUploadedResume((previous) => ({
        ...previous,
        ...data,
        claim_token: null,
      }));
      await beginProcessing();
    } catch (error) {
      setClaimError(error.message || "We couldn't connect this resume to your account.");
    } finally {
      setLoading(false);
    }
  }

  async function finishAuthentication(userData) {
    login(userData);

    if (uploadedResume && !uploadedResume.user_id) {
      await claimResume();
      return;
    }

    await beginProcessing();
  }

  async function uploadResume() {
    if (!resumeFile || flowStage !== "upload") return;

    setFlowStage("uploading");
    setUploadProgress(0);
    setResumeError("");
    setUploadedResume(null);

    const formData = new FormData();
    formData.append("file", resumeFile);

    try {
      const data = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_URL}/api/resumes/upload`);
        xhr.withCredentials = true;

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(
              Math.min(46, Math.round((event.loaded / event.total) * 46))
            );
          }
        };

        xhr.onload = () => {
          let responseData = {};
          try {
            responseData = JSON.parse(xhr.responseText);
          } catch {
            reject(new Error("Invalid response from server."));
            return;
          }

          if (xhr.status < 200 || xhr.status >= 300) {
            reject(
              new Error(
                typeof responseData.detail === "string"
                  ? responseData.detail
                  : "Resume upload failed."
              )
            );
            return;
          }

          resolve(responseData);
        };

        xhr.onerror = () => reject(new Error("Unable to connect to the server."));
        xhr.onabort = () => reject(new Error("Resume upload was cancelled."));
        xhr.send(formData);
      });

      setUploadedResume(data);
      setEmail(data.candidate_email || "");
      setUploadProgress(50);

      if (user) {
        await beginProcessing();
      } else {
        setFlowStage("confirm");
      }
    } catch (error) {
      setResumeError(error.message || "Resume upload failed.");
      setFlowStage("upload");
      setUploadProgress(0);
    }
  }

  async function requestOTP(address) {
    const normalizedEmail = address.trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthError("Enter an email address to continue.");
      return;
    }

    setLoading(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const response = await fetch(`${API_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail =
          typeof data.detail === "string" ? data.detail : data.detail?.message;
        throw new Error(detail || "Unable to send a verification code.");
      }

      setEmail(normalizedEmail);
      setOtp("");
      setAuthStep("otp");
      setFlowStage("authenticate");
      setAuthMessage(`A verification code is on its way to ${normalizedEmail}.`);
    } catch (error) {
      setAuthError(error.message || "Unable to send a verification code.");
    } finally {
      setLoading(false);
    }
  }

  function handleEmailSubmit(event) {
    event.preventDefault();
    requestOTP(email);
  }

  async function verifyOTP(event) {
    event.preventDefault();
    setLoading(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const response = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Verification failed. Check the code and try again.");
      }

      await finishAuthentication(data.user);
    } catch (error) {
      setAuthError(error.message || "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSuccess(googleResponse) {
    if (!googleResponse?.credential) {
      setAuthError("Google did not return an authentication token.");
      return;
    }

    setLoading(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const response = await fetch(`${API_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ credential: googleResponse.credential }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Google sign-in failed.");
      }

      await finishAuthentication(data.user);
    } catch (error) {
      setAuthError(error.message || "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  const flowSteps = [
    { label: "Upload", done: flowStage !== "upload" && flowStage !== "uploading" },
    { label: "Verify", done: flowStage === "processing" || flowStage === "complete" },
    { label: "Prepare", done: flowStage === "complete" },
  ];

  return (
    <main className="relative flex-1 overflow-hidden px-[var(--page-gutter)] pb-10 pt-7 text-foreground sm:pt-10">
      <div className="relative mx-auto max-w-2xl">
        <div className="mb-6 text-center sm:mb-7">
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Get interview-ready.
            <span className="block text-primary">Start with your resume.</span>
          </h1>
        </div>

        <section
          id="auth"
          aria-label="Resume onboarding"
          className="flow-enter overflow-hidden rounded-[var(--radius-large)] border-2 border-border bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.32)]"
        >
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-bold">Resume setup</p>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <LockKeyhole size={13} className="text-primary" />
                Private
              </span>
            </div>

            <div className="mt-6 flex items-center">
              {flowSteps.map((step, index) => {
                const active =
                  (index === 0 && (flowStage === "upload" || flowStage === "uploading")) ||
                  (index === 1 && (flowStage === "confirm" || flowStage === "authenticate")) ||
                  (index === 2 && (flowStage === "processing" || flowStage === "complete"));

                return (
                  <div className="contents" key={step.label}>
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                          step.done
                            ? "border-primary bg-primary text-black"
                            : active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-muted"
                        }`}
                      >
                        {step.done ? <Check size={14} /> : `${index + 1}`}
                      </span>
                      <span className={active || step.done ? "text-xs font-medium text-foreground" : "text-xs text-muted"}>
                        {step.label}
                      </span>
                    </div>
                    {index < flowSteps.length - 1 && (
                      <span
                        className={`mx-3 h-px flex-1 sm:mx-5 ${
                          step.done ? "bg-primary/60" : "bg-border"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {flowStage === "upload" && (
              <div className="flow-enter">
                <h2 className="mb-4 text-base font-bold">Upload your resume</h2>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleResumeChange}
                  className="hidden"
                />

                {!resumeFile ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`flex min-h-48 w-full flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed px-5 py-7 text-center transition duration-200 ${
                      isDragging
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:border-primary/60 hover:bg-primary/[0.04]"
                    }`}
                  >
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-primary/20 bg-primary/10 text-primary">
                      <UploadCloud size={26} strokeWidth={1.8} />
                    </span>
                    <span className="text-sm font-medium">Drop your PDF here, or browse</span>
                    <span className="mt-2 text-xs text-muted">PDF only</span>
                    <span className="mt-4 rounded-[var(--radius-control)] border-2 border-primary bg-primary px-4 py-2 text-sm font-bold text-black transition hover:bg-primary-hover">
                      Browse files
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center gap-4 rounded-[var(--radius-card)] border-2 border-primary/40 bg-primary/[0.06] p-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <FileText size={22} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{resumeFile.name}</span>
                      <span className="mt-1 block text-xs text-muted">{formatFileSize(resumeFile.size)} · PDF</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setResumeFile(null)}
                      aria-label="Remove selected resume"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-raised hover:text-foreground"
                    >
                      <X size={17} />
                    </button>
                  </div>
                )}

                {resumeFile && (
                  <button
                    type="button"
                    onClick={uploadResume}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border-2 border-primary bg-primary py-3 text-sm font-bold text-black transition hover:bg-primary-hover"
                  >
                    Continue with this resume <ArrowRight size={17} />
                  </button>
                )}
              </div>
            )}

            {flowStage === "uploading" && (
              <div className="flow-enter py-7 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Loader2 size={26} className="animate-spin" />
                </span>
                <h2 className="mt-5 text-lg font-bold">Reading your resume</h2>
                <ProgressBar progress={uploadProgress} label="Reading your resume" />
              </div>
            )}

            {flowStage === "confirm" && (
              <div className="flow-enter py-2 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10 text-green-700">
                  <Mail size={25} />
                </span>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Resume uploaded · 50%
                </p>
                {uploadedResume?.candidate_email ? (
                  <>
                    <h2 className="mt-3 text-xl font-bold">Use this email?</h2>
                    <div className="mx-auto mt-5 flex max-w-md items-center justify-center gap-3 rounded-[var(--radius-control)] border-2 border-border bg-background px-4 py-3">
                      <Mail size={16} className="shrink-0 text-primary" />
                      <span className="break-all text-sm font-medium">{uploadedResume.candidate_email}</span>
                    </div>
                    <ProgressBar progress={50} label="Waiting for your confirmation" paused />
                    <div className="mx-auto mt-6 grid max-w-md gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => requestOTP(uploadedResume.candidate_email)}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 rounded-[var(--radius-control)] border-2 border-primary bg-primary px-4 py-3 text-sm font-bold text-black transition hover:bg-primary-hover disabled:opacity-60"
                      >
                        Yes, use this email <ArrowRight size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEmail("");
                          setAuthStep("email");
                          setAuthError("");
                          setFlowStage("authenticate");
                        }}
                        className="rounded-[var(--radius-control)] border-2 border-border bg-background px-4 py-3 text-sm font-bold transition hover:border-primary/60 hover:bg-surface-raised"
                      >
                        No, use another way
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="mt-3 text-xl font-bold">No email found</h2>
                    <ProgressBar progress={50} label="Resume ready" paused />
                    <button
                      type="button"
                      onClick={() => {
                        setAuthStep("email");
                        setFlowStage("authenticate");
                      }}
                      className="mt-6 rounded-[var(--radius-control)] border-2 border-primary bg-primary px-5 py-3 text-sm font-bold text-black transition hover:bg-primary-hover"
                    >
                      Continue to sign in <ArrowRight size={16} className="ml-1 inline" />
                    </button>
                  </>
                )}
              </div>
            )}

            {flowStage === "authenticate" && (
              <div className="flow-enter mx-auto max-w-md py-1">
                {claimError ? (
                  <div className="text-center">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700">
                      <ShieldCheck size={25} />
                    </span>
                    <h2 className="mt-5 text-lg font-bold">Resume not connected</h2>
                    <p role="alert" className="mt-4 text-sm text-red-700">{claimError}</p>
                    <button
                      type="button"
                      onClick={claimResume}
                      disabled={loading}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border-2 border-primary bg-primary py-3 text-sm font-bold text-black disabled:opacity-60"
                    >
                      {loading ? <Loader2 size={17} className="animate-spin" /> : <>Retry connection <ArrowRight size={16} /></>}
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {authStep === "otp" ? <ShieldCheck size={23} /> : <Mail size={23} />}
                    </span>
                    <h2 className="mt-5 text-xl font-bold">
                      {authStep === "otp" ? "Check your inbox" : "Choose how to continue"}
                    </h2>
                    {authStep === "otp" && (
                      <p className="mt-2 break-all text-sm text-muted">{email}</p>
                    )}

                    {authStep === "email" ? (
                      <>
                        <form onSubmit={handleEmailSubmit} className="mt-6">
                          <label htmlFor="email" className="mb-2 block text-sm font-medium">
                            Email address
                          </label>
                          <input
                            id="email"
                            type="email"
                            required
                            autoComplete="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="you@example.com"
                            className="w-full rounded-[var(--radius-control)] border-2 border-border bg-background px-4 py-3 text-sm outline-none transition placeholder:text-muted/60 focus:border-primary"
                          />
                          <button
                            type="submit"
                            disabled={loading || !email.trim()}
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border-2 border-primary bg-primary py-3 text-sm font-bold text-black transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {loading ? <Loader2 size={17} className="animate-spin" /> : <>Send a code <ArrowRight size={16} /></>}
                          </button>
                        </form>

                        <div className="my-5 flex items-center gap-3">
                          <span className="h-px flex-1 bg-border" />
                          <span className="text-[11px] font-medium text-muted">OR</span>
                          <span className="h-px flex-1 bg-border" />
                        </div>
                        <div className="flex justify-center">
                          <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={() => setAuthError("Google sign-in was unsuccessful.")}
                            theme="outline"
                            size="large"
                            text="continue_with"
                            shape="rectangular"
                          />
                        </div>

                        {uploadedResume?.candidate_email && (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthError("");
                              setFlowStage("confirm");
                            }}
                            className="mt-5 flex w-full items-center justify-center gap-2 text-sm text-muted transition hover:text-foreground"
                          >
                            <ArrowLeft size={15} /> Use the email from my resume
                          </button>
                        )}
                      </>
                    ) : (
                      <form onSubmit={verifyOTP} className="mt-6">
                        <label htmlFor="otp" className="mb-2 block text-sm font-medium">
                          Verification code
                        </label>
                        <input
                          id="otp"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          required
                          value={otp}
                          onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                          placeholder="000000"
                          className="w-full rounded-[var(--radius-control)] border-2 border-border bg-background px-4 py-3.5 text-center text-2xl tracking-[0.5em] outline-none transition placeholder:text-muted/40 focus:border-primary"
                        />
                        <button
                          type="submit"
                          disabled={loading || otp.length !== 6}
                          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border-2 border-primary bg-primary py-3 text-sm font-bold text-black transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {loading ? <Loader2 size={17} className="animate-spin" /> : <>Verify and continue <ArrowRight size={16} /></>}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthStep("email");
                            setOtp("");
                            setAuthError("");
                            setAuthMessage("");
                          }}
                          className="mt-4 flex w-full items-center justify-center gap-2 text-sm text-muted transition hover:text-foreground"
                        >
                          <ArrowLeft size={15} /> Use a different email
                        </button>
                      </form>
                    )}

                    {authMessage && <p className="mt-4 text-center text-sm text-green-700">{authMessage}</p>}
                    {authError && <p role="alert" className="mt-4 text-center text-sm text-red-700">{authError}</p>}
                  </>
                )}
              </div>
            )}

            {flowStage === "processing" && (
              <div className="flow-enter py-7 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Sparkles size={25} className="animate-pulse" />
                </span>
                <h2 className="mt-5 text-lg font-bold">Preparing your interview</h2>
                <ProgressBar progress={uploadProgress} label={PROCESSING_STEPS[processingStep]} />
                <div className="mx-auto mt-7 max-w-md space-y-3 text-left">
                  {PROCESSING_STEPS.map((step, index) => {
                    const complete = index < processingStep;
                    const active = index === processingStep;
                    return (
                      <div key={step} className={`flex items-center gap-3 text-sm ${active ? "text-foreground" : complete ? "text-muted" : "text-muted/55"}`}>
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full ${complete ? "bg-green-500/10 text-green-700" : active ? "bg-primary/10 text-primary" : "bg-background text-muted/50"}`}>
                          {complete ? <Check size={13} /> : active ? <Loader2 size={13} className="animate-spin" /> : <span className="text-[10px]">{index + 1}</span>}
                        </span>
                        {step}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {flowStage === "complete" && (
              <div className="flow-enter py-4 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/10 text-green-700">
                  <CheckCircle2 size={31} />
                </span>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-green-700">You&apos;re all set</p>
                <h2 className="mt-2 text-2xl font-semibold">Your resume is ready</h2>
                <div className="mx-auto mt-5 flex max-w-md items-center gap-3 rounded-[var(--radius-control)] border-2 border-border bg-background p-3 text-left">
                  <FileText size={18} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{uploadedResume?.filename || resumeFile?.name}</span>
                  <CheckCircle2 size={17} className="shrink-0 text-green-700" />
                </div>
                <Link
                  href="/dashboard"
                  className="mx-auto mt-5 flex max-w-md items-center justify-center gap-2 rounded-[var(--radius-control)] border-2 border-primary bg-primary py-3 text-sm font-bold text-black transition hover:bg-primary-hover"
                >
                  Start your interview <ArrowRight size={17} />
                </Link>
              </div>
            )}

            {flowStage === "authenticate" && (
              <ProgressBar
                progress={uploadProgress}
                label="Resume processing paused"
                paused
                compact
              />
            )}

            {resumeError && (
              <p role="alert" className="mt-4 text-center text-sm text-red-700">
                {resumeError}
              </p>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}

function ProgressBar({ progress, label, paused = false, compact = false }) {
  return (
    <div className={`${compact ? "mt-6" : "mt-7"} text-left`}>
      {!compact && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs text-muted">{label}</span>
          <span className="text-xs font-medium tabular-nums text-primary">{progress}%</span>
        </div>
      )}
      <div
        className={`relative overflow-hidden rounded-full bg-surface-raised ${compact ? "h-1" : "h-1.5"}`}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || "Resume preparation progress"}
      >
        <div
          className={`h-full rounded-full bg-primary transition-[width] duration-700 ease-out ${paused ? "" : "progress-shimmer"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      {compact && (
        <div className="mt-2 flex justify-between text-[11px] text-muted">
          <span>{label}</span>
          <span className="tabular-nums text-primary">{progress}%</span>
        </div>
      )}
    </div>
  );
}
