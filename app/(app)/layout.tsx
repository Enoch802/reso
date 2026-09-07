"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import Onboarding from "@/components/Onboarding";
import AppShell from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = useLiveQuery(() => db.profile.toArray(), [], undefined);

  if (profile === undefined) {
    // First beat: quiet blank, never a flash of the wrong screen.
    return <div className="min-h-screen" aria-busy="true" aria-label="Loading Reso" />;
  }

  const p = profile[0];
  if (!p || p.onboarding_complete !== 1) {
    return <Onboarding newSemesterMode={p?.new_semester_mode === 1} />;
  }

  return <AppShell>{children}</AppShell>;
}
