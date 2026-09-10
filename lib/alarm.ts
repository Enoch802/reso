"use client";

/**
 * Alarm engine — two layers, one UI.
 *
 * Web/PWA: synthesized two-tone ring (no audio asset needed) + repeating
 * vibration + a banner with Snooze/Stop. Reliable while the app is open.
 *
 * Native Android: the AlarmScheduler plugin schedules exact AlarmManager
 * alarms that ring through a native foreground service with the app fully
 * closed. When native is available the web layer only shows the banner —
 * the sound comes from the native service, so nothing double-rings.
 */

let ctx: AudioContext | null = null;
let patternTimer: ReturnType<typeof setInterval> | null = null;
let vibrateTimer: ReturnType<typeof setInterval> | null = null;
let primed = false;

export interface RingState {
  alarmId: number;
  label: string;
}

type Listener = (state: RingState | null) => void;
const listeners = new Set<Listener>();

export function onAlarmChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(state: RingState | null) {
  for (const fn of listeners) fn(state);
}

/** Call once on the first user gesture so the AudioContext is allowed to play later. */
export function primeAudio() {
  if (primed || typeof window === "undefined") return;
  primed = true;
  const resume = () => {
    try {
      if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (ctx.state === "suspended") void ctx.resume();
    } catch { /* audio unsupported — vibration still works */ }
  };
  resume();
  window.addEventListener("pointerdown", resume, { once: true });
  window.addEventListener("keydown", resume, { once: true });
}

function beep(freq: number, start: number, dur: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ctx.currentTime + start);
  gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + start + 0.02);
  gain.gain.setValueAtTime(0.22, ctx.currentTime + start + dur - 0.03);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.02);
}

/** One full ring cycle: classic two-tone, ~1.6s. */
function ringCycle() {
  beep(880, 0, 0.16);
  beep(660, 0.2, 0.16);
  beep(880, 0.4, 0.16);
  beep(660, 0.6, 0.16);
}

export function startAlarm(alarmId: number, label: string) {
  // The banner always comes from the web layer.
  emit({ alarmId, label });
  // Native build: the AlarmService is already making the sound + vibration —
  // skip the synth so nothing double-rings.
  if (nativeAlarmSchedulerAvailable()) return;
  stopAlarmSound();
  primeAudio();
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* noop */ }
  ringCycle();
  patternTimer = setInterval(ringCycle, 1650);
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    const buzz = () => { try { navigator.vibrate([420, 220, 420, 220]); } catch { /* noop */ } };
    buzz();
    vibrateTimer = setInterval(buzz, 1650);
  }
}

export function stopAlarmSound() {
  if (patternTimer) { clearInterval(patternTimer); patternTimer = null; }
  if (vibrateTimer) { clearInterval(vibrateTimer); vibrateTimer = null; }
}

/** Stop everything (web sound + native service) and clear the banner. */
export function stopAlarm() {
  stopAlarmSound();
  emit(null);
  void nativeDismiss();
}

async function nativeDismiss(): Promise<void> {
  if (!nativeAlarmSchedulerAvailable()) return;
  try { await alarmPlugin()?.dismiss?.(); } catch { /* noop */ }
}

/* ---------------- Native scheduling (Android app build) ---------------- */

export interface NativeAlarm {
  id: number;
  label: string;
  time: string;       // "HH:mm"
  enabled: number;    // 0 | 1
  date?: string | null; // optional one-shot: "yyyy-mm-dd" fires once at that date+time
}

interface AlarmSchedulerPlugin {
  scheduleAll(o: { alarms: NativeAlarm[] }): Promise<void>;
  cancel(o: { id: number }): Promise<void>;
  dismiss?(): Promise<void>;
  snooze?(o: { id: number }): Promise<void>;
  checkExactAlarmPermission?(): Promise<{ granted: boolean }>;
  requestExactAlarmPermission?(): Promise<void>;
  requestNotificationPermission?(): Promise<void>;
}

function alarmPlugin(): AlarmSchedulerPlugin | null {
  if (!nativeAlarmSchedulerAvailable()) return null;
  const cap = (window as unknown as { Capacitor: { Plugins: Record<string, AlarmSchedulerPlugin> } }).Capacitor;
  return cap.Plugins?.AlarmScheduler ?? null;
}

/** True inside the Capacitor Android build with the AlarmScheduler plugin present. */
export function nativeAlarmSchedulerAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: Record<string, unknown> } }).Capacitor;
  return !!cap?.isNativePlatform?.() && cap.getPlatform?.() === "android" && !!cap.Plugins?.AlarmScheduler;
}

/**
 * Push the full alarm list to the native AlarmManager so alarms ring with the
 * app fully closed (exact alarms + boot restore). No-op on web/PWA, where the
 * in-app engine handles ringing while the app is open.
 */
export async function syncNativeAlarms(alarms: NativeAlarm[]): Promise<void> {
  if (!nativeAlarmSchedulerAvailable()) return;
  try {
    await alarmPlugin()?.scheduleAll({ alarms });
  } catch { /* native scheduling failed silently — in-app engine still applies */ }
}

/** Detect native Capacitor shell and push full alarm list to native AlarmManager. */
export async function scheduleNativeIfRunning(alarms: NativeAlarm[]): Promise<void> {
  if (typeof window === "undefined") return;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return;
  await syncNativeAlarms(alarms);
}

/* ---------------- Native-side user actions + permissions ---------------- */

/** Snooze via the native scheduler (used by the in-app banner on Android). */
export async function nativeSnoozeAlarm(alarmId: number): Promise<void> {
  if (!nativeAlarmSchedulerAvailable()) return;
  try { await alarmPlugin()?.snooze?.({ id: alarmId }); } catch { /* noop */ }
}

/** Android 12+: whether exact alarms are permitted. True elsewhere. */
export async function checkExactAlarmPermission(): Promise<boolean> {
  try {
    return (await alarmPlugin()?.checkExactAlarmPermission?.())?.granted ?? true;
  } catch { return true; }
}

/** Deep-link to the system "Alarms & reminders" exact-alarm screen. */
export async function openExactAlarmSettings(): Promise<void> {
  try { await alarmPlugin()?.requestExactAlarmPermission?.(); } catch { /* noop */ }
}

/** Android 13+ POST_NOTIFICATIONS prompt — ask once per install. */
export async function ensureAlarmNotificationPermission(): Promise<void> {
  if (!nativeAlarmSchedulerAvailable()) return;
  try {
    if (typeof localStorage !== "undefined") {
      if (localStorage.getItem("reso-alarm-notif-perm-asked") === "1") return;
      localStorage.setItem("reso-alarm-notif-perm-asked", "1");
    }
    await alarmPlugin()?.requestNotificationPermission?.();
  } catch { /* noop */ }
}

// Native side rang (app open but maybe backgrounded) → surface the banner here.
// The sound itself comes from the native AlarmService.
if (typeof window !== "undefined") {
  window.addEventListener("alarmFired", (ev) => {
    const detail = (ev as CustomEvent<{ id?: number; label?: string }>).detail;
    if (detail && typeof detail.id === "number") {
      emit({ alarmId: detail.id, label: detail.label ?? "Alarm" });
    }
  });
}
