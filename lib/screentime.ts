"use client";
import { db, getMeta, setMeta } from "./db";
import { todayStr, addDays } from "./dates";

/**
 * Screen time syncing — local-first, Android-only, entirely optional.
 *
 * Reads daily app usage from Android's UsageStatsManager through a small
 * Capacitor plugin bridge ("ScreenTime"). When the app runs as a plain
 * web/PWA build there is no native bridge: every function below degrades
 * quietly and the rest of the app works exactly as before.
 * Nothing is ever sent to a server.
 */

/** One app's usage for a day, as delivered by the native plugin. */
export interface AppUsageInfo {
  package: string;
  app_name: string;
  minutes: number;
  icon: string | null; // base64 PNG, or null if it couldn't be encoded
}

/** Shape the UI consumes — decoupled from the Dexie row type. */
export interface ScreenTimeDayRow {
  date: string;
  minutes: number;
  top_app: string | null;
  apps: AppUsageInfo[] | null;
}

interface ScreenTimePlugin {
  /** Whether Android's PACKAGE_USAGE_STATS permission has been granted. */
  checkPermission(): Promise<{ granted: boolean }>;
  /** Deep-link the user to the system usage-access settings screen. */
  openPermissionSettings(): Promise<void>;
  /** Foreground time for the given yyyy-mm-dd. `apps` is the per-app breakdown (heaviest first). */
  getScreenTimeMinutes(options: { date: string; limit?: number }): Promise<{
    minutes: number | null;
    top_app: string | null;
    apps?: AppUsageInfo[];
  }>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
}

function capacitor(): CapacitorGlobal | undefined {
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True only inside a Capacitor native Android build with the ScreenTime plugin present. */
export function screenTimeAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const cap = capacitor();
  if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== "android") return false;
  return !!cap.Plugins?.["ScreenTime"];
}

function plugin(): ScreenTimePlugin | null {
  if (!screenTimeAvailable()) return null;
  return (capacitor()!.Plugins as Record<string, ScreenTimePlugin>)["ScreenTime"];
}

/** Current permission state — "native" builds only; "web" otherwise. */
export async function screenTimePermission(): Promise<"granted" | "denied" | "web"> {
  const p = plugin();
  if (!p) return "web";
  try {
    const { granted } = await p.checkPermission();
    return granted ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

/** Open Android's usage-access settings so the user can grant the permission (one-time). */
export async function openScreenTimeSettings(): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.openPermissionSettings();
  } catch { /* graceful — the settings UI explains what happened */ }
}

// How many apps to store per day (with icons). Icons are base64 PNGs, so cap
// this to keep daily_logs rows small. Total minutes still cover ALL apps.
const APPS_STORED_PER_DAY = 10;

/**
 * Pull yesterday's screen time into daily_logs. Called automatically on app
 * open (once per day) — no manual entry. Returns the minutes stored, or null
 * when unavailable on this device.
 */
export async function pullYesterdayScreenTime(): Promise<number | null> {
  const p = plugin();
  if (!p) return null;
  try {
    const yesterday = addDays(todayStr(), -1);
    // Only pull once per day.
    const last = await getMeta("screentime_last_pull");
    const existing = (await db.daily_logs.where("date").equals(yesterday).toArray())[0];
    if (last === todayStr()) {
      return existing?.screen_time_minutes ?? null;
    }
    const { minutes, top_app, apps } = await p.getScreenTimeMinutes({
      date: yesterday,
      limit: APPS_STORED_PER_DAY,
    });
    if (minutes == null) return null;
    if (existing) {
      await db.daily_logs.update(existing.id!, {
        screen_time_minutes: minutes,
        screen_time_top_app: top_app ?? null,
        screen_time_apps: apps ?? null,
      });
    } else {
      await db.daily_logs.add({
        date: yesterday,
        evening_reflection_text: "",
        mood_state: "",
        parsed_study_hours: null,
        parsed_summary: "",
        screen_time_minutes: minutes,
        screen_time_top_app: top_app ?? null,
        screen_time_apps: apps ?? null,
      });
    }
    await setMeta("screentime_last_pull", todayStr());
    return minutes;
  } catch {
    return null; // plugin missing, permission revoked mid-flight, or device quirk
  }
}

/** The stored screen-time record for one date, or null. */
export async function getScreenTimeForDate(date: string): Promise<ScreenTimeDayRow | null> {
  const row = (await db.daily_logs.where("date").equals(date).toArray())[0];
  if (!row || typeof row.screen_time_minutes !== "number") return null;
  return {
    date: row.date,
    minutes: row.screen_time_minutes,
    top_app: row.screen_time_top_app ?? null,
    apps: (row as { screen_time_apps?: AppUsageInfo[] | null }).screen_time_apps ?? null,
  };
}

/** Last `daysBack` days (oldest first) that have recorded screen time. */
export async function getScreenTimeHistory(daysBack = 7): Promise<ScreenTimeDayRow[]> {
  const to = todayStr();
  const from = addDays(to, -(daysBack - 1));
  const rows = await db.daily_logs.where("date").between(from, to).toArray();
  return rows
    .filter((r) => typeof r.screen_time_minutes === "number")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: r.date,
      minutes: r.screen_time_minutes as number,
      top_app: r.screen_time_top_app ?? null,
      apps: (r as { screen_time_apps?: AppUsageInfo[] | null }).screen_time_apps ?? null,
    }));
}

/**
 * Live read of TODAY's usage so far — not cached, not stored, called fresh
 * whenever the screen time page is open. (The daily pull above is a
 * separate, once-a-day thing that records *yesterday's* completed total.)
 */
export async function getTodayScreenTimeLive(): Promise<{
  minutes: number | null;
  top_app: string | null;
  apps: AppUsageInfo[];
} | null> {
  const p = plugin();
  if (!p) return null;
  try {
    const { minutes, top_app, apps } = await p.getScreenTimeMinutes({
      date: todayStr(),
      limit: APPS_STORED_PER_DAY,
    });
    return { minutes, top_app: top_app ?? null, apps: apps ?? [] };
  } catch {
    return null;
  }
}

/** Coarse category for a package, by keyword match on its id. Best-effort — falls back to "Other". */
export type AppCategory = "Social" | "Entertainment" | "Productivity" | "Games" | "Other";

const CATEGORY_KEYWORDS: Array<[AppCategory, string[]]> = [
  ["Social", ["instagram", "facebook", "twitter", "x.android", "snapchat", "tiktok", "whatsapp", "telegram", "reddit", "discord", "linkedin", "pinterest", "messenger"]],
  ["Entertainment", ["youtube", "netflix", "spotify", "music", "video", "player", "prime", "hbo", "disney", "twitch", "hulu"]],
  ["Productivity", ["docs", "sheet", "office", "slack", "notion", "drive", "chrome", "browser", "outlook", "gmail", "mail", "calendar", "zoom", "meet", "teams"]],
  ["Games", ["game", "konami", "pesam", "pubg", "cod", "clash", "roblox", "minecraft", "fifa", "efootball"]],
];

export function categorize(pkg: string): AppCategory {
  const p = pkg.toLowerCase();
  for (const [cat, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => p.includes(k))) return cat;
  }
  return "Other";
}
