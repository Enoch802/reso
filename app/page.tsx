"use client";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Check, Mic } from "lucide-react";

/* Photography: Covenant University (Nigeria), Harvard University, and graduation moments */
const PH = {
  hero: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Covenant_University_Campus_View.jpg",
  study: "https://upload.wikimedia.org/wikipedia/commons/0/0e/HarvardYard.jpg",
  market: "https://upload.wikimedia.org/wikipedia/commons/5/53/Covenant_University_Senate_Building.jpg",
  walk: "https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1600&q=80",
  desk: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Harvard_Yard_at_Night_03.jpg/1920px-Harvard_Yard_at_Night_03.jpg",
  building: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Massachusetts_Hall%2C_Harvard_University.JPG/1920px-Massachusetts_Hall%2C_Harvard_University.JPG",
};

const cv = (v: Record<string, string | number>) => v as CSSProperties;

function Landing() {
  const [heroIn, setHeroIn] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setHeroIn(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const els = Array.from(document.querySelectorAll(".rv"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        }
      },
      { threshold: 0.14 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = document.documentElement;
        const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
        if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const onMove = (e: ReactMouseEvent) => {
    const el = heroRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--px", String(((e.clientX - r.left) / r.width - 0.5) * 2));
    el.style.setProperty("--py", String(((e.clientY - r.top) / r.height - 0.5) * 2));
  };

  return (
    <div className={heroIn ? "hero-in" : ""}>
      {/* Scroll progress hairline */}
      <div className="fixed inset-x-0 top-0 z-[100] h-[2px] bg-black/5">
        <div ref={barRef} className="h-full w-full origin-left" style={{ transform: "scaleX(0)", background: "var(--ink)" }} />
      </div>

      {/* Nav */}
      <header className="fixed inset-x-0 top-0 z-[90]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 sm:px-6 py-4">
          <div className="flex items-center gap-2.5">
            <LogoMark size={30} />
            <span className="font-serif text-xl font-semibold tracking-tight">Reso</span>
          </div>
          <Link href="/overview" className="glass-hair px-4 py-2 text-sm font-semibold hover:brightness-95" style={{ color: "var(--ink-soft)" }}>
            Enter Reso
          </Link>
        </div>
      </header>

      {/* ---------- HERO ---------- */}
      <section ref={heroRef} onMouseMove={onMove} className="relative flex min-h-screen items-end overflow-hidden">
        <div className="absolute inset-0">
          <img src={PH.hero} alt="Covenant University campus view" className="ph h-full w-full object-cover" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(95deg, var(--page) 0%, color-mix(in srgb, var(--page) 94%, transparent) 24%, color-mix(in srgb, var(--page) 48%, transparent) 45%, transparent 63%)",
            }}
          />
          <div className="absolute inset-0 lg:hidden" style={{ background: "color-mix(in srgb, var(--page) 80%, transparent)" }} />
          <div className="absolute inset-x-0 bottom-0 h-44" style={{ background: "linear-gradient(to top, var(--page), transparent)" }} />
        </div>

        <div className="relative z-10 mx-auto grid w-full max-w-6xl items-end gap-12 px-5 sm:px-6 pb-24 pt-36 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <div className="glass-hair inline-flex items-center gap-2 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--ink-soft)" }}>
              A personal companion · one student · one device
            </div>
            <h1 className="font-serif mt-6 text-[clamp(3rem,8.5vw,6.4rem)] font-semibold leading-[0.98] tracking-tight">
              <Masked text="Your semester," start={100} />
              <br />
              <Masked text="kept honest." start={320} />
            </h1>
            <p className="rv in mt-6 max-w-md text-[15px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              Reso turns the three numbers you actually live by — your GPA pace, your allowance, your daily discipline — into one picture that updates as
              your life moves, and reports back every week without flattery.
            </p>
            <div className="rv in mt-8 flex flex-wrap items-center gap-4">
              <Link href="/overview" className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-7 py-3.5 text-[15px] font-semibold text-[var(--accent-ink)] shadow-xl hover:brightness-110 transition">
                Open Reso <ChevronRight size={17} />
              </Link>
              <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                No account, ever. First-time setup takes a few minutes.
              </span>
            </div>
          </div>

          {/* Floating device mockup — the real overview screen, live */}
          <div className="relative hidden h-[640px] lg:col-span-6 lg:flex items-center justify-center">
            <div className="par relative" style={cv({ "--d": "22px" })}>
              <div className="drift relative" style={cv({ "--dd": "0.6s" })}>
                {/* Phone body */}
                <div
                  className="relative w-[300px] h-[632px] rounded-[3.2rem] p-[10px]"
                  style={{
                    background: "linear-gradient(160deg, #26262c 0%, #0c0c0f 60%, #1a1a1f 100%)",
                    boxShadow: "0 60px 120px -40px rgba(10,10,15,0.65), 0 24px 48px -24px rgba(10,10,15,0.5), inset 0 1px 1px rgba(255,255,255,0.18), inset 0 -1px 1px rgba(255,255,255,0.06)",
                  }}
                >
                  {/* Side buttons */}
                  <span aria-hidden className="absolute -left-[2.5px] top-[120px] w-[3px] h-9 rounded-full bg-[#3a3a42]" />
                  <span aria-hidden className="absolute -left-[2.5px] top-[170px] w-[3px] h-14 rounded-full bg-[#3a3a42]" />
                  <span aria-hidden className="absolute -right-[2.5px] top-[150px] w-[3px] h-16 rounded-full bg-[#3a3a42]" />
                  {/* Screen */}
                  <div className="relative w-full h-full rounded-[2.7rem] overflow-hidden" style={{ background: "var(--page)" }}>
                    {/* Dynamic island */}
                    <span aria-hidden className="absolute left-1/2 -translate-x-1/2 top-2.5 z-10 w-[86px] h-[24px] rounded-full bg-[#0c0c0f]" />
                    <iframe
                      src="/preview"
                      title="Reso overview preview"
                      className="absolute top-0 left-0 border-0"
                      style={{ width: 390, height: 844, transform: "scale(0.7179)", transformOrigin: "top left" }}
                      loading="lazy"
                    />
                    {/* Glass reflection */}
                    <span aria-hidden className="absolute inset-0 rounded-[2.7rem] pointer-events-none" style={{ background: "linear-gradient(125deg, rgba(255,255,255,0.16) 0%, transparent 28%, transparent 72%, rgba(255,255,255,0.05) 100%)" }} />
                  </div>
                </div>

                {/* Floating proof chips around the device */}
                <div className="par absolute -left-16 top-16" style={cv({ "--d": "34px" })}>
                  <div className="drift" style={cv({ "--dd": "1.8s" })}>
                    <span className="glass-hair px-3.5 py-2 text-[11px] font-bold" style={{ color: "var(--ink)" }}>
                      Day 34 of 160
                    </span>
                  </div>
                </div>
                <div className="par absolute -right-10 top-[300px]" style={cv({ "--d": "12px" })}>
                  <div className="drift" style={cv({ "--dd": "2.8s" })}>
                    <span className="glass-hair px-3.5 py-2 text-[11px] font-bold" style={{ color: "var(--ink-soft)" }}>
                      Discipline · 78%
                    </span>
                  </div>
                </div>
                <div className="par absolute -left-8 bottom-10" style={cv({ "--d": "18px" })}>
                  <div className="drift" style={cv({ "--dd": "3.6s" })}>
                    <span className="glass-hair px-3.5 py-2 text-[11px] font-bold" style={{ color: "var(--ink-soft)" }}>
                      Savings target · made
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
          <div className="scrollcue" />
        </div>
      </section>

      {/* ---------- PILLARS ---------- */}
      <section className="relative py-28 md:py-36">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="rv mb-4 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--ink-soft)" }}>
            What it keeps honest
          </div>
          <h2 className="rv font-serif max-w-2xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl" style={cv({ "--rvd": "80ms" })}>
            Three numbers. One picture that moves with you.
          </h2>

          <Pillar
            flip={false}
            photo={PH.study}
            alt="Harvard Yard"
            index="01"
            title="Academics, weighted the way your institution weighs you."
            body="CA and exam share the grade exactly as your courses do — general and departmental structured differently, the way they are on your actual grade sheet. The math always answers the question that matters: what does the next assessment need to be?"
            lines={[
              ["Course-type aware", "CA, Test 1, Test 2, exam — each carries its real weight."],
              ["Required-score math", "Per remaining assessment, against your GPA target."],
              ["Exam outcomes as ranges", "Bands of possibility, never a fabricated prediction."],
            ]}
            overlay={
              <div className="glass glass-spec rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-faint)" }}>
                    CSC141 · 2 units
                  </span>
                  <span className="rounded-full border border-[var(--glass-border)] px-2.5 py-0.5 text-[11px] font-semibold" style={{ color: "var(--ink-soft)" }}>exam 70%</span>
                </div>
                <div className="mt-2 font-serif text-2xl font-semibold">
                  84.2% <span className="text-sm font-normal" style={{ color: "var(--ink-faint)" }}>→ B, holding</span>
                </div>
                <div className="mt-1 text-xs" style={{ color: "var(--ink-faint)" }}>
                  Need 71.4% on the final to stay on the 4.50 pace.
                </div>
              </div>
            }
          />
          <Pillar
            flip
            photo={PH.market}
            alt="Covenant University senate building"
            index="02"
            title="Your allowance, told straight."
            body="Each cycle opens on the day your money lands, carries forward whatever survived, and classifies every day against the number you actually meant to spend. At the end, the analysis is day by day — not a mood, an arithmetic."
            lines={[
              ["Cycles with honest rollover", "Unspent balance carries forward; it is never quietly lost."],
              ["Want versus need", "Every expense named, and the biggest leak called out by category."],
              ["End-of-cycle analysis", "Which days ran over, whether the savings target was met."],
            ]}
            overlay={
              <div className="glass glass-spec rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-faint)" }}>
                    Cycle · week of the 3rd
                  </span>
                  <span className="rounded-full border border-[var(--glass-border)] px-2.5 py-0.5 text-[11px] font-semibold" style={{ color: "var(--ink-soft)" }}>savings met</span>
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  {[1400, 3100, 4300, 2200, 5100, 1800, 0].map((v, i) => (
                    <span key={i} className="h-8 flex-1 rounded-md" style={{ background: "var(--ink)", opacity: v > 4000 ? 1 : 0.28 }} />
                  ))}
                </div>
                <div className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
                  Saved 5,000 of 5,000. Two days ran over the daily target.
                </div>
              </div>
            }
          />
          <Pillar
            flip={false}
            photo={PH.walk}
            alt="University graduation celebration"
            index="03"
            title="Discipline as pattern, not as punishment."
            body="One rough day is noise; a run of rough days is signal — so Reso scores days and weeks, not moments. A day you are sick is dropped from every number entirely, not counted as a failure. Unfinished plans are carried on purpose, never guilted."
            lines={[
              ["Daily reset, deliberate carryover", "Each day starts clean; open items ask before they follow you."],
              ["Sick days fully excluded", "Out of the numerator and the denominator, everywhere."],
              ["Routines that forgive", "Skipping is logged as honesty, and the streak is still counted."],
            ]}
            overlay={
              <div className="glass glass-spec rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-faint)" }}>
                    Last 14 days
                  </span>
                  <span className="rounded-full border border-[var(--glass-border)] px-2.5 py-0.5 text-[11px] font-semibold" style={{ color: "var(--ink-soft)" }}>week 72%</span>
                </div>
                <div className="mt-3 flex items-end gap-1">
                  {[62, 80, 45, 88, 100, 70, 0, 78, 92, 60, 84, 74, 0, 90].map((v, i) => (
                    <span
                      key={i}
                      className="w-full rounded-t"
                      style={{
                        height: `${Math.max(8, v * 0.6)}px`,
                        background: v === 0 ? "var(--ink-faint)" : "var(--ink)",
                        opacity: v === 0 ? 0.35 : 0.9,
                      }}
                    />
                  ))}
                </div>
                <div className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
                  Two sick days, fully excluded. The dips are visible, and so is the shape.
                </div>
              </div>
            }
          />
        </div>
      </section>

      {/* ---------- INTELLIGENCE (night chapter) ---------- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={PH.desk} alt="Harvard Yard at night" className="h-full w-full object-cover" style={{ filter: "saturate(1.08) contrast(1.05) brightness(0.52)" }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,8,12,0.6) 0%, rgba(8,8,12,0.85) 55%, rgba(8,8,12,0.65) 100%)" }} />
        </div>
        <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-6 py-32 md:py-40">
          <div className="rv text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">The intelligence layer</div>
          <h2 className="rv font-serif mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-white md:text-5xl" style={cv({ "--rvd": "80ms" })}>
            It remembers what you said.
          </h2>
          <p className="rv mt-5 max-w-xl text-[15px] leading-relaxed text-white/60" style={cv({ "--rvd": "160ms" })}>
            A journal that reads your words — typed or spoken — holds things open until they resolve, and reports the week back without flattery.
          </p>

          <div className="mt-14 grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="rv glass-dark glass-spec rounded-3xl p-6 md:p-7">
                <TypedJournal />
              </div>
            </div>
            <div className="lg:col-span-5">
              {[
                ["Speaks and listens", "Voice input in the journal. What you say is what gets typed — no different downstream."],
                ["Holds things open", "A test mentioned on a Monday and its score on Thursday resolve into one record, not two."],
                ["Refuses fake precision", "Exam results are unknowable now, so Reso shows bands of what could happen — and says so."],
                ["Reports weekly", "One honest digest: the trend, the leak, the streak, the course to work, and a question to sit with."],
              ].map(([t, d], i) => (
                <div key={t} className="rv border-t py-5 first:border-t-0" style={{ borderColor: "rgba(255,255,255,0.14)", ...cv({ "--rvd": `${i * 90}ms` }) }}>
                  <div className="font-serif text-lg font-semibold text-white">{t}</div>
                  <div className="mt-1.5 max-w-sm text-sm leading-relaxed text-white/55">{d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- PRIVACY ---------- */}
      <section className="relative overflow-hidden py-32 md:py-40">
        <div className="absolute inset-0">
          <img src={PH.building} alt="Massachusetts Hall, Harvard University" className="ph h-full w-full object-cover" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, var(--page) 0%, color-mix(in srgb, var(--page) 62%, transparent) 28%, color-mix(in srgb, var(--page) 62%, transparent) 72%, var(--page) 100%)",
            }}
          />
        </div>
        <div className="relative z-10 mx-auto max-w-3xl px-5 sm:px-6">
          <div className="relative">
            <div className="glass absolute inset-x-10 -bottom-5 top-10 -rotate-2 opacity-60" aria-hidden />
            <div className="glass absolute inset-x-4 -bottom-2.5 top-5 rotate-1 opacity-75" aria-hidden />
            <div className="rv glass glass-strong glass-edge glass-spec relative rounded-3xl p-8 md:p-11">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--ink-soft)" }}>
                Private by construction
              </div>
              <h2 className="font-serif mt-4 text-4xl font-semibold leading-tight tracking-tight md:text-[2.9rem]">
                One person. One device. No account.
              </h2>
              <p className="mt-5 max-w-lg text-[15px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                Everything you write — scores, spending, moods, the journal — is stored on this device, in structured local storage. There is no
                server-side copy of your life, because there is no server-side you.
              </p>
              <div className="mt-7 space-y-0">
                {[
                  ["No login, no password, no multi-user", "Separation comes from the device, not from an account system."],
                  ["Stateless intelligence", "The AI reads the words it is given for one request, holds nothing, and forgets on the way out."],
                  ["One honest backup", "Export the entire store to a file whenever you like. That file is the backup."],
                ].map(([t, d]) => (
                  <div key={t} className="flex flex-col gap-1 border-t py-4 sm:flex-row sm:items-baseline sm:gap-6" style={{ borderColor: "var(--glass-border)" }}>
                    <div className="w-56 shrink-0 font-semibold text-sm">{t}</div>
                    <div className="text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                      {d}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="rv mt-8 text-center text-xs" style={{ color: "var(--ink-soft)" }}>
            Shaped around a Nigerian university semester — CA and exam weighting, Naira allowance cycles — without being chained to it.
          </p>
        </div>
      </section>

      {/* ---------- CLOSING ---------- */}
      <section className="px-5 sm:px-6 py-36 text-center md:py-44">
        <h2 className="rv font-serif mx-auto max-w-3xl text-[clamp(2.6rem,7vw,5.2rem)] font-semibold leading-[1.02] tracking-tight">
          <Masked text="It will never flatter you." centered />
        </h2>
        <p className="rv mx-auto mt-6 max-w-md text-[15px] leading-relaxed" style={{ color: "var(--ink-soft)", ...cv({ "--rvd": "120ms" }) }}>
          That is the whole point. When it says you are on pace, you are on pace. When it says otherwise, it will say how to get back.
        </p>
        <div className="rv mt-10" style={cv({ "--rvd": "200ms" })}>
          <Link href="/overview" className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-8 py-4 text-base font-semibold text-[var(--accent-ink)] shadow-xl hover:brightness-110 transition">
            Open Reso <ChevronRight size={18} />
          </Link>
          <div className="mt-3 text-xs" style={{ color: "var(--ink-soft)" }}>
            First time through? A short setup walks your semester in.
          </div>
        </div>
      </section>

      <footer className="border-t px-5 sm:px-6 py-8" style={{ borderColor: "var(--r-line)" }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 text-xs sm:flex-row" style={{ color: "var(--ink-soft)" }}>
          <span>Reso — a personal companion for one student, on one device.</span>
          <span>Your data never leaves your device</span>
        </div>
      </footer>
    </div>
  );
}

function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl font-serif font-semibold"
      style={{ width: size, height: size, background: "var(--ink)", color: "var(--page)", fontSize: size * 0.55 }}
      aria-hidden
    >
      R
    </span>
  );
}

function Masked({ text, start = 0, centered }: { text: string; start?: number; centered?: boolean }) {
  return (
    <span className={centered ? "block" : undefined}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="wm">
          <span style={cv({ "--d": `${start + i * 60}ms` })}>{w}&nbsp;</span>
        </span>
      ))}
    </span>
  );
}

function Pillar({
  flip, photo, alt, index, title, body, lines, overlay,
}: {
  flip: boolean; photo: string; alt: string; index: string; title: string; body: string;
  lines: [string, string][]; overlay: ReactNode;
}) {
  return (
    <div className="grid items-center gap-10 border-t py-16 md:py-20 lg:grid-cols-12 lg:gap-14" style={{ borderColor: "var(--r-line)" }}>
      <div className={`rv relative lg:col-span-7 ${flip ? "lg:order-2" : ""}`}>
        <div className="glass p-2.5" style={{ borderRadius: 22 }}>
          <div className="relative overflow-hidden rounded-[14px]" style={{ aspectRatio: "4 / 3" }}>
            <img src={photo} alt={alt} className="ph kenburns h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(8,8,12,0.35), transparent 45%)" }} />
          </div>
        </div>
        <div className="rv absolute -bottom-8 left-5 right-5 sm:left-8 sm:right-auto sm:w-[340px]" style={cv({ "--rvd": "140ms" })}>
          {overlay}
        </div>
      </div>
      <div className={`rv mt-10 lg:col-span-5 lg:mt-0 ${flip ? "lg:order-1" : ""}`} style={cv({ "--rvd": "100ms" })}>
        <div className="font-serif text-sm font-semibold" style={{ color: "var(--ink-soft)" }}>
          {index}
        </div>
        <h3 className="font-serif mt-3 text-[1.75rem] font-semibold leading-snug tracking-tight md:text-4xl">{title}</h3>
        <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {body}
        </p>
        <div className="mt-7">
          {lines.map(([t, d]) => (
            <div key={t} className="border-t py-3.5" style={{ borderColor: "var(--r-line)" }}>
              <div className="text-sm font-semibold">{t}</div>
              <div className="mt-0.5 text-[13px]" style={{ color: "var(--ink-soft)" }}>
                {d}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SEQ: { t: "u" | "r" | "d"; x: string }[] = [
  { t: "u", x: "Had an impromptu CSC141 test today. Don't know the score yet." },
  { t: "r", x: "Noted as open. It stays out of the math until the result lands." },
  { t: "d", x: "3 days later" },
  { t: "u", x: "Got the CSC141 result. 18 out of 20." },
  { t: "r", x: "Resolved — that open record is now 18/20. CSC141 sits at 84.2%, and the pace holds." },
];

function TypedJournal() {
  const ref = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(0);
  const [typed, setTyped] = useState(0);
  const [finished, setFinished] = useState(false);
  const started = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting && !started.current) {
          started.current = true;
          io.disconnect();
          if (reduce) {
            setDone(SEQ.length);
            setFinished(true);
            return;
          }
          run();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => {
      alive.current = false;
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

  async function run() {
    for (let i = 0; i < SEQ.length && alive.current; i++) {
      const m = SEQ[i];
      if (m.t === "u") {
        setTyped(0);
        for (let c = 1; c <= m.x.length && alive.current; c++) {
          setTyped(c);
          await sleep(26);
        }
        await sleep(420);
      } else if (m.t === "r") {
        await sleep(950);
      } else {
        await sleep(700);
      }
      setDone(i + 1);
      if (alive.current) await sleep(m.t === "d" ? 900 : 700);
    }
    if (alive.current) setFinished(true);
  }

  return (
    <div ref={ref}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Journal · this week</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-white/60">
          <Mic size={11} /> voice in
        </span>
      </div>
      <div className="mt-4 min-h-[300px] space-y-3 md:min-h-[280px]">
        {SEQ.map((m, i) => {
          if (i > done) return null;
          const active = i === done && !finished;
          if (m.t === "d") {
            return (
              <div key={i} className="flex items-center gap-3 py-1" style={{ opacity: active ? 0 : 1, transition: "opacity .5s" }}>
                <span className="h-px flex-1 bg-white/15" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{m.x}</span>
                <span className="h-px flex-1 bg-white/15" />
              </div>
            );
          }
          const text = m.t === "u" && active ? m.x.slice(0, typed) : m.x;
          if (m.t === "u") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-white px-4 py-2.5 text-sm leading-snug text-[#111114]">
                  {text}
                  {active && <span className="caret ml-0.5" />}
                </div>
              </div>
            );
          }
          return (
            <div key={i} className="flex justify-start">
              <div
                className="max-w-[85%] rounded-2xl rounded-bl-sm border border-white/15 bg-white/10 px-4 py-2.5 text-sm leading-snug text-white/90"
                style={{
                  opacity: active ? 0 : 1,
                  filter: active ? "blur(6px)" : "none",
                  transform: active ? "translateY(6px)" : "none",
                  transition: "opacity .55s, filter .55s, transform .55s",
                }}
              >
                {active ? (
                  <span className="tdots">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  text
                )}
              </div>
            </div>
          );
        })}
        {finished && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-white/45">One record, created and resolved across two days.</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-white/60">
              <Check size={11} /> memory held
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <Landing />;
}
