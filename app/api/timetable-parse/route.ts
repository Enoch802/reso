import { NextRequest, NextResponse } from "next/server";

/**
 * Stateless vision route: receives a timetable image/PDF data URL, asks OpenRouter
 * (openrouter/free, vision) to extract rows, returns them for client-side review.
 * Nothing is stored.
 */

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const OR_MODEL = "openrouter/free";

const PROMPTS: Record<string, string> = {
  class: `This is a university class timetable. Extract every scheduled class into JSON rows:
{"rows":[{"course_code":"CSC141","day":"Monday","start_time":"08:00","end_time":"10:00","venue":"LT1"}]}
Rules: course_code uppercase; day is a full weekday name; times 24h HH:MM; venue as printed or "".
Return ONLY the JSON object.`,
  exam: `This is a university exam timetable. Extract every exam into JSON rows:
{"rows":[{"course_code":"CSC141","day":"2026-11-20","start_time":"09:00","end_time":"","venue":"Hall 2"}]}
Rules: course_code uppercase; day as yyyy-mm-dd (resolve relative dates against the visible academic year); times 24h HH:MM or ""; venue as printed or "".
Return ONLY the JSON object.`,
  study: `This is a student's personal study timetable. Extract every study block into JSON rows:
{"rows":[{"course_code":"CSC141","day":"Monday","start_time":"19:00","end_time":"21:00","venue":""}]}
Rules: course_code as printed, uppercase, or "" if it is a generic subject like "Revision"; day full weekday name or yyyy-mm-dd if a specific date; times 24h HH:MM; put what the block is about (e.g. "Chem past questions") in venue.
Return ONLY the JSON object.`,
};

export async function POST(req: NextRequest) {
  try {
    const { image, kind, text: rawText } = await req.json();
    const prompt = PROMPTS[kind as string] ?? PROMPTS.class;
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return NextResponse.json({ error: "ai-not-configured" }, { status: 503 });

    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
    if (rawText && String(rawText).trim().length > 0) {
      // Text extracted from PDF/DOCX client-side — no vision needed.
      content.push({ type: "text", text: `Document text:\n${String(rawText).slice(0, 18000)}` });
    } else if (image) {
      content.push({ type: "image_url", image_url: { url: image } });
    } else {
      return NextResponse.json({ error: "parse-failed" }, { status: 400 });
    }

    const res = await fetch(OR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: OR_MODEL, messages: [{ role: "user", content }] }),
    });
    if (!res.ok) return NextResponse.json({ error: "parse-failed" }, { status: 502 });
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : text;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return NextResponse.json({ error: "parse-failed" }, { status: 502 });
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ error: "parse-failed" }, { status: 502 });
  }
}
