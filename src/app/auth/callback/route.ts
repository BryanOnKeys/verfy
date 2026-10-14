import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { secondFactorDue } from "@/server/mfa";
import { log } from "@/server/log";

export const runtime = "nodejs";

/**
 * GET /auth/callback?code=…&next=… : finishes OAuth (GitHub), magic-link and
 * password-reset sign-ins by exchanging the one-time PKCE code for a session
 * cookie. `next` is restricted to known in-app paths (no open redirect).
 */
export async function GET(request: NextRequest) {
  const app = publicEnv().NEXT_PUBLIC_APP_URL;
  const code = request.nextUrl.searchParams.get("code");
  const reset = request.nextUrl.searchParams.get("reset") === "1";
  const next = reset ? "/auth/reset-password" : safeNext(request.nextUrl.searchParams.get("next"));
  if (!code || code.length > 512) return NextResponse.redirect(`${app}/auth/sign-in?error=invalid_link`);
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    log("warn", "auth_callback_failed", { reason: error.code ?? "unknown" });
    return NextResponse.redirect(`${app}/auth/sign-in?error=invalid_link`);
  }
  if (await secondFactorDue(supabase)) return NextResponse.redirect(`${app}/auth/mfa?next=${encodeURIComponent(next)}`);
  return NextResponse.redirect(`${app}${next}`);
}
