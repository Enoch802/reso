"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, Globe2, BookOpenText, NotebookPen, Wallet, Repeat2, ScrollText, Inbox, Settings, Ellipsis, X } from "lucide-react";

const LINKS = [
  { href: "/overview", label: "Overview", icon: Globe2 },
  { href: "/dashboard", label: "Today", icon: LayoutDashboard },
  { href: "/academics", label: "Academics", icon: BookOpenText },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/journal", label: "Journal", icon: NotebookPen },
  { href: "/routines", label: "Routines", icon: Repeat2 },
  { href: "/digest", label: "Digest", icon: ScrollText },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** The four essentials that stay on the phone bar; everything else lives in the sheet. */
const PRIMARY = ["/overview", "/dashboard", "/academics", "/finance"];

export default function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) => path === href || path.startsWith(href + "/");
  const primaryItems = LINKS.filter((l) => PRIMARY.includes(l.href));
  const secondaryItems = LINKS.filter((l) => !PRIMARY.includes(l.href));

  // The bar mirrors the width of the page it sits under, so edges always align:
  // wide pages (Overview, Today, Academics list) at 5xl; form-style pages at 3xl;
  // reading-style pages (Journal, Digest, Inbox) at 2xl.
  const containerClass = (() => {
    if (/^\/academics\/\d+/.test(path) || path.startsWith("/finance") || path.startsWith("/routines") || path.startsWith("/settings")) return "max-w-3xl";
    if (path.startsWith("/digest") || path.startsWith("/inbox") || path.startsWith("/journal")) return "max-w-2xl";
    return "";
  })();

  return (
    <nav aria-label="Main" className="fixed bottom-0 inset-x-0 z-40 pb-2 pt-1 bg-gradient-to-t from-[var(--page)] via-[var(--page)]/90 to-transparent">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
      {/* Expandable sheet — phones only (<640px) */}
      <div
        className={`sm:hidden mx-auto max-w-md origin-bottom transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? "opacity-100 translate-y-0 scale-100 mb-2 pointer-events-auto" : "opacity-0 translate-y-4 scale-95 mb-0 pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        <div className="glass glass-strong rounded-3xl p-3 shadow-2xl">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-faint)]">Go to</span>
            <button onClick={() => setOpen(false)} aria-label="Close menu" tabIndex={open ? 0 : -1} className="focus-ring neo-sm w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ink-soft)]">
              <X size={14} aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {LINKS.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  tabIndex={open ? 0 : -1}
                  className={`focus-ring flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-3 min-h-[62px] transition-all ${
                    active ? "neo-pressed text-[var(--ink)] font-semibold" : "neo-sm text-[var(--ink-soft)]"
                  }`}
                >
                  <Icon size={19} strokeWidth={2} aria-hidden />
                  <span className="text-[10px] font-medium leading-none">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bar: 4 + More on phones; all 9 on tablets and laptops */}
      <div className={`mx-auto w-full ${containerClass} glass rounded-2xl flex justify-between px-1.5 py-1.5 transition-[max-width] duration-300`}>
        {primaryItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`focus-ring flex-1 flex flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 sm:px-2.5 py-1.5 min-w-0 min-h-[46px] transition-all
                ${active ? "neo-sm text-[var(--ink)] font-semibold" : "text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"}`}
            >
              <Icon size={18} strokeWidth={2} aria-hidden />
              <span className="text-[9px] sm:text-[10.5px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}

        {/* Phones: the rest behind the menu button */}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className={`sm:hidden focus-ring flex-1 flex flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-1.5 min-w-0 min-h-[46px] transition-all
            ${open ? "neo-pressed text-[var(--ink)]" : "text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"}`}
        >
          {open ? <X size={18} aria-hidden /> : <Ellipsis size={18} aria-hidden />}
          <span className="text-[9px] font-medium leading-none">{open ? "Close" : "More"}</span>
        </button>

        {/* Tablets + laptops: every page, one tap away */}
        {secondaryItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`hidden sm:flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-1.5 min-w-0 min-h-[46px] transition-all
                ${active ? "neo-sm text-[var(--ink)] font-semibold" : "text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"}`}
            >
              <Icon size={18} strokeWidth={2} aria-hidden />
              <span className="text-[10.5px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
      </div>
    </nav>
  );
}
