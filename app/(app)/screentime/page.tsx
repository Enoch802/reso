"use client";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Hourglass, AlertCircle, Settings } from "lucide-react";
import { db } from "@/lib/db";
import { GlassCard, SectionHeader, NeoButton, EmptyState, Modal } from "@/components/ui";
import { useToday } from "@/components/AppShell";
import { prettyDate, todayStr, addDays, DAY_SHORT } from "@/lib/dates";
import { useRouter } from "next/navigation";
import {
  screenTimePermission,
  openScreenTimeSettings,
  screenTimeAvailable,
  pullYesterdayScreenTime,
  getTodayScreenTimeLive,
  categorize,
  type AppCategory,
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

const CATEGORY_COLOR: Record<AppCategory, string> = {
  Social: "var(--ink)",
  Entertainment: "#57575f",
  Games: "#8a8a94",
  Productivity: "#b5b5bd",
  Other: "rgba(120,120,120,0.18)",
};

export default function ScreenTimePage() {
  const today = useToday();
  const router = useRouter();
  const [showPermission, setShowPermission] = useState(false);
  const [perm, setPerm] = useState<"checking" | "granted" | "denied">("checking");
  const [live, setLive] = useState<{ minutes: number | null; top_app: string | null; apps: { package: string; app_name: string; minutes: number; icon: string | null }[] } | null | undefined>(undefined);

  const screenTime = useLiveQuery(() =>
    db.daily_logs
      .where("date")
      .belowOrEqual(today)
      .reverse()
      .sortBy("date")
  );

  // The most recent completed day that actually has screen time recorded
  // (used as a fallback and for the trend chart / average baseline).
  const latest = useMemo(
    () => screenTime?.find((r) => typeof r.screen_time_minutes === "number") ?? null,
    [screenTime]
  );
  const latestLabel = useMemo(() => {
    if (!latest) return "";
    if (latest.date === addDays(todayStr(), -1)) return "Yesterday";
    if (latest.date === todayStr()) return "Today";
    return prettyDate(latest.date);
  }, [latest]);

  const enabled = useLiveQuery(() => db.screentime_tracking.get(0), []);

  // Live pull of today's running total — separate from the once-a-day
  // historical pull, so the hero number reflects "so far today".
  // Refreshes every 60s while the page is open, and instantly whenever the
  // app returns to the foreground — always up to date.
  useEffect(() => {
    let alive = true;
    const fetchLive = async () => {
      if (!screenTimeAvailable() || enabled?.enabled !== 1) { setLive(null); return; }
      const p = await screenTimePermission();
      if (p !== "granted") { setLive(null); return; }
      const result = await getTodayScreenTimeLive();
      if (alive) setLive(result);
    };
    fetchLive();
    const iv = setInterval(fetchLive, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") fetchLive(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled?.enabled, today]);

  // Completed days for the trend — legacy corrupt rows (> 1440 min, from the
  // old bucket-span bug) are excluded everywhere below.
  const completedDays = useMemo(() => {
    return (screenTime ?? [])
      .filter((r) =>
        typeof r.screen_time_minutes === "number" &&
        (r.screen_time_minutes as number) > 0 &&
        (r.screen_time_minutes as number) <= 1440
      )
      .map((r) => ({ date: r.date, minutes: r.screen_time_minutes as number }));
  }, [screenTime]);

  const chartData = useMemo(() => {
    const result = [];
    for (let day = 13; day >= 0; day--) {
      const ds = addDays(todayStr(), -day);
      const stored = completedDays.find((d) => d.date === ds);
      let minutes = stored?.minutes ?? null;
      // Today's bar shows the LIVE running total — always up to date.
      if (ds === todayStr() && live?.minutes != null) minutes = live.minutes;
      result.push({ date: ds, minutes, isToday: ds === todayStr() });
    }
    return result;
  }, [completedDays, live, today]);

  // Rolling average over completed days only (today is partial, excluded on purpose).
  const avgMinutes = useMemo(() => {
    const valid = completedDays.filter((d) => d.date !== todayStr());
    if (valid.length === 0) return null;
    const sum = valid.reduce((a, d) => a + d.minutes, 0);
    return Math.round(sum / valid.length);
  }, [completedDays]);

  const maxMinutes = useMemo(() => {
    const valid = chartData.filter((d) => d.minutes !== null);
    if (valid.length === 0) return null;
    return Math.max(...valid.map((d) => d.minutes!));
  }, [chartData]);

  // What the hero shows: today's live total if we have it, else the latest
  // completed day as an honest fallback (e.g. web preview / permission off).
  const heroMinutes = live?.minutes ?? latest?.screen_time_minutes ?? null;
  const heroLabel = live !== null && live !== undefined ? "Today" : (latestLabel || "Latest");
  const heroApps = (live?.apps?.length ? live.apps : latest?.screen_time_apps) ?? [];

  const comparisonLine = useMemo(() => {
    if (heroMinutes == null || avgMinutes == null || avgMinutes === 0) return null;
    const diff = heroMinutes - avgMinutes;
    const pct = Math.round((Math.abs(diff) / avgMinutes) * 100);
    if (Math.abs(diff) < 3) return "right around your usual";
    return diff > 0
      ? `${fmtDur(diff)} above your 14-day average${pct >= 5 ? ` (${pct}% more)` : ""}`
      : `${fmtDur(Math.abs(diff))} below your 14-day average${pct >= 5 ? ` (${pct}% less)` : ""}`;
  }, [heroMinutes, avgMinutes]);

  // Category breakdown for whichever day the hero is showing.
  const categoryBreakdown = useMemo(() => {
    const totals = new Map<AppCategory, number>();
    for (const a of heroApps) {
      const cat = categorize(a.package);
      totals.set(cat, (totals.get(cat) ?? 0) + a.minutes);
    }
    const order: AppCategory[] = ["Social", "Entertainment", "Games", "Productivity", "Other"];
    return order
      .map((cat) => ({ cat, minutes: totals.get(cat) ?? 0 }))
      .filter((c) => c.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
  }, [heroApps]);
  const categoryTotal = categoryBreakdown.reduce((a, c) => a + c.minutes, 0);

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

  // Fire the daily historical pull from here too — idempotent (once-per-day gate inside).
  useEffect(() => {
    if (perm === "granted" && enabled?.enabled === 1) void pullYesterdayScreenTime();
  }, [perm, enabled?.enabled]);

  const renderChart = () => {
    if (chartData.length === 0) return null;

    const maxValue = maxMinutes ?? 0;
    const daysToRender = chartData.filter((d) => d.minutes !== null);
    // Baseline reference line position, as a % up from the bottom of the chart.
    const baselinePct = avgMinutes != null && maxValue > 0 ? Math.min(100, (avgMinutes / maxValue) * 100) : null;

    return (
      <GlassCard className="p-5 animate-fade-up">
        <SectionHeader title="14-day trend" sub={`${daysToRender.length} days tracked — dashed line is your average`} />
        <div className="mt-6 relative h-40">
          {baselinePct != null && (
            <div
              className="absolute left-0 right-0 border-t border-dashed"
              style={{ bottom: `${baselinePct}%`, borderColor: "var(--ink-faint)" }}
              aria-hidden
            />
          )}
          <div className="relative h-full flex items-end justify-between gap-2 sm:gap-4">
            {chartData.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group h-full justify-end">
                <div className="relative w-full max-w-[48px]">
                  <div
                    className="w-full rounded-t-lg transition-all duration-300"
                    style={{
                      height: d.minutes === null ? 4 : Math.max(4, (d.minutes / maxValue) * 140),
                      background: d.isToday
                        ? "var(--accent)"
                        : "color-mix(in srgb, var(--accent) 65%, transparent)",
                    }}
                  />
                  {d.minutes !== null && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[var(--neo-base)] dark:bg-[var(--neo-base-dark)] px-2 py-1 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium whitespace-nowrap">
                      {fmtDur(d.minutes)}
                    </div>
                  )}
                </div>
                <span className={`text-[10px] sm:text-xs ${d.isToday ? "text-[var(--ink)] font-semibold" : "text-[var(--ink-faint)]"}`}>
                  {d.isToday ? "Today" : DAY_SHORT[new Date(d.date).getDay()]}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex justify-between items-center text-xs text-[var(--ink-faint)]">
          <span>{avgMinutes !== null ? `avg ${fmtDur(avgMinutes)}` : "no average yet"}</span>
          <span>{maxMinutes !== null ? `peak ${fmtDur(maxMinutes)}` : ""}</span>
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

  if (perm === "denied") {
    return (
      <div className="space-y-6 pb-8 max-w-3xl mx-auto">
        <div className="animate-fade-up">
          <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--ink)]">Screen time</h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1">{prettyDate(today)}</p>
        </div>

        <GlassCard className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <span className="neo-sm w-11 h-11 rounded-xl flex items-center justify-center text-[var(--accent)] shrink-0" aria-hidden>
              <Hourglass size={19} />
            </span>
            <div>
              <h2 className="font-medium text-[var(--ink)]">Usage access needed</h2>
              <p className="text-sm text-[var(--ink-soft)]">Grant access in Android settings — read-only, on-device, never uploaded.</p>
            </div>
          </div>
          <NeoButton variant="accent" onClick={() => openScreenTimeSettings()} className="font-semibold">
            Open settings
          </NeoButton>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 max-w-3xl mx-auto">
      <div className="animate-fade-up">
        <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--ink)]">Screen time</h1>
        <p className="text-sm text-[var(--ink-soft)] mt-1">{prettyDate(today)}</p>
      </div>

      {/* Hero: running total for the day being shown, with a plain comparison to your own baseline */}
      <GlassCard strong className="p-6 sm:p-8 animate-fade-up">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] flex items-center gap-1.5">
          <Hourglass size={12} aria-hidden /> {heroLabel}
        </p>
        <p className="font-serif text-4xl sm:text-5xl mt-2 text-[var(--ink)]">
          {heroMinutes !== null ? fmtDur(heroMinutes) : "—"}
        </p>
        <p className="text-sm text-[var(--ink-soft)] mt-1.5">
          {comparisonLine ?? (heroMinutes !== null ? "building your baseline — check back after a few days" : "no data yet")}
        </p>
      </GlassCard>

      {renderChart()}

      {/* Where the time went, grouped by category */}
      {categoryBreakdown.length > 0 && (
        <GlassCard className="p-5 animate-fade-up">
          <SectionHeader title="Where it went" sub={`${heroLabel.toLowerCase()}, grouped`} />
          <div className="mt-4 h-3 rounded-full overflow-hidden flex">
            {categoryBreakdown.map((c) => (
              <div
                key={c.cat}
                style={{ width: `${(c.minutes / categoryTotal) * 100}%`, background: CATEGORY_COLOR[c.cat] }}
                title={`${c.cat}: ${fmtDur(c.minutes)}`}
              />
            ))}
          </div>
          <ul className="mt-4 space-y-2">
            {categoryBreakdown.map((c) => (
              <li key={c.cat} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-[var(--ink)]">
                  <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLOR[c.cat] }} />
                  {c.cat}
                </span>
                <span className="tabular-nums text-[var(--ink-soft)]">{fmtDur(c.minutes)}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {/* Per-app breakdown — logos + time each, heaviest first */}
      {heroApps.length > 0 && (
        <GlassCard className="p-5 animate-fade-up">
          <SectionHeader
            title={`Apps — ${heroLabel.toLowerCase()}`}
            sub="Heaviest first"
          />
          <div className="mt-4 space-y-3">
            {heroApps.map((a) => {
              const maxApp = Math.max(...heroApps.map((x) => x.minutes), 1);
              return (
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
              );
            })}
          </div>
        </GlassCard>
      )}

      {heroApps.length === 0 && heroMinutes === null && (
        <EmptyState
          icon={<Hourglass size={48} className="text-[var(--ink-faint)]" />}
          title="No screen time data yet"
          sub="Tracking is on — this fills in as you use your phone today, and the trend builds over the next few days."
        />
      )}

      <GlassCard className="p-5 animate-fade-up border border-[var(--accent)]/30">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-medium text-[var(--ink)]">How it works</h3>
            <p className="text-sm text-[var(--ink-soft)] mt-1">
              Reso reads your screen time from Android's UsageStatsManager. It's read-only, stays on your device, and never leaves.
            </p>
          </div>
          <NeoButton onClick={() => router.push("/settings")} variant="accent" className="font-semibold shrink-0">
            <span className="inline-flex items-center gap-2"><Settings size={16} aria-hidden /> Customize</span>
          </NeoButton>
        </div>
      </GlassCard>
    </div>
  );
}
