// frontend/context/AuthContext.js
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const AuthContext = createContext(null);

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // 1. Restore the session when the application loads or refreshes.
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        // No active session.
        if (response.status === 401) {
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to verify authentication.");
        }

        const data = await response.json();

        if (isMounted) {
          setUser(data);
        }
      } catch (error) {
        console.error("Session restoration failed:", error);

        if (isMounted) {
          setAuthError(error.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Update shared state after successful login.
  function login(userData) {
    setUser(userData);
    setAuthError(null);
  }

  // 3. Logout through the backend and update shared state.
  async function logout() {
    const response = await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Unable to logout. Please try again.");
    }

    setUser(null);
    setAuthError(null);
  }

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      authError,
      login,
      logout,
    }),
    [user, isLoading, authError]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to access authentication anywhere.
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
