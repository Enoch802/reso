"use client";
import { API_BASE } from "./ai";

/**
 * Gmail connection via OAuth 2.0 authorization code flow, read-only scope.
 * Tokens are stored ONLY in local IndexedDB — this connection's data stays on-device.
 * Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID and a server-side client secret; otherwise the UI shows a calm
 * not-yet-configured note instead of a broken flow.
 *
 * The callback route exists only on the Vercel deployment, so in the bundled
 * Android app (origin https://localhost) both the redirect URI and the
 * postMessage origin check must target the deployment explicitly — the same
 * redirect URI already registered in Google Cloud Console from the web build.
 */

export const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** The deployment origin the OAuth callback lives on. */
const CALLBACK_ORIGIN = new URL(API_BASE).origin;

export function googleConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 10;
}

/** Open the consent window; the server callback exchanges the code for durable tokens. */
export function requestGmailAccess(): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  return new Promise((resolve, reject) => {
    const state = crypto.randomUUID();
    sessionStorage.setItem("reso-google-oauth-state", state);
    const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ?? `${API_BASE}/api/email/callback`;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    const popup = window.open(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, "reso-google-oauth", "width=520,height=700");
    if (!popup) return reject(new Error("popup-blocked"));
    const receive = (event: MessageEvent) => {
      if (event.origin !== CALLBACK_ORIGIN || event.data?.type !== "reso-google-oauth") return;
      if (event.data.state !== sessionStorage.getItem("reso-google-oauth-state")) return reject(new Error("invalid-state"));
      window.removeEventListener("message", receive);
      sessionStorage.removeItem("reso-google-oauth-state");
      if (event.data.error || !event.data.accessToken || !event.data.refreshToken) return reject(new Error(event.data.error ?? "consent-failed"));
      resolve({ accessToken: event.data.accessToken, refreshToken: event.data.refreshToken, expiresAt: event.data.expiresAt });
    };
    window.addEventListener("message", receive);
  });
}
