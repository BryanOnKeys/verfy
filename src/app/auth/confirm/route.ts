import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { secondFactorDue } from "@/server/mfa";

export const runtime = "nodejs";

const TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/** GET /auth/confirm?token_hash=…&type=… : email links that use a token hash instead of a PKCE code. */
export async function GET(request: NextRequest) {
  const app = publicEnv().NEXT_PUBLIC_APP_URL;
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  if (!tokenHash || tokenHash.length > 512 || !type || !TYPES.includes(type)) return NextResponse.redirect(`${app}/auth/sign-in?error=invalid_link`);
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(`${app}/auth/sign-in?error=invalid_link`);
  const next = type === "recovery" ? "/auth/reset-password" : safeNext(request.nextUrl.searchParams.get("next"));
  if (await secondFactorDue(supabase)) return NextResponse.redirect(`${app}/auth/mfa?next=${encodeURIComponent(next)}`);
  return NextResponse.redirect(`${app}${next}`);
}
