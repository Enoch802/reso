"use client";

/**
 * Client helpers for the app's stateless AI routes. All data stays local; routes retain nothing.
 *
 * These routes exist only on the Vercel deployment (no server inside the
 * Android app), so calls go to the absolute API base. Offline, they fail
 * fast with `offline` / `ai-unavailable` — callers already catch and degrade
 * gracefully, so every AI feature is optional-by-design.
 */

const API_BASE = "https://reso-pnjj.vercel.app";

function online(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function withBase(path: string): string {
  // In the browser/PWA, relative keeps same-origin (and any dev proxy).
  // In the bundled Android app, the absolute Vercel URL is required.
  if (typeof window !== "undefined" && !("Capacitor" in window)) return path;
  return `${API_BASE}${path}`;
}

export interface ParsedReflection {
  reply: string;
  study_hours: number | null;
  mood: string | null;
  mentioned_pending: Array<{ course_hint: string; label: string }>;
  mentioned_score: Array<{ course_hint: string; label: string; percent: number }> | null;
}

export async function aiChat(userText: string, context: string): Promise<ParsedReflection> {
  if (!online()) throw new Error("offline");
  const res = await fetch(withBase("/api/ai"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "chat", text: userText, context }),
  });
  if (!res.ok) throw new Error("ai-unavailable");
  return res.json();
}

export interface DigestInput {
  wantLeak: Array<{ note: string; total: number }>;
  bestStreak: { name: string; streak: number } | null;
  academicNote: { code: string; reason: string } | null;
  sickDays: number;
  planCompletion: number | null;
  savings: number;
  savingsTarget: number;
  /** Average daily screen time (minutes) for the week, when the device reports it. */
  avgScreenTimeMinutes?: number | null;
  /** Average parsed study hours for the week. */
  avgStudyHours?: number | null;
}

export async function aiDigest(input: DigestInput): Promise<{ digest: string }> {
  if (!online()) throw new Error("offline");
  const res = await fetch(withBase("/api/ai"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "digest", input }),
  });
  if (!res.ok) throw new Error("ai-unavailable");
  return res.json();
}

export interface ParsedTimetableRow {
  course_code: string;
  day: string;
  start_time: string;
  end_time: string;
  venue: string;
}

/** Vision-parse a timetable-style document (class / exam / personal study). */
export async function aiParseTimetable(
  dataUrl: string,
  kind: "class" | "exam" | "study"
): Promise<ParsedTimetableRow[]> {
  if (!online()) throw new Error("offline");
  const res = await fetch(withBase("/api/timetable-parse"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl, kind }),
  });
  if (!res.ok) throw new Error("parse-failed");
  const j = await res.json();
  return j.rows;
}

export interface RankedEmail {
  subject: string;
  sender: string;
  snippet: string;
  summary: string;
  rank: "important" | "medium" | "low";
}

/** Ask the email route to fetch + rank new mail for one account (server-side Gmail API). */
export async function fetchRankedEmails(account: { access_token: string; refresh_token: string | null; token_expires_at: number; last_fetched_at: number | null }): Promise<{ items: RankedEmail[]; accessToken?: string; expiresAt?: number }> {
  if (!online()) throw new Error("offline");
  const res = await fetch(withBase("/api/email"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(account),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "email-failed");
  }
  return res.json();
}
