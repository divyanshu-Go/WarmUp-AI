// frontend/components/Header.js
"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Header() {
  const { user, isLoading, logout } = useAuth();

  const router = useRouter();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [error, setError] = useState("");

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
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[var(--header-height)] max-w-7xl items-center justify-between px-[var(--page-gutter)]">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/warmup-logo.png"
            alt=""
            width={40}
            height={40}
            priority
            className="h-9 w-9 object-contain"
          />

          <span className="text-lg font-semibold tracking-tight">
            WarmUp
          </span>
        </Link>

        {/* Navigation */}
        <nav className="relative flex items-center gap-4">

          {isLoading ? (
            <div className="h-9 w-9 animate-pulse rounded-full bg-surface-raised" />
          ) : user ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen((previous) => !previous);
                  setError("");
                }}
                aria-label="Open profile menu"
                aria-expanded={isMenuOpen}
                className="flex items-center gap-2 rounded-full p-1 transition hover:bg-surface-raised"
              >
                <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-raised text-sm font-semibold text-primary">
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
                <div className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-border bg-surface p-3 shadow-2xl">

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
            </>
          ) : (
            <Link
              href="/#auth"
              className="rounded-[var(--radius-control)] border-2 border-primary bg-primary px-4 py-2 text-sm font-bold text-black transition hover:bg-primary-hover"
            >
              Sign in
            </Link>
          )}

        </nav>
      </div>
    </header>
  );
}