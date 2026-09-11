import { NextRequest, NextResponse } from "next/server";

/**
 * Stateless AI route: client sends data in, route calls OpenRouter, returns result.
 * Nothing is stored here. All persistence happens on-device in the client.
 *
 * CORS is handled here directly (not only via middleware) because the bundled
 * Android app (origin https://localhost) calls this route cross-origin. The
 * OPTIONS handler answers the browser's preflight; every JSON response is
 * stamped with allow-headers.
 */

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const OR_MODEL = "openrouter/free";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** JSON response with CORS headers stamped. */
function json(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/** Preflight handshake — required for cross-origin POSTs with JSON bodies. */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function callOpenRouter(messages: Array<{ role: string; content: string }>, jsonMode = false) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("missing-key");
  const res = await fetch(OR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: OR_MODEL,
      messages,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error("openrouter-error");
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  return text;
}

function extractJson(text: string): Record<string, unknown> {
  // Tolerant JSON extraction: model may wrap in fences.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no-json");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode: string = body.mode;

    if (mode === "chat") {
      const text: string = body.text ?? "";
      const context: string = body.context ?? "";
      const system = `You are Reso, a warm, plain-spoken companion inside a student's personal discipline app. Voice: a close friend rooting for them — empathy before correction, specific praise for real wins, never guilt, shame, or pressure. ABSOLUTE RULE: never use emojis or emoticons of any kind, in any reply.
You are parsing an evening journal reflection. Reply with JSON only:
{"reply": "2-3 sentence warm reply", "study_hours": number|null, "mood": "good"|"okay"|"rough"|"sick"|null,
 "mentioned_pending": [{"course_hint":"CSC141","label":"Test 2"}],
 "mentioned_score": [{"course_hint":"CSC141","label":"Test 2","percent": 72}]}
Rules: mentioned_pending = tests/assessments the student says they wrote or have coming but with NO score given. mentioned_score = assessments with an actual score/percent mentioned — match them to pending labels when the same test is referenced. course_hint should be a course code if spoken, else the topic words. Keep summaries plain.`;
      const out = await callOpenRouter(
        [
          { role: "system", content: system },
          { role: "user", content: `Known courses & context: ${context}\n\nJournal entry: ${text}` },
        ],
        true
      );
      const j = extractJson(out);
      return json(j);
    }

    if (mode === "digest") {
      const input = body.input;
      const system = `You are Reso, writing a student's private weekly digest. Warm, honest, conversational — a friend, not a coach. NEVER use emojis. Vary your phrasing; never sound corporate.
Write a short digest (120-180 words) as plain sentences separated by newlines, covering, when present in the data:
1) The biggest "want" spending leak by note/category this week, named plainly.
2) Best active routine streak.
3) An academic course note based only on CourseCoach activity or untouched topic count; never infer academic performance from scores or grades.
4) Acknowledge sick days kindly if any (they never count against the student).
5) Weekly plan completion and savings vs target.
6) ONLY IF avgScreenTimeMinutes is present AND it genuinely correlates with the week's story (e.g. contrasting with study hours or routine consistency): one warm, non-judgmental sentence about screen time. Never moralize, never if absent — silence is correct when there is nothing honest to say.
If data is missing or zero, handle it gracefully with a kind line instead of skipping or apologizing heavily.
ALWAYS end with a single gentle reflection question on its own line, prefixed with "One thought: ".`;
      const out = await callOpenRouter([
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
      ]);
      return json({ digest: out.trim() });
    }

    if (mode === "coach") {
      const question: string = body.question ?? "";
      const context: string = body.context ?? "";
      const system = `You are Reso's course coach, chatting inside one course's page. Voice: a warm, plain-spoken close friend who knows this course's details — empathy before correction, specific and practical, never guilt or pressure. ABSOLUTE RULE: never use emojis.
Answer ONLY from the course context provided (topics and their states, exam date/time/venue, weekly class times, target). Give concrete study advice: what to revise next, how to split remaining days, what to practice. If something isn't in the context, say you're not sure rather than inventing it. Keep replies short — 2-5 sentences.`;
      const out = await callOpenRouter([
        { role: "system", content: system },
        { role: "user", content: `Course context: ${context}

My question: ${question}` },
      ]);
      return json({ reply: out.trim() });
    }

    return json({ error: "unknown-mode" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    const friendly = msg === "missing-key" ? "ai-not-configured" : "ai-unavailable";
    return json({ error: friendly }, 503);
  }
}
