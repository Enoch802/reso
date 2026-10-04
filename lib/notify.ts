"use client";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

/**
 * Notifications that work everywhere: native LocalNotifications inside the
 * Android app (WebViews don't support the web Notification API), the web
 * Notification API in browsers/PWA.
 */

export type NotifState = "granted" | "denied" | "default" | "unsupported";

export async function notificationPermissionState(): Promise<NotifState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await LocalNotifications.checkPermissions();
      return res.display === "granted" ? "granted" : res.display === "denied" ? "denied" : "default";
    } catch {
      return "unsupported";
    }
  }
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as NotifState;
}

/** Ask once — shows the system dialog on Android 13+, resolves in browsers. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await LocalNotifications.requestPermissions();
      return res.display === "granted";
    } catch {
      return false;
    }
  }
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  const res = await Notification.requestPermission();
  return res === "granted";
}

/** Show a notification now (used by the in-app reminder engine). */
export async function notify(title: string, body: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 100000) + 1,
            title,
            body,
            schedule: { at: new Date(Date.now() + 250) },
          },
        ],
      });
    } catch { /* quiet — reminders are best-effort */ }
    return;
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try { new Notification(title, { body }); } catch { /* noop */ }
  }
}
