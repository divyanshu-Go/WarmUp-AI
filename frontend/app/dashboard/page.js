
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
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
          Upload a resume to prepare for your next interview.
        </p>
      </section>
    </main>
  );
}
