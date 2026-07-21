"use client";

import { Suspense, createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthModal, type AuthMode } from "./AuthModal";

interface AuthModalContextValue {
  openAuthModal: (mode: AuthMode) => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error("useAuthModal must be used within an AuthModalProvider");
  return ctx;
}

// Reads ?auth=login|register — the landing point for every server-side
// redirect that used to go to a dedicated /login page (session expired,
// hit a protected route while logged out, logged out, etc.) — and opens
// the shared modal once, then strips the param so a refresh or back-nav
// doesn't reopen it. Isolated in its own component + Suspense boundary
// because useSearchParams() requires one.
function AuthQueryParamHandler() {
  const { openAuthModal } = useAuthModal();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const authParam = searchParams.get("auth");
    if (authParam !== "login" && authParam !== "register") return;

    openAuthModal(authParam);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("auth");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // Intentionally run only once on mount — this is a one-time "did we
    // arrive with ?auth=..." check, not a live subscription to the params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// One shared modal instance for the whole landing page — every CTA button
// (header, hero, banner) and the query-param auto-open all drive the same
// instance via this context, instead of each owning an independent modal.
export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");

  const openAuthModal = useCallback((nextMode: AuthMode) => {
    setMode(nextMode);
    setOpen(true);
  }, []);

  return (
    <AuthModalContext.Provider value={{ openAuthModal }}>
      {children}
      <AuthModal open={open} onOpenChange={setOpen} initialMode={mode} />
      <Suspense fallback={null}>
        <AuthQueryParamHandler />
      </Suspense>
    </AuthModalContext.Provider>
  );
}
