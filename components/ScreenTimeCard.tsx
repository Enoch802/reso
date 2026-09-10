"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Smartphone } from "lucide-react";
import { db } from "@/lib/db";
import { GlassCard, SectionHeader, NeoButton } from "@/components/ui";
import { useToday } from "@/components/AppShell";
import {
  screenTimeAvailable,
  screenTimePermission,
  openScreenTimeSettings,
  pullYesterdayScreenTime,
} from "@/lib/screentime";
import { addDays, prettyDate } from "@/lib/dates";

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

const DAY_LETTER: { [k: number]: string } = { 0: "S", 1: "M", 2: "T", 3: "W", 4: "T", 5: "F", 6: "S" };

/**
 * Screen time card — Android-only, entirely optional.
 * Hides itself when tracking is off, on web builds, or when there's no data yet.
 */
export default function ScreenTimeCard() {
  const today = useToday();

  // The settings toggle — card stays invisible while OFF, reacts instantly to changes.
  const tracking = useLiveQuery(() => db.screentime_tracking.get(0), []);
  const enabled = tracking?.enabled ?? 0;

  const [perm, setPerm] = useState<"checking" | "granted" | "denied" | "web">("checking");
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (!screenTimeAvailable()) { if (alive) setPerm("web"); return; }
      const p = await screenTimePermission();
      if (alive) setPerm(p === "granted" ? "granted" : "denied");
    };
    check();
    // Re-check when returning to the app (e.g. from the usage-access settings screen).
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // Fire the daily pull from here too — idempotent (gated once-per-day inside).
  useEffect(() => {
    if (perm === "granted" && enabled === 1) void pullYesterdayScreenTime();
  }, [perm, enabled]);

  // Last 7 days with recorded screen time (oldest → newest).
  const history = useLiveQuery(async () => {
    const rows = await db.daily_logs.where("date").between(addDays(today, -6), today).toArray();
    return rows
      .filter((r) => typeof r.screen_time_minutes === "number")
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date: r.date,
        minutes: r.screen_time_minutes as number,
        top_app: r.screen_time_top_app ?? null,
        apps: r.screen_time_apps ?? null,
      }));
  }, [today]);

  if (!tracking || enabled !== 1) return null;            // feature off → quiet
  if (perm === "web" || perm === "checking") return null; // Android-only → quiet elsewhere

  if (perm === "denied") {
    return (
      <div className="animate-fade-up [animation-delay:250ms]">
        <GlassCard className="p-5">
          <div className="flex items-center gap-4 mb-3">
            <span className="neo-sm w-11 h-11 rounded-xl flex items-center justify-center text-[var(--accent)] shrink-0" aria-hidden>
              <Smartphone size={19} />
            </span>
            <div>
              <p className="font-semibold text-[var(--ink)]">Screen time, if you want it</p>
              <p className="text-sm text-[var(--ink-soft)]">
                Reso can log the previous day&apos;s screen time automatically — read-only, on-device, never uploaded.
              </p>
            </div>
          </div>
          <NeoButton variant="accent" onClick={() => openScreenTimeSettings()}>Open settings</NeoButton>
        </GlassCard>
      </div>
    );
  }

  const days = history ?? [];
  if (days.length === 0) return null; // nothing synced yet — appears after the first pull

  const latest = days[days.length - 1];
  const latestLabel = latest.date === addDays(today, -1) ? "Yesterday" : prettyDate(latest.date);
  const topName = latest.apps?.find((a) => a.package === latest.top_app)?.app_name ?? null;
  const apps = latest.apps ?? [];
  const maxApp = Math.max(...apps.map((a) => a.minutes), 1);
  const maxDay = Math.max(...days.map((d) => d.minutes), 1);

  return (
    <div className="animate-fade-up [animation-delay:250ms]">
      <SectionHeader
        icon={<Smartphone size={20} aria-hidden />}
        title="Screen time"
        sub="Logged automatically from the day before. On-device only."
      />
      <GlassCard className="p-5">
        {/* headline: most recent day */}
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="font-serif text-3xl text-[var(--ink)]">{fmtDur(latest.minutes)}</p>
            <p className="text-xs text-[var(--ink-soft)] mt-1">
              {latestLabel}
              {topName ? ` — most on ${topName}` : ""}
            </p>
          </div>
          <p className="text-xs text-[var(--ink-faint)] text-right">
            7-day avg<br />
            <span className="text-sm text-[var(--ink-soft)] tabular-nums">
              {fmtDur(Math.round(days.reduce((s, d) => s + d.minutes, 0) / days.length))}
            </span>
          </p>
        </div>

        {/* per-app breakdown for the latest day, logos included */}
        {apps.length > 0 && (
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
        )}

        {/* 7-day trend */}
        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-faint)] mt-5 mb-2">Last 7 days</p>
        <div className="flex justify-between gap-2">
          {days.map((d) => {
            const letter = DAY_LETTER[new Date(d.date + "T00:00:00").getDay()];
            const pct = Math.max((d.minutes / maxDay) * 100, 4);
            return (
              <div key={d.date} className="flex flex-col items-center gap-2 flex-1" title={`${d.date}: ${fmtDur(d.minutes)}`}>
                <span className={`text-[10px] uppercase tracking-wide ${d.date === today ? "text-[var(--accent)] font-semibold" : "text-[var(--ink-faint)]"}`}>{letter}</span>
                <div
                  className="w-full rounded-full"
                  style={{
                    height: 44,
                    background: `linear-gradient(to top, var(--accent) ${pct}%, rgba(120,116,150,0.12) ${pct}%)`,
                    opacity: 0.4 + 0.6 * (d.minutes / maxDay),
                  }}
                  role="img"
                  aria-label={`${d.date}: ${fmtDur(d.minutes)} of screen time`}
                />
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
