"use client";
import { db, getMeta, setMeta } from "./db";
import { todayStr, addDays } from "./dates";

/**
 * Screen time syncing — local-first, Android-only, entirely optional.
 *
 * Reads daily app usage from Android's UsageStatsManager through a small
 * Capacitor plugin bridge ("ScreenTime" — see capacitor/README.md for the
 * Kotlin implementation). When the app runs as a plain web/PWA build there
 * is no native bridge: every function below degrades quietly and the rest
 * of the app works exactly as before. Nothing is ever sent to a server.
 */

interface ScreenTimePlugin {
  /** Whether Android's PACKAGE_USAGE_STATS permission has been granted. */
  checkPermission(): Promise<{ granted: boolean }>;
  /** Deep-link the user to the system usage-access settings screen. */
  openPermissionSettings(): Promise<void>;
  /** Total foreground screen time (minutes) for the given yyyy-mm-dd, or null. */
  getScreenTimeMinutes(options: { date: string }): Promise<{ minutes: number | null; top_app: string | null }>;
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

/**
 * Pull yesterday's total screen time into daily_logs. Called automatically on
 * app open (once per day) — no manual entry. Returns the minutes stored, or
 * null when unavailable on this device.
 */
export async function pullYesterdayScreenTime(): Promise<number | null> {
  const p = plugin();
  if (!p) return null;
  try {
    const yesterday = addDays(todayStr(), -1);
    // Only pull once per day.
    const last = await getMeta("screentime_last_pull");
    if (last === todayStr()) {
      const existing = (await db.daily_logs.where("date").equals(yesterday).toArray())[0];
      return existing?.screen_time_minutes ?? null;
    }
    const { minutes, top_app } = await p.getScreenTimeMinutes({ date: yesterday });
    if (minutes == null) return null;
    const existing = (await db.daily_logs.where("date").equals(yesterday).toArray())[0];
    if (existing) {
      await db.daily_logs.update(existing.id!, { screen_time_minutes: minutes, screen_time_top_app: top_app ?? null });
    } else {
      await db.daily_logs.add({
        date: yesterday,
        evening_reflection_text: "",
        mood_state: "",
        parsed_study_hours: null,
        parsed_summary: "",
        screen_time_minutes: minutes,
        screen_time_top_app: top_app ?? null,
      });
    }
    await setMeta("screentime_last_pull", todayStr());
    return minutes;
  } catch {
    return null; // plugin missing, permission revoked mid-flight, or device quirk
  }
}
