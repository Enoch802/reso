"use client";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Hourglass, AlertCircle, Settings, Smartphone, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { GlassCard, SectionHeader, NeoButton, EmptyState, Modal } from "@/components/ui";
import { useToday } from "@/components/AppShell";
import { fmtMoney, prettyDate, todayStr, addDays, DAY_SHORT } from "@/lib/dates";
import { useRouter } from "next/navigation";
import {
  screenTimePermission,
  openScreenTimeSettings,
  screenTimeAvailable,
  pullYesterdayScreenTime,
} from "@/lib/screentime";

function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Stable color per package, for the per-app bars. */
function colorFor(pkg: string): string {
  let h = 0;
  for (const ch of pkg) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 60%)`;
}

export default function ScreenTimePage() {
  const today = useToday();
  const router = useRouter();
  const [showPermission, setShowPermission] = useState(false);
  const [perm, setPerm] = useState<"checking" | "granted" | "denied">("checking");

  const screenTime = useLiveQuery(() =>
    db.daily_logs
      .where("date")
      .belowOrEqual(today)
      .reverse()
      .sortBy("date")
  );

  // The most recent day that actually has screen time recorded.
  // (The pull stores *yesterday's* completed day, so "latest" is the honest label.)
  const latest = useMemo(
    () => screenTime?.find((r) => typeof r.screen_time_minutes === "number") ?? null,
    [screenTime]
  );
  const latestMinutes = latest?.screen_time_minutes ?? null;
  const latestLabel = useMemo(() => {
    if (!latest) return "";
    if (latest.date === addDays(todayStr(), -1)) return "Yesterday";
    if (latest.date === todayStr()) return "Today";
    return prettyDate(latest.date);
  }, [latest]);

  const recentDays = screenTime?.slice(0, 14) ?? [];
  const chartData = useMemo(() => {
    const data = recentDays.map((r) => ({
      date: r.date,
      minutes: r.screen_time_minutes ?? null,
    }));
    // Pad with nulls for days with no data
    const result = [];
    let i = 0;
    for (let day = 0; day < 14; day++) {
      const d = new Date(todayStr());
      d.setDate(d.getDate() - day);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (i < data.length && data[i]?.date === ds) {
        result.push(data[i]);
        i++;
      } else {
        result.push({ date: ds, minutes: null });
      }
    }
    return result;
  }, [recentDays, today]);

  const enabled = useLiveQuery(() => db.screentime_tracking.get(0), []);

  const avgMinutes = useMemo(() => {
    const valid = chartData.filter((d) => d.minutes !== null);
    if (valid.length === 0) return null;
    const sum = valid.reduce((a, d) => a + d.minutes!, 0);
    return Math.round(sum / valid.length);
  }, [chartData]);

  const maxMinutes = useMemo(() => {
    const valid = chartData.filter((d) => d.minutes !== null);
    if (valid.length === 0) return null;
    return Math.max(...valid.map((d) => d.minutes!));
  }, [chartData]);

  // Per-app breakdown for the latest tracked day (stored by the daily pull).
  const apps = useMemo(() => latest?.screen_time_apps ?? [], [latest]);
  const maxApp = useMemo(() => Math.max(...apps.map((a) => a.minutes), 1), [apps]);

  // Top app with a human name + logo, resolved from the stored breakdown.
  const topApp = useMemo(() => {
    if (!latest?.screen_time_top_app) return null;
    const match = apps.find((a) => a.package === latest.screen_time_top_app);
    return {
      package: latest.screen_time_top_app,
      name: match?.app_name ?? latest.screen_time_top_app,
      icon: match?.icon ?? null,
    };
  }, [latest, apps]);

  // Permission state — re-checked on return from the settings screen.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (!screenTimeAvailable()) return;
      const p = await screenTimePermission();
      if (alive) setPerm(p === "granted" ? "granted" : "denied");
    };
    check();
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // Fire the daily pull from here too — idempotent (once-per-day gate inside).
  useEffect(() => {
    if (perm === "granted" && enabled?.enabled === 1) void pullYesterdayScreenTime();
  }, [perm, enabled?.enabled]);

  const renderChart = () => {
    if (chartData.length === 0) return null;

    const maxValue = maxMinutes ?? 0;
    const daysToRender = chartData.filter((d) => d.minutes !== null);

    return (
      <GlassCard className="p-5 animate-fade-up">
        <SectionHeader title="Screen time trend" sub={`${daysToRender.length} days tracked (last 14)`} />
        <div className="mt-6 h-40 flex items-end justify-between gap-2 sm:gap-4">
          {chartData.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="relative w-full max-w-[48px]">
                <div
                  className="w-full bg-[var(--accent)]/80 dark:bg-[var(--accent)]/60 rounded-t-lg transition-all duration-300 group-hover:bg-[var(--accent)]"
                  style={{
                    height: d.minutes === null ? 4 : Math.max(4, (d.minutes / maxValue) * 140),
                  }}
                />
                {d.minutes !== null && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[var(--neo-base)] dark:bg-[var(--neo-base-dark)] px-2 py-1 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium whitespace-nowrap">
                    {fmtDur(d.minutes)}
                  </div>
                )}
              </div>
              <span className="text-[10px] sm:text-xs text-[var(--ink-faint)]">{DAY_SHORT[new Date(d.date).getDay()]}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-between items-center text-xs text-[var(--ink-faint)]">
          <span>14 days</span>
          <span className="font-medium">{avgMinutes !== null ? `${fmtDur(avgMinutes)} avg` : "No data"}</span>
          <span>Today</span>
        </div>
      </GlassCard>
    );
  };

  if (!screenTimeAvailable()) {
    return (
      <div className="space-y-6 pb-8 max-w-3xl mx-auto">
        <div className="animate-fade-up">
          <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--ink)]">Screen time</h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1">Android-only feature</p>
        </div>

        <GlassCard className="p-6 text-center">
          <AlertCircle className="mx-auto mb-4 text-amber-500" size={48} />
          <h2 className="font-serif text-xl text-[var(--ink)] mb-2">Screen time comes from Android</h2>
          <p className="text-sm text-[var(--ink-soft)] mb-6">This feature only works inside the Reso Android app — not in a browser or PWA.</p>
          <NeoButton onClick={() => setShowPermission(true)} className="font-semibold">
            <span className="inline-flex items-center gap-2"><Settings size={16} aria-hidden /> Setup in settings</span>
          </NeoButton>
        </GlassCard>

        <Modal open={showPermission} onClose={() => setShowPermission(false)} title="Setup screen time">
          <div className="text-sm text-[var(--ink-soft)] space-y-3">
            <p>Screen time comes from Android&apos;s UsageStatsManager.</p>
            <p>Everything else keeps working exactly as it does now. If you install the Android build later, this is where the one-time setup happens.</p>
            <p className="text-xs text-[var(--ink-faint)]">This data never leaves your device — it lands in the same local store as everything else.</p>
          </div>
        </Modal>
      </div>
    );
  }

  if (enabled?.enabled !== 1) {
    return (
      <div className="space-y-6 pb-8 max-w-3xl mx-auto">
        <div className="animate-fade-up">
          <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--ink)]">Screen time</h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1">Turn it on in Settings to track your daily usage</p>
        </div>

        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-[var(--ink)]">Screen time tracking is off</h2>
            <NeoButton onClick={() => router.push("/settings")} className="font-semibold">
              <span className="inline-flex items-center gap-2"><Settings size={16} aria-hidden /> Go to settings</span>
            </NeoButton>
          </div>
          <p className="text-sm text-[var(--ink-soft)]">
            When enabled, Reso will quietly read your daily screen time from Android each day and show a 14-day trend here.
          </p>
        </GlassCard>

        {chartData.filter((d) => d.minutes !== null).length === 0 && (
          <EmptyState
            icon={<Hourglass size={48} className="text-[var(--ink-faint)]" />}
            title="No screen time data yet"
            sub="Turn on tracking in Settings and the next time you open Reso, we'll pull your usage."
            action={
              <NeoButton onClick={() => router.push("/settings")} className="font-semibold">
                <span className="inline-flex items-center gap-2"><Settings size={16} aria-hidden /> Enable tracking</span>
              </NeoButton>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 max-w-3xl mx-auto">
      <div className="animate-fade-up">
        <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--ink)]">Screen time</h1>
        <p className="text-sm text-[var(--ink-soft)] mt-1">
          {latestMinutes !== null
            ? `${fmtDur(latestMinutes)} — ${latestLabel.toLowerCase()}`
            : "No data yet"}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-up">
        <GlassCard className="p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><Hourglass size={12} aria-hidden /> {latestLabel || "Latest"}</p>
          <p className="font-serif text-2xl sm:text-3xl mt-2 text-[var(--ink)]">
            {latestMinutes !== null ? fmtDur(latestMinutes) : "—"}
          </p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><Smartphone size={12} aria-hidden /> Top app</p>
          {topApp ? (
            <div className="flex items-center gap-2 mt-2">
              {topApp.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:image/png;base64,${topApp.icon}`} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-lg shrink-0 grid place-items-center bg-black/[0.05] dark:bg-white/[0.08] text-sm font-semibold text-[var(--ink-soft)]">
                  {topApp.name.charAt(0)}
                </div>
              )}
              <p className="font-serif text-lg text-[var(--ink)] truncate">{topApp.name}</p>
            </div>
          ) : (
            <p className="font-serif text-2xl sm:text-3xl mt-2 text-[var(--ink)]">—</p>
          )}
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><Hourglass size={12} aria-hidden /> Average</p>
          <p className="font-serif text-2xl sm:text-3xl mt-2 text-[var(--ink)]">
            {avgMinutes !== null ? fmtDur(avgMinutes) : "—"}
          </p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><Hourglass size={12} aria-hidden /> Max</p>
          <p className="font-serif text-2xl sm:text-3xl mt-2 text-[var(--ink)]">
            {maxMinutes !== null ? fmtDur(maxMinutes) : "—"}
          </p>
        </GlassCard>
      </div>

      {renderChart()}

      {/* Per-app breakdown for the latest tracked day — logos + time each */}
      {apps.length > 0 && (
        <GlassCard className="p-5 animate-fade-up">
          <SectionHeader
            title={`Where ${latestLabel.toLowerCase() || "the day"} went`}
            sub="Per-app usage, heaviest first"
          />
          <div className="mt-4 space-y-3">
            {apps.map((a) => (
              <div key={a.package} className="flex items-center gap-3">
                {a.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`data:image/png;base64,${a.icon}`} alt="" className="w-9 h-9 rounded-[10px] object-contain shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-[10px] shrink-0 grid place-items-center bg-black/[0.05] dark:bg-white/[0.08] text-sm font-semibold text-[var(--ink-soft)]">
                    {a.app_name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--ink)] truncate">{a.app_name}</span>
                    <span className="text-sm tabular-nums text-[var(--ink-soft)] shrink-0">{fmtDur(a.minutes)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.07] mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${(a.minutes / maxApp) * 100}%`, background: colorFor(a.package) }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--ink-faint)] mt-4">
            Top {apps.length} apps. The daily total covers everything you used.
          </p>
        </GlassCard>
      )}

      {latest === null && (
        <EmptyState
          icon={<Hourglass size={48} className="text-[var(--ink-faint)]" />}
          title="No screen time data yet"
          sub="Tracking is on — the first pull happens next time you open Reso after a full day of use."
        />
      )}

      <GlassCard className="p-5 animate-fade-up border border-[var(--accent)]/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-[var(--ink)]">How it works</h3>
            <p className="text-sm text-[var(--ink-soft)] mt-1">
              Reso reads your daily screen time from Android's UsageStatsManager. It's read-only, stays on your device, and never leaves.
            </p>
          </div>
          <NeoButton onClick={() => router.push("/settings")} variant="accent" className="font-semibold">
            <span className="inline-flex items-center gap-2"><Settings size={16} aria-hidden /> Customize</span>
          </NeoButton>
        </div>
      </GlassCard>
    </div>
  );
}
