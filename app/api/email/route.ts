import { NextRequest, NextResponse } from "next/server";

/**
 * Stateless Gmail summarization route.
 * The client sends an account id + its stored token info (kept in local IndexedDB).
 * This route: fetches new emails server-side via the Gmail API (token handling must
 * happen server-side), refreshes the token if expired (via refresh_token when a
 * client secret is configured), ranks each mail with OpenRouter, and returns the
 * ranked list. The route itself retains nothing.
 *
 * CORS handled here directly — the bundled Android app (origin https://localhost)
 * calls this route cross-origin; the OPTIONS handler answers the preflight and
 * every response is stamped with allow-headers.
 */

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const OR_MODEL = "openrouter/free";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface RankedEmail {
  subject: string;
  sender: string;
  snippet: string;
  summary: string;
  rank: "important" | "medium" | "low";
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null; // implicit-flow tokens: no server refresh possible
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  return res.json();
}

async function gmailFetch(path: string, accessToken: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const { access_token, refresh_token, token_expires_at, last_fetched_at } = await req.json();
    let accessToken: string = access_token;
    let expiresAt = Number(token_expires_at ?? 0);

    // Token refresh via the same stateless pattern when expired.
    if (!accessToken || Date.now() > Number(token_expires_at ?? 0)) {
      if (!refresh_token) return json({ error: "reconnect-needed" }, 401);
      const refreshed = await refreshAccessToken(refresh_token);
      if (!refreshed) return json({ error: "reconnect-needed" }, 401);
      accessToken = refreshed.access_token;
      expiresAt = Date.now() + refreshed.expires_in * 1000;
    }

    // New mail since last fetch (or the last day's mail on first fetch).
    const after = Math.floor((last_fetched_at ? Number(last_fetched_at) : Date.now() - 86400000) / 1000);
    const listRes = await gmailFetch(`messages?maxResults=25&q=newer_than:1d`, accessToken);
    if (listRes.status === 401) return json({ error: "reconnect-needed" }, 401);
    if (!listRes.ok) return json({ error: "email-failed" }, 502);
    const list = await listRes.json();
    const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);

    const mails: Array<{ subject: string; sender: string; snippet: string }> = [];
    for (const id of ids.slice(0, 20)) {
      const msgRes = await gmailFetch(`messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, accessToken);
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();
      const headers: Array<{ name: string; value: string }> = msg?.payload?.headers ?? [];
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
      const sender = headers.find((h) => h.name === "From")?.value ?? "";
      const snippet: string = msg?.snippet ?? "";
      mails.push({ subject, sender, snippet: snippet.slice(0, 220) });
    }

    if (!mails.length) return json({ items: [], accessToken, expiresAt });

    // Rank with OpenRouter.
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return json({ error: "ai-not-configured" }, 503);
    const rankRes = await fetch(OR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: OR_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You triage a university student's email. For each mail return rank "important" (needs attention today: exams, deadlines, lectures, fees, official university business, people they know), "medium" (useful but not urgent), or "low" (promotions, newsletters, noise). Write a one-line plain-language summary as a friend would say it — never corporate. NEVER use emojis. Return JSON: {"items":[{"subject":"...","sender":"...","snippet":"...","summary":"...","rank":"important"}]} keeping the same order.`,
          },
          { role: "user", content: JSON.stringify(mails) },
        ],
      }),
    });
    if (!rankRes.ok) return json({ error: "email-failed" }, 502);
    const data = await rankRes.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "[]";
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : text;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    let items: RankedEmail[] = [];
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      items = (parsed.items ?? []).filter((i: RankedEmail) => i && i.subject != null);
    }
    return json({ items, accessToken, expiresAt });
  } catch {
    return json({ error: "email-failed" }, 502);
  }
}
