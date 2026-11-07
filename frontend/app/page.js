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
  UploadCloud,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function rememberResumeId(resumeId) {
  try {
    window.localStorage.setItem("warmup_resume_id", resumeId);
  } catch (error) {
    console.warn("Unable to remember the uploaded resume in this browser.", error);
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Home() {
  const { user, login, isLoading: authLoading } = useAuth();
  const fileInputRef = useRef(null);
  const uploadInProgressRef = useRef(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [uploadedResume, setUploadedResume] = useState(null);
  const [flowStage, setFlowStage] = useState("upload");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [authStep, setAuthStep] = useState("email");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingOTP, setSendingOTP] = useState(false);
  const [verifyingOTP, setVerifyingOTP] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [claimError, setClaimError] = useState("");

  useEffect(() => {
    if (flowStage !== "processing") return undefined;

    let progress = 50;
    const timer = window.setInterval(() => {
      progress = Math.min(progress + 5, 100);
      setUploadProgress(progress);

      if (progress === 100) {
        window.clearInterval(timer);
        setFlowStage("complete");
      }
    }, 700);

    return () => window.clearInterval(timer);
  }, [flowStage]);

  function selectResume(file) {
    if (authLoading || uploadInProgressRef.current) return;
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
    uploadResume(file);
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
    setUploadProgress(50);
    setUploadStage("Finishing setup");
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
      rememberResumeId(data.id);
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

  async function uploadResume(file = resumeFile) {
    if (!file || flowStage !== "upload" || uploadInProgressRef.current) return;

    uploadInProgressRef.current = true;
    setFlowStage("uploading");
    setUploadProgress(0);
    setUploadStage("Uploading resume");
    setResumeError("");
    setUploadedResume(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const data = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let extractionTimer;

        function stopExtractionTimer() {
          if (extractionTimer) {
            window.clearInterval(extractionTimer);
          }
        }

        xhr.open("POST", `${API_URL}/api/resumes/upload`);
        xhr.withCredentials = true;

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(
              Math.min(45, Math.round((event.loaded / event.total) * 45))
            );
          }
        };

        xhr.upload.onload = () => {
          setUploadStage("Reading resume and finding email");
          setUploadProgress(46);
          extractionTimer = window.setInterval(() => {
            setUploadProgress((progress) => Math.min(progress + 1, 49));
          }, 800);
        };

        xhr.onload = () => {
          stopExtractionTimer();
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

        xhr.onerror = () => {
          stopExtractionTimer();
          reject(new Error("Unable to connect to the server."));
        };
        xhr.onabort = () => {
          stopExtractionTimer();
          reject(new Error("Resume upload was cancelled."));
        };
        xhr.send(formData);
      });

      setUploadedResume(data);
      setEmail(data.candidate_email || "");
      setUploadProgress(50);
      setUploadStage(data.candidate_email ? "Email found" : "Resume read");

      if (user) {
        rememberResumeId(data.id);
        await beginProcessing();
      } else if (data.candidate_email) {
        setFlowStage("confirm");
      } else {
        setAuthStep("email");
        setUploadStage("No email found");
        setFlowStage("authenticate");
      }
    } catch (error) {
      setResumeError(error.message || "Resume upload failed.");
      setUploadStage("Upload failed");
      setFlowStage("upload");
      setUploadProgress(0);
    } finally {
      uploadInProgressRef.current = false;
    }
  }

  async function requestOTP(address) {
    const normalizedEmail = address.trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthError("Enter an email address to continue.");
      return;
    }

    setSendingOTP(true);
    setAuthError("");
    setAuthMessage("");
    setOtpSent(false);
    setOtpVerified(false);

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
      setUploadStage("Enter your code");
      setOtpSent(true);
      setAuthMessage("Code sent");
    } catch (error) {
      setAuthError(error.message || "Unable to send a verification code.");
      setAuthStep("email");
      setFlowStage("authenticate");
    } finally {
      setSendingOTP(false);
    }
  }

  function handleEmailSubmit(event) {
    event.preventDefault();
    requestOTP(email);
  }

  async function verifyOTP(event) {
    event.preventDefault();
    setVerifyingOTP(true);
    setAuthError("");
    setAuthMessage("");
    setOtpVerified(false);

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

      setOtpVerified(true);
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      await finishAuthentication(data.user);
    } catch (error) {
      setAuthError(error.message || "Verification failed.");
    } finally {
      setVerifyingOTP(false);
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
          className="flow-enter overflow-hidden rounded-[var(--radius-large)] border-2 border-foreground bg-surface shadow-[3px_3px_0_var(--primary)]"
        >
          <div className="border-b border-foreground px-4 py-4 sm:px-6">
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
                            ? "border-foreground bg-primary text-white"
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
                  disabled={authLoading}
                  className="hidden"
                />

                {!resumeFile ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!authLoading) fileInputRef.current?.click();
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    disabled={authLoading}
                    className={`flex min-h-48 w-full flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed px-5 py-7 text-center transition duration-200 disabled:cursor-wait disabled:opacity-70 ${
                      isDragging
                        ? "border-primary bg-primary/10"
                        : "border-foreground bg-background hover:border-primary hover:bg-primary/[0.04]"
                    }`}
                  >
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-control)] border-2 border-foreground bg-secondary text-primary">
                      <UploadCloud size={26} strokeWidth={1.8} />
                    </span>
                    <span className="text-sm font-medium">
                      {authLoading ? "Checking your account" : "Drop your PDF here, or browse"}
                    </span>
                    <span className="mt-2 text-xs text-muted">
                      {authLoading ? "Just a moment" : "PDF only · Upload starts immediately"}
                    </span>
                    <span className="mt-4 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-white shadow-[2px_2px_0_var(--primary)] transition hover:bg-primary-hover">
                      Browse files
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center gap-4 rounded-[var(--radius-control)] border-2 border-foreground bg-surface p-3 shadow-[2px_2px_0_var(--primary)]">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border-2 border-foreground bg-secondary text-primary">
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

              </div>
            )}

            {flowStage === "uploading" && (
              <div className="flow-enter flex items-center gap-3 py-2">
                <Loader2 size={18} className="shrink-0 animate-spin text-primary" />
                <span className="min-w-0 flex-1 text-sm font-medium">{uploadStage}</span>
                <span className="max-w-[45%] truncate text-xs text-muted">{resumeFile?.name}</span>
              </div>
            )}

            {flowStage === "confirm" && (
              <div className="flow-enter">
                <div className="flex items-center gap-3 rounded-[var(--radius-control)] border-2 border-foreground bg-background p-3 shadow-[2px_2px_0_var(--primary)]">
                  <Mail size={18} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 break-all text-sm font-medium">{uploadedResume?.candidate_email}</span>
                  <span className="shrink-0 text-xs text-muted">Use this email?</span>
                  <button
                    type="button"
                    aria-label="Yes, use this email"
                    title="Use this email"
                    onClick={() => requestOTP(uploadedResume.candidate_email)}
                    disabled={sendingOTP || loading}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] border-2 border-green-800 bg-green-100 text-green-800 transition hover:bg-green-200 disabled:opacity-50"
                  >
                    {sendingOTP ? <Loader2 size={16} className="animate-spin" /> : <Check size={19} />}
                  </button>
                  <button
                    type="button"
                    aria-label="No, use another email or Google"
                    title="Use another email or Google"
                    onClick={() => {
                      setEmail("");
                      setAuthStep("email");
                      setAuthError("");
                      setFlowStage("authenticate");
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] border-2 border-red-800 bg-red-100 text-red-800 transition hover:bg-red-200"
                  >
                    <X size={19} />
                  </button>
                </div>
              </div>
            )}

            {flowStage === "authenticate" && (
              <div className="flow-enter mx-auto max-w-xl py-1">
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
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border-2 border-foreground bg-primary py-3 text-sm font-bold text-white shadow-[2px_2px_0_var(--primary)] disabled:opacity-60"
                    >
                      {loading ? <Loader2 size={17} className="animate-spin" /> : <>Retry connection <ArrowRight size={16} /></>}
                    </button>
                  </div>
                ) : (
                  <>
                    {uploadedResume?.candidate_email && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthError("");
                          setOtpSent(false);
                          setOtpVerified(false);
                          setFlowStage("confirm");
                        }}
                        className="mb-3 flex items-center gap-1 text-xs font-normal text-muted transition hover:text-foreground"
                      >
                        <ArrowLeft size={13} /> Use resume email
                      </button>
                    )}
                    {authStep === "otp" && (
                      <form onSubmit={verifyOTP} className="mb-3 flex items-center gap-2">
                        <label htmlFor="otp" className="sr-only">6-digit verification code</label>
                        <input
                          id="otp"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          required
                          value={otp}
                          onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                          placeholder="6-digit code"
                          aria-label={`Verification code sent to ${email}`}
                          className="w-36 shrink-0 rounded-[var(--radius-control)] border-2 border-foreground bg-background px-2 py-2 text-center text-sm font-bold tracking-[0.2em] outline-none transition placeholder:tracking-normal placeholder:text-xs placeholder:font-normal placeholder:text-muted/60 focus:border-primary sm:w-40"
                        />
                        <button
                          type="submit"
                          disabled={verifyingOTP || loading || otpVerified || otp.length !== 6}
                          aria-label={otpVerified ? "Code verified" : "Verify code"}
                          className={`flex h-10 w-28 shrink-0 items-center justify-center rounded-[var(--radius-control)] border-2 border-foreground text-sm font-bold shadow-[2px_2px_0_var(--primary)] transition disabled:cursor-not-allowed disabled:opacity-100 ${
                            otpVerified
                              ? "bg-green-100 text-green-800"
                              : "bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
                          }`}
                        >
                          {otpVerified ? (
                            <Check size={19} className="success-check" />
                          ) : verifyingOTP || loading ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            "Verify"
                          )}
                        </button>
                      </form>
                    )}

                    <div className="flex w-full flex-col items-start gap-3">
                      <form onSubmit={handleEmailSubmit} className="flex w-full min-w-0 flex-col items-start gap-2 sm:flex-row">
                        <label htmlFor="email" className="sr-only">Email address</label>
                        <input
                          id="email"
                          type="email"
                          required
                          autoComplete="email"
                          value={email}
                          onChange={(event) => {
                            setEmail(event.target.value);
                            setOtpSent(false);
                            setOtpVerified(false);
                            setOtp("");
                            setAuthMessage("");
                            if (authStep === "otp") {
                              setAuthStep("email");
                            }
                          }}
                          placeholder="Email address"
                          className="w-full min-w-0 flex-1 rounded-[var(--radius-control)] border-2 border-foreground bg-background px-3 py-2 text-xs outline-none transition placeholder:text-muted/60 focus:border-primary sm:text-sm"
                        />
                        <button
                          type="submit"
                          disabled={sendingOTP || loading || !email.trim()}
                          aria-label={otpSent ? "Code sent. Resend code" : "Send verification code"}
                          title={otpSent ? "Code sent — click to resend" : "Send verification code"}
                          className={`flex h-10 w-24 shrink-0 items-center justify-center rounded-[var(--radius-control)] border-2 border-foreground text-xs font-bold shadow-[2px_2px_0_var(--primary)] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            otpSent
                              ? "bg-green-100 text-green-800"
                              : "bg-primary text-white hover:bg-primary-hover"
                          }`}
                        >
                          {sendingOTP ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : otpSent ? (
                            <Check size={19} className="success-check" />
                          ) : (
                            "Send code"
                          )}
                        </button>
                      </form>
                      <div className="flex w-[210px] max-w-full shrink-0 justify-start">
                        <GoogleLogin
                          onSuccess={handleGoogleSuccess}
                          onError={() => setAuthError("Google sign-in was unsuccessful.")}
                          theme="outline"
                          size="medium"
                          text="continue_with"
                          shape="rectangular"
                          width={210}
                        />
                      </div>
                    </div>

                    {authMessage && <p className="mt-2 text-xs text-green-700">{authMessage}</p>}
                    {authError && <p role="alert" className="mt-2 text-xs text-red-700">{authError}</p>}
                  </>
                )}
              </div>
            )}

            {flowStage === "processing" && (
              <div className="flow-enter flex items-center gap-3 py-2">
                <Loader2 size={18} className="shrink-0 animate-spin text-primary" />
                <span className="text-sm font-medium">Finishing setup</span>
              </div>
            )}

            {flowStage === "complete" && (
              <div className="flow-enter py-4 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/10 text-green-700">
                  <CheckCircle2 size={31} />
                </span>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-green-700">You&apos;re all set</p>
                <h2 className="mt-2 text-2xl font-semibold">Your resume is ready</h2>
                <div className="mx-auto mt-5 flex max-w-md items-center gap-3 rounded-[var(--radius-control)] border-2 border-foreground bg-background p-3 text-left shadow-[2px_2px_0_var(--primary)]">
                  <FileText size={18} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{uploadedResume?.filename || resumeFile?.name}</span>
                  <CheckCircle2 size={17} className="shrink-0 text-green-700" />
                </div>
                <Link
                  href="/dashboard"
                  className="mx-auto mt-5 flex max-w-md items-center justify-center gap-2 rounded-[var(--radius-control)] border-2 border-foreground bg-primary py-3 text-sm font-bold text-white shadow-[2px_2px_0_var(--primary)] transition hover:bg-primary-hover"
                >
                  Continue to dashboard <ArrowRight size={17} />
                </Link>
              </div>
            )}

            {["uploading", "confirm", "authenticate", "processing"].includes(flowStage) && (
              <ProgressBar
                progress={uploadProgress}
                label={uploadStage}
                paused={flowStage === "confirm" || flowStage === "authenticate"}
              />
            )}

            {resumeError && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p role="alert" className="text-sm text-red-700">{resumeError}</p>
                {flowStage === "upload" && resumeFile && (
                  <button
                    type="button"
                    onClick={() => uploadResume(resumeFile)}
                    disabled={uploadInProgressRef.current}
                    className="rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-3 py-2 text-xs font-bold text-white shadow-[2px_2px_0_var(--primary)] transition hover:bg-primary-hover disabled:opacity-50"
                  >
                    Retry upload
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}

function ProgressBar({ progress, label, paused = false }) {
  return (
    <div className="mt-5 text-left">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm font-medium tabular-nums text-primary">{progress}%</span>
      </div>
      <div
        className="relative h-5 overflow-hidden rounded-full border-2 border-foreground bg-surface-raised"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || "Resume preparation progress"}
      >
        <div
          className={`h-full rounded-full bg-primary transition-[width] duration-1000 ease-out ${paused ? "" : "progress-shimmer"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
