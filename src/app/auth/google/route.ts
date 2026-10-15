import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { decodeAttempt, GOOGLE_COOKIE, sameState } from "@/server/google-signin";
import { log } from "@/server/log";
import { secondFactorDue } from "@/server/mfa";
import { rateLimitIp } from "@/server/ratelimit";

export const runtime = "nodejs";

/**
 * POST /auth/google : Google posts the ID token here (form_post) after the person picks an account. The state must
 * match the cookie set when the sign-in started; Supabase then verifies the token and its nonce and opens a session.
 * See src/server/google-signin.ts.
 */
export async function POST(request: NextRequest) {
  const app = publicEnv().NEXT_PUBLIC_APP_URL;
  // 303 so the browser follows with a GET
  const go = (path: string) => {
    const res = NextResponse.redirect(`${app}${path}`, 303);
    res.cookies.set(GOOGLE_COOKIE, "", { path: "/", secure: true, httpOnly: true, sameSite: "none", maxAge: 0 });
    return res;
  };
  const failed = () => go("/auth/sign-in?error=google_failed");

  try {
    await rateLimitIp("auth", request);
  } catch {
    return go("/auth/sign-in?error=rate_limited");
  }

  const attempt = decodeAttempt(request.cookies.get(GOOGLE_COOKIE)?.value);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failed();
  }
  const idToken = String(form.get("id_token") ?? "");
  const state = String(form.get("state") ?? "");
  if (form.get("error")) return failed(); // the person cancelled, or Google refused
  if (!attempt || !sameState(attempt.state, state) || !idToken || idToken.length > 8192) {
    log("warn", "google_signin_rejected", { reason: attempt ? "state_or_token" : "no_attempt" });
    return failed();
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce: attempt.nonce });
  if (error) {
    log("warn", "google_signin_failed", { reason: error.code ?? "unknown" });
    return failed();
  }
  const next = safeNext(attempt.next);
  if (await secondFactorDue(supabase)) return go(`/auth/mfa?next=${encodeURIComponent(next)}`);
  return go(next);
}
