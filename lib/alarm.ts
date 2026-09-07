"use client";

/**
 * Alarm engine — rings like a real alarm app: synthesized two-tone ring
 * (no audio asset needed), repeating vibration, and a banner with Snooze /
 * Stop. Works while the app is open (foreground or background tab / installed
 * PWA). Ringing with the app fully closed needs the native Android build —
 * see capacitor/README.md.
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
  stopAlarmSound();
  primeAudio();
  try { ctx = ctx ?? new AudioContext(); if (ctx.state === "suspended") void ctx.resume(); } catch { /* noop */ }
  ringCycle();
  patternTimer = setInterval(ringCycle, 1650);
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    const buzz = () => { try { navigator.vibrate([420, 220, 420, 220]); } catch { /* noop */ } };
    buzz();
    vibrateTimer = setInterval(buzz, 1650);
  }
  emit({ alarmId, label });
}

export function stopAlarmSound() {
  if (patternTimer) { clearInterval(patternTimer); patternTimer = null; }
  if (vibrateTimer) { clearInterval(vibrateTimer); vibrateTimer = null; }
}

/** Stop everything and clear the banner. */
export function stopAlarm() {
  stopAlarmSound();
  emit(null);
}

/* ---------------- Native scheduling (Android app build) ---------------- */

export interface NativeAlarm {
  id: number;
  label: string;
  time: string;
  enabled: number;
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
    const plugins = (window as unknown as { Capacitor: { Plugins: Record<string, { scheduleAll: (o: { alarms: NativeAlarm[] }) => Promise<void> }> } }).Capacitor.Plugins;
    await plugins.AlarmScheduler.scheduleAll({ alarms });
  } catch { /* native scheduling failed silently — in-app engine still applies */ }
}
