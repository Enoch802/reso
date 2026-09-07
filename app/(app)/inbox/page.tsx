"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Mail, RefreshCw, Inbox as InboxIcon, ChevronDown, ChevronRight, ArrowRight, Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { GlassCard, SectionHeader, NeoButton, EmptyState, Tag } from "@/components/ui";
import { useToday } from "@/components/AppShell";
import { fetchRankedEmails } from "@/lib/ai";

export default function InboxPage() {
  const today = useToday();
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openLow, setOpenLow] = useState(false);
  const [openMed, setOpenMed] = useState(false);

  const accounts = useLiveQuery(() => db.email_accounts.toArray(), []);
  const items = useLiveQuery(
    () => db.email_items.where("fetched_date").equals(today).toArray(),
    [today]
  );

  const grouped = useMemo(() => {
    const all = items ?? [];
    return {
      important: all.filter((e) => e.rank === "important"),
      medium: all.filter((e) => e.rank === "medium"),
      low: all.filter((e) => e.rank === "low"),
    };
  }, [items]);

  const refresh = async () => {
    setRefreshing(true); setNotice(null);
    try {
      if (!accounts?.length) { setNotice("Connect a Gmail account first — Settings, then Email."); return; }
      let added = 0;
      for (const acc of accounts) {
        try {
          const { items: ranked, accessToken, expiresAt } = await fetchRankedEmails(acc);
          if (accessToken && expiresAt) await db.email_accounts.update(acc.id!, { access_token: accessToken, token_expires_at: expiresAt });
          for (const it of ranked) {
            await db.email_items.add({
              email_account_id: acc.id!, subject: it.subject, sender: it.sender,
              snippet: it.snippet, summary: it.summary, rank: it.rank, fetched_date: today,
            });
            added++;
          }
          await db.email_accounts.update(acc.id!, { last_fetched_at: Date.now() });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (msg === "reconnect-needed") setNotice(`${acc.email} needs reconnecting because Google access was revoked or the connection failed.`);
        }
      }
      if (added === 0 && !notice) setNotice("Nothing new since the last look.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6 pb-8 max-w-2xl mx-auto">
      <div className="flex items-end justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-[var(--ink)]">Inbox</h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1">
            Today's mail, boiled down. What needs you, what can wait.
          </p>
        </div>
        <NeoButton variant="accent" onClick={refresh} disabled={refreshing} className="font-semibold shrink-0">
          <span className="inline-flex items-center gap-2">
            {refreshing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <RefreshCw size={16} aria-hidden />}
            Refresh
          </span>
        </NeoButton>
      </div>

      {notice && <p className="text-sm text-[var(--ink-soft)] neo-pressed rounded-xl px-4 py-3 animate-fade-in">{notice}</p>}

      {/* Not connected: low-pressure, never an error */}
      {accounts && accounts.length === 0 && (
        <GlassCard>
          <EmptyState
            icon={<Mail size={26} aria-hidden />}
            title="No account connected"
            sub="Connect a Gmail account in Settings and Reso will quietly rank each day's mail — important first, one line each. Read-only, kept on your device, and entirely optional."
            action={<Link href="/settings" className="focus-ring inline-flex items-center gap-2 text-sm text-[var(--accent)] font-medium hover:gap-3 transition-all">Go to Settings <ArrowRight size={15} aria-hidden /></Link>}
          />
        </GlassCard>
      )}

      {items && items.length === 0 && accounts && accounts.length > 0 && !refreshing && (
        <GlassCard>
          <EmptyState
            icon={<InboxIcon size={26} aria-hidden />}
            title="Nothing new today"
            sub="When mail arrives, it lands here ranked — important things first, one honest line about each."
          />
        </GlassCard>
      )}

      {/* Important first, with summaries */}
      {grouped.important.length > 0 && (
        <div className="animate-fade-up">
          <SectionHeader title="Needs your attention" />
          <div className="space-y-3">
            {grouped.important.map((e) => (
              <GlassCard key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--ink)] text-[15px]">{e.subject}</p>
                    <p className="text-xs text-[var(--ink-faint)] mt-0.5">{e.sender}</p>
                    <p className="text-sm text-[var(--ink-soft)] mt-2">{e.summary || e.snippet}</p>
                  </div>
                  <Tag tone="warn">important</Tag>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Medium / low collapsed by default */}
      {grouped.medium.length > 0 && (
        <div className="animate-fade-up">
          <button onClick={() => setOpenMed((v) => !v)} aria-expanded={openMed} className="focus-ring w-full flex items-center gap-2 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors mb-2">
            {openMed ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
            Worth a look ({grouped.medium.length})
          </button>
          {openMed && (
            <div className="space-y-2 animate-fade-in">
              {grouped.medium.map((e) => (
                <div key={e.id} className="rounded-2xl neo p-3.5">
                  <p className="text-sm font-medium text-[var(--ink)]">{e.subject}</p>
                  <p className="text-xs text-[var(--ink-faint)] mt-0.5">{e.sender}</p>
                  {e.summary && <p className="text-sm text-[var(--ink-soft)] mt-1.5">{e.summary}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {grouped.low.length > 0 && (
        <div className="animate-fade-up">
          <button onClick={() => setOpenLow((v) => !v)} aria-expanded={openLow} className="focus-ring w-full flex items-center gap-2 text-sm text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors mb-2">
            {openLow ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
            Everything else ({grouped.low.length})
          </button>
          {openLow && (
            <div className="space-y-2 animate-fade-in">
              {grouped.low.map((e) => (
                <div key={e.id} className="rounded-2xl neo p-3.5 opacity-75">
                  <p className="text-sm text-[var(--ink-soft)]">{e.subject}</p>
                  <p className="text-xs text-[var(--ink-faint)] mt-0.5">{e.sender}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-[var(--ink-faint)]">
        Mail is fetched only when you ask, ranked by AI, and saved on this device. Nothing about your inbox leaves your phone except the ranking request itself.
      </p>
    </div>
  );
}
