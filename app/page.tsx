"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Root route. Immediately hands off to /overview, which lives inside the
 * (app) route group — that's where onboarding checks and the AppShell/Nav
 * actually run. This page intentionally renders nothing itself.
 */
export default function RootRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/overview");
  }, [router]);

  return <div className="min-h-screen" aria-busy="true" aria-label="Loading Reso" />;
}
