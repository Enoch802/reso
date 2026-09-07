"use client";
import { useRef, useState } from "react";
import { UploadCloud, Pencil, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { NeoButton, Tag } from "./ui";
import { aiParseTimetable, ParsedTimetableRow } from "@/lib/ai";

const DAY_TO_NUM: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

export function dayToNum(day: string): number | null {
  const k = day.trim().toLowerCase();
  if (DAY_TO_NUM[k] != null) return DAY_TO_NUM[k];
  return Object.entries(DAY_TO_NUM).find(([name]) => k.startsWith(name.slice(0, 3)))?.[1] ?? null;
}

export interface ReviewRow extends ParsedTimetableRow {
  _key: string;
}

/** Extract text from PDF in the browser via pdf.js (CDN UMD build, sets window.pdfjsLib). */
async function pdfToText(file: File): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    if ((window as unknown as Record<string, unknown>)["pdfjsLib"]) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("pdf-lib-failed"));
    document.head.appendChild(s);
  });
  const lib = (window as unknown as {
    pdfjsLib: {
      GlobalWorkerOptions: { workerSrc: string };
      getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
    };
  }).pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    parts.push(tc.items.map((it) => it.str ?? "").join(" "));
  }
  return parts.join("\n");
}

interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
  }>;
}

/** Render page 1 of a PDF to a data URL — used when a PDF has no text layer (scanned). */
async function renderPdfFirstPage(file: File): Promise<string> {
  const win = window as unknown as { pdfjsLib?: PdfLibNamespace };
  if (!win.pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("pdf-lib-failed"));
      document.head.appendChild(s);
    });
  }
  const lib = (window as unknown as { pdfjsLib: { GlobalWorkerOptions: { workerSrc: string }; getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> } } }).pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width; canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.9);
}

interface PdfLibNamespace {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
}

/** Extract text from DOCX in the browser via mammoth (CDN, no bundle dependency). */
async function docxToText(file: File): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    if ((window as unknown as Record<string, unknown>)["mammoth"]) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("docx-lib-failed"));
    document.head.appendChild(s);
  });
  const buf = await file.arrayBuffer();
  const mammoth = (window as unknown as { mammoth: { extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> } }).mammoth;
  const out = await mammoth.extractRawText({ arrayBuffer: buf });
  return out.value;
}

/**
 * Upload (image / PDF / DOCX) → AI extraction → editable review list.
 * Or build the timetable entirely by hand with the manual editor.
 */
export default function TimetableUpload({
  kind, courseCodes, onSave, onCodesFound,
}: {
  kind: "class" | "exam" | "study";
  courseCodes: string[];
  onSave: (rows: ReviewRow[]) => Promise<void> | void;
  onCodesFound?: (codes: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [saved, setSaved] = useState(false);

  const parse = async (file: File) => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const isDocx = file.name.toLowerCase().endsWith(".docx");
      let parsed: ParsedTimetableRow[];
      if (isPdf || isDocx) {
        const text = isPdf ? await pdfToText(file) : await docxToText(file);
        let body: Record<string, unknown>;
        if (text.trim()) {
          // Real text document — send extracted text to the (cheaper, faster) text call.
          body = { kind, text };
        } else if (isPdf) {
          // Scanned PDF with no text layer — fall back to vision on a rendered page.
          const dataUrl = await renderPdfFirstPage(file);
          body = { kind, image: dataUrl };
        } else {
          throw new Error("parse-failed");
        }
        parsed = await fetch("/api/timetable-parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(async (r) => {
          if (!r.ok) throw new Error("parse-failed");
          return (await r.json()).rows;
        });
      } else {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(new Error("read-failed"));
          r.readAsDataURL(file);
        });
        parsed = await aiParseTimetable(dataUrl, kind);
      }
      if (!parsed?.length) throw new Error("parse-failed");
      setRows(parsed.map((r, i) => ({ ...r, _key: `r${i}` })));
      const found = Array.from(new Set(parsed.map((r) => (r.course_code || "").toUpperCase()).filter(Boolean)));
      onCodesFound?.(found);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "parse-failed";
      setError(
        msg === "ai-not-configured"
          ? "The AI reader isn't configured on this device yet — you can add these entries by hand instead."
          : "That didn't parse cleanly. Try again, or build the entries by hand below."
      );
    } finally {
      setBusy(false);
    }
  };

  const unmatched = rows.filter((r) => r.course_code && !courseCodes.includes(r.course_code.toUpperCase()));
  const valid = rows.filter((r) => r.course_code || kind === "study");

  const save = async () => {
    await onSave(valid);
    setSaved(true);
    setRows([]);
  };

  const setRow = (key: string, patch: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  if (saved) {
    return (
      <div className="text-sm py-2 animate-fade-up" style={{ color: "var(--ink)" }}>
        Saved. Your {kind === "class" ? "class timetable" : kind === "exam" ? "exam timetable" : "study timetable"} is up to date.
      </div>
    );
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.docx"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) parse(f);
          e.target.value = "";
        }}
      />
      <NeoButton onClick={() => fileRef.current?.click()} disabled={busy}>
        <span className="inline-flex items-center gap-2">
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <UploadCloud size={16} aria-hidden />}
          {busy ? "Reading your document…" : "Upload image, PDF or DOCX"}
        </span>
      </NeoButton>

      {error && (
        <p className="mt-3 text-sm text-[var(--ink-soft)] flex items-start gap-2 animate-fade-up">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" aria-hidden /> {error}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 animate-fade-up">
          <p className="text-sm text-[var(--ink-soft)] mb-1 flex items-center gap-1.5">
            <Pencil size={14} aria-hidden /> Check these before saving — fix anything that looks off.
          </p>
          {unmatched.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-300 mb-2 flex items-center gap-1.5">
              <AlertTriangle size={13} aria-hidden />
              {Array.from(new Set(unmatched.map((u) => u.course_code.toUpperCase()))).join(", ")} — not in your course list yet. Saving will add them.
            </p>
          )}
          <div className="max-h-72 overflow-y-auto rounded-2xl neo-pressed p-3 space-y-2">
            {rows.map((r) => (
              <div key={r._key} className={`grid gap-2 items-center ${kind === "class" ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-6"}`}>
                <input
                  aria-label="Course code"
                  value={r.course_code}
                  onChange={(e) => setRow(r._key, { course_code: e.target.value.toUpperCase() })}
                  className="focus-ring col-span-2 sm:col-span-1 rounded-lg bg-[var(--neo-base)] border border-white/30 dark:border-white/5 px-2.5 py-1.5 text-sm"
                />
                <input
                  aria-label="Day"
                  value={r.day}
                  onChange={(e) => setRow(r._key, { day: e.target.value })}
                  className="focus-ring rounded-lg bg-[var(--neo-base)] border border-white/30 dark:border-white/5 px-2.5 py-1.5 text-sm"
                />
                <input
                  aria-label="Start time"
                  value={r.start_time}
                  onChange={(e) => setRow(r._key, { start_time: e.target.value })}
                  className="focus-ring rounded-lg bg-[var(--neo-base)] border border-white/30 dark:border-white/5 px-2.5 py-1.5 text-sm"
                />
                <input
                  aria-label="End time"
                  value={r.end_time}
                  onChange={(e) => setRow(r._key, { end_time: e.target.value })}
                  className="focus-ring rounded-lg bg-[var(--neo-base)] border border-white/30 dark:border-white/5 px-2.5 py-1.5 text-sm"
                />
                {kind !== "class" && (
                  <input
                    aria-label={kind === "study" ? "What the block covers" : "Venue"}
                    value={r.venue}
                    onChange={(e) => setRow(r._key, { venue: e.target.value })}
                    className="focus-ring rounded-lg bg-[var(--neo-base)] border border-white/30 dark:border-white/5 px-2.5 py-1.5 text-sm"
                  />
                )}
                <button
                  onClick={() => setRows((rs) => rs.filter((x) => x._key !== r._key))}
                  aria-label="Remove row"
                  className="focus-ring justify-self-end text-[var(--ink-faint)] hover:text-rose-500 p-1.5 col-span-2 sm:col-span-1"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <NeoButton variant="accent" onClick={save} className="font-semibold">Save {valid.length} entries</NeoButton>
            <Tag>{kind === "exam" ? "exam timetable" : kind === "study" ? "study timetable" : "class timetable"}</Tag>
          </div>
        </div>
      )}
    </div>
  );
}
