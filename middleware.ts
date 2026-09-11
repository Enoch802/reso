import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CORS for the /api routes — required because the bundled Android app
 * (origin https://localhost) calls the Vercel deployment cross-origin.
 * Answers the browser's preflight OPTIONS handshake and stamps allow
 * headers on every API response.
 */
export function middleware(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const res = NextResponse.next();
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
