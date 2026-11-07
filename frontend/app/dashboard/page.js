
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  // Don't render protected content while checking authentication.
  if (isLoading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        Checking your session...
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[var(--content-width)] px-[var(--page-gutter)] py-[var(--ui-space-section)]">
      <h1 className="text-3xl font-bold tracking-tight">
        Your dashboard
      </h1>
      <p className="mt-2 truncate text-sm text-muted">{user.email}</p>

      <section className="mt-6 rounded-[var(--radius-card)] border-2 border-border bg-surface p-[var(--ui-space-card)]">
        <h2 className="text-lg font-bold">Ready when you are.</h2>
        <p className="mt-1 text-sm text-muted">
          Start a practice interview using your uploaded resume.
        </p>
        <Link
          href="/dashboard/interview"
          className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-[2px_2px_0_var(--primary)] transition hover:bg-primary-hover"
        >
          Open interview prototype <ArrowRight size={16} />
        </Link>
      </section>
    </main>
  );
}
