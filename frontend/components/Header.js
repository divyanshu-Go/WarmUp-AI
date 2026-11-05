// frontend/components/Header.js
"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Header() {
  const { user, isLoading, logout } = useAuth();

  const router = useRouter();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const profileMenuRef = useRef(null);

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    function handlePointerDown(event) {
      if (!profileMenuRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  async function handleLogout() {
    setError("");

    try {
      await logout();
      setIsMenuOpen(false);
      router.replace("/");
    } catch (err) {
      setError(err.message || "Unable to logout.");
    }
  }

  const profilePicture = user?.picture_url;
  const profileInitial = (user?.name || user?.email || "U")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-50 bg-background/90 px-[var(--page-gutter)] pb-2 pt-3 backdrop-blur">
      <div className="mx-auto flex h-[var(--header-height)] max-w-5xl items-center justify-between rounded-[var(--radius-large)] border-2 border-foreground bg-surface px-4 shadow-[3px_3px_0_var(--primary)] sm:px-5">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 rounded-[var(--radius-control)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          <Image
            src="/warmup-logo.png"
            alt=""
            width={40}
            height={40}
            priority
            className="h-9 w-9 rounded-lg object-contain"
          />

          <span className="text-lg font-bold tracking-tight">
            WarmUp
          </span>
        </Link>

        {/* Navigation */}
        <nav className="relative flex items-center gap-4">

          {isLoading ? (
            <div className="h-9 w-9 animate-pulse rounded-full bg-surface-raised" />
          ) : user ? (
            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen((previous) => !previous);
                  setError("");
                }}
                aria-label={isMenuOpen ? "Close profile menu" : "Open profile menu"}
                aria-expanded={isMenuOpen}
                aria-controls="profile-menu"
                className="flex items-center gap-2 rounded-[var(--radius-control)] border-2 border-border bg-background px-2 py-1 transition hover:border-primary"
              >
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border-2 border-border bg-surface-raised text-sm font-bold text-primary">
                  {profilePicture ? (
                    <img
                      src={profilePicture}
                      alt="Profile"
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    profileInitial
                  )}
                </span>

                <ChevronDown
                  size={16}
                  className="text-muted"
                />
              </button>

              {isMenuOpen && (
                <div id="profile-menu" className="absolute right-0 top-14 z-50 w-64 rounded-[var(--radius-card)] border-2 border-foreground bg-surface p-3 shadow-[3px_3px_0_var(--primary)]">

                  <div className="border-b border-border px-2 pb-3">
                    <p className="text-sm font-medium">
                      {user.name || "Your Account"}
                    </p>

                    <p className="mt-1 truncate text-xs text-muted">
                      {user.email}
                    </p>
                  </div>

                  <Link
                    href="/dashboard"
                    onClick={() => setIsMenuOpen(false)}
                    className="mt-2 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted transition hover:bg-surface-raised hover:text-foreground"
                  >
                    <LayoutDashboard size={16} />
                    Dashboard
                  </Link>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-700 transition hover:bg-red-500/10"
                  >
                    <LogOut size={16} />
                    Logout
                  </button>

                  {error && (
                    <p className="mt-2 px-2 text-xs text-red-700">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/#auth"
              className="rounded-[var(--radius-control)] border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-primary-hover"
            >
              Sign in
            </Link>
          )}

        </nav>
      </div>
    </header>
  );
}