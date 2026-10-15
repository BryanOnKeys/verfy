import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, makeNonce } from "@/lib/csp";
import { clientIp, screen, type Rejection } from "@/lib/shield";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";

/**
 * Runs before every page request:
 *  0. the shield: floods, scanner probes, odd methods and oversized URLs are refused before any work is done,
 *  1. a fresh CSP nonce for this response,
 *  2. refreshes the Supabase session cookie (the official SSR pattern),
 *  3. an optimistic redirect to sign-in for /dashboard and /settings.
 * The real authorization check happens again on the server for every page and
 * API call; this redirect is only a convenience.
 */
const PROTECTED = [/^\/dashboard(\/|$)/, /^\/settings(\/|$)/];

const MESSAGES: Record<Rejection["status"], string> = {
  404: "Not found.",
  405: "Method not allowed.",
  414: "The address is too long.",
  429: "Too many requests. Wait a moment and try again.",
};

function refuse(r: Rejection): NextResponse {
  return new NextResponse(MESSAGES[r.status], {
    status: r.status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...(r.retryAfter ? { "Retry-After": String(r.retryAfter) } : {}),
      ...(r.status === 405 ? { Allow: "GET, HEAD, POST" } : {}),
    },
  });
}

export async function proxy(request: NextRequest) {
  const rejected = screen("page", { method: request.method, url: request.url, pathname: request.nextUrl.pathname, ip: clientIp(request.headers) });
  if (rejected) return refuse(rejected);
  const nonce = makeNonce();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const oauth = [
    ...(process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true" ? (["google"] as const) : []),
    ...(process.env.NEXT_PUBLIC_AUTH_GITHUB_ENABLED === "true" ? (["github"] as const) : []),
  ];
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development", supabaseUrl, captcha: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY), oauth });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  requestHeaders.set("x-request-id", requestId);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  let signedIn = false;

  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookieOptions: sessionCookieOptions(process.env.NEXT_PUBLIC_APP_URL),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          // pass the refreshed session to Server Components in this same request
          requestHeaders.set("cookie", request.cookies.toString());
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    });
    // Do not run code between createServerClient and getClaims: it refreshes the session.
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  }

  const path = request.nextUrl.pathname;
  if (!signedIn && PROTECTED.some((re) => re.test(path))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.search = "";
    url.searchParams.set("next", path);
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
