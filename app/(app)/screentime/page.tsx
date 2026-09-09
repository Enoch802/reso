"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { Hourglass, AlertCircle, Settings, Smartphone, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { GlassCard, SectionHeader, NeoButton, EmptyState, Modal } from "@/components/ui";
import { useToday } from "@/components/AppShell";
import { fmtMoney, prettyDate, todayStr, DAY_SHORT } from "@/lib/dates";
import { useRouter } from "next/navigation";
import { screenTimePermission, openScreenTimeSettings, screenTimeAvailable } from "@/lib/screentime";

export default function ScreenTimePage() {
  const today = useToday();
  const router = useRouter();
  const [showPermission, setShowPermission] = useState(false);

  const screenTime = useLiveQuery(() =>
    db.daily_logs
      .where("date")
      .belowOrEqual(today)
      .reverse()
      .sortBy("date")
  );

  const todayRecord = screenTime?.find((r) => r.date === today);
  const todayMinutes = todayRecord?.screen_time_minutes ?? null;

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

  const topApp = useMemo(() => {
    return todayRecord?.screen_time_top_app ?? null;
  }, [todayRecord]);

  const renderChart = () => {
    if (chartData.length === 0) return null;

    const maxValue = maxMinutes ?? 0;
    const daysToRender = chartData.filter((d) => d.minutes !== null);

    return (
      <GlassCard className="p-5 animate-fade-up">
        <SectionHeader title="Screen time trend" sub={`${daysToRender.length} days tracked (last 14)`} />
        <div className="mt-6 h-40 flex items-end justify-between gap-2 sm:gap-4">
          {chartData.map((d, i) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="relative w-full max-w-[48px]">
                <div
                  className="w-full bg-[var(--accent)]/80 dark:bg-[var(--accent)]/60 rounded-t-lg transition-all duration-300 group-hover:bg-[var(--accent)]"
                  style={{
                    height: d.minutes === null ? 4 : Math.max(4, (d.minutes / maxValue) * 140),
                  }}
                />
                {d.minutes !== null && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[var(--neo-base)] dark:bg-[var(--neo-base-dark)] px-2 py-1 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium">
                    {Math.round(d.minutes)} min
                  </div>
                )}
              </div>
              <span className="text-[10px] sm:text-xs text-[var(--ink-faint)]">{DAY_SHORT[new Date(d.date).getDay()]}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-between items-center text-xs text-[var(--ink-faint)]">
          <span>14 days</span>
          <span className="font-medium">{avgMinutes !== null ? `${Math.round(avgMinutes)} min avg` : "No data"}</span>
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
            <p>Screen time comes from Android's UsageStatsManager.</p>
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
          {todayMinutes !== null
            ? `${Math.round(todayMinutes)} minutes today`
            : "No data for today"}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-up">
        <GlassCard className="p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><Hourglass size={12} aria-hidden /> Today</p>
          <p className="font-serif text-2xl sm:text-3xl mt-2 text-[var(--ink)]">
            {todayMinutes !== null ? `${Math.round(todayMinutes)} min` : "—"}
          </p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><Smartphone size={12} aria-hidden /> Top app</p>
          <p className="font-serif text-2xl sm:text-3xl mt-2 text-[var(--ink)] truncate">
            {topApp ?? "—"}
          </p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><Hourglass size={12} aria-hidden /> Average</p>
          <p className="font-serif text-2xl sm:text-3xl mt-2 text-[var(--ink)]">
            {avgMinutes !== null ? `${Math.round(avgMinutes)} min` : "—"}
          </p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5"><Hourglass size={12} aria-hidden /> Max</p>
          <p className="font-serif text-2xl sm:text-3xl mt-2 text-[var(--ink)]">
            {maxMinutes !== null ? `${Math.round(maxMinutes)} min` : "—"}
          </p>
        </GlassCard>
      </div>

      {renderChart()}

      {topApp && (
        <GlassCard className="p-5 animate-fade-up">
          <div className="flex items-center gap-2">
            <Smartphone className="text-[var(--accent)]" size={16} aria-hidden />
            <div>
              <p className="text-xs text-[var(--ink-faint)] uppercase tracking-[0.14em]">Your most-used app today</p>
              <p className="font-medium text-[var(--ink)]">{topApp}</p>
            </div>
          </div>
        </GlassCard>
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

import { useMemo, useState } from "react";
