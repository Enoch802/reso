import { NextRequest, NextResponse } from "next/server";

/**
 * Gmail OAuth callback: exchanges the auth code for tokens, then postMessages
 * them to the popup's opener and closes itself. The postMessage targets "*"
 * because the opener may be the bundled app (https://localhost) OR the website
 * (this deployment's origin) — authenticity is guaranteed by the random state
 * token, which the client verifies against sessionStorage before accepting.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const error = req.nextUrl.searchParams.get("error");
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ?? `${req.nextUrl.origin}/api/email/callback`;
  const finish = (payload: Record<string, unknown>) => NextResponse.json(payload, { status: payload.error ? 400 : 200 });
  if (error || !code) return finish({ error: error ?? "missing-code", state });

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return finish({ error: "google-oauth-not-configured", state });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!tokenRes.ok) return finish({ error: "code-exchange-failed", state });
  const tokens = await tokenRes.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!tokens.access_token || !tokens.refresh_token) return finish({ error: "refresh-token-missing", state });
  const html = `<!doctype html><script>window.opener?.postMessage(${JSON.stringify({
    type: "reso-google-oauth", state, accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  })}, "*"); window.close();</script>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
