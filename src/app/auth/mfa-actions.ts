"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/safe-redirect";
import { ApiError } from "@/server/http";
import { log } from "@/server/log";
import { rateLimit } from "@/server/ratelimit";
import { getSessionUser } from "@/server/session";
import type { FormState } from "./actions";

/**
 * Two-factor authentication with an authenticator app (TOTP), through Supabase Auth's MFA API. Supabase stores the
 * secret and checks the codes; the database refuses organization data to sessions that have not passed the second
 * step (supabase/migrations/20261012000200_mfa.sql). Code attempts are rate limited per user.
 */

const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.");
const factorId = z.string().uuid();

async function limited(userId: string, kind: string): Promise<string | null> {
  try {
    await rateLimit("auth", `mfa-${kind}:${userId}`);
    return null;
  } catch (e) {
    return e instanceof ApiError && e.status === 429 ? "Too many attempts. Wait a few minutes and try again." : "Try again in a moment.";
  }
}

/** The code prompt after a password (or email link) sign-in. */
export async function verifySecondFactor(_: FormState, form: FormData): Promise<FormState> {
  const next = safeNext(String(form.get("next") ?? ""));
  const parsed = code.safeParse(form.get("code"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { user, supabase } = await getSessionUser();
  if (!user) redirect("/auth/sign-in");
  const limit = await limited(user.id, "verify");
  if (limit) return { error: limit };
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (listError || !factor) return { error: "No authenticator is set up for this account." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data });
  if (error) {
    log("warn", "mfa_verify_failed", { reason: error.code ?? "unknown" });
    return { error: "That code is not right, or it has expired. Try the current one." };
  }
  redirect(next);
}

export interface Enrollment {
  error?: string;
  factorId?: string;
  qr?: string;
  secret?: string;
}

/** Step 1 of turning 2FA on: create an unverified factor and return its QR code and secret. */
export async function startTotpEnrollment(): Promise<Enrollment> {
  const { user, supabase, mfaPending } = await getSessionUser();
  if (!user || mfaPending) return { error: "Sign in again first." };
  const limit = await limited(user.id, "enroll");
  if (limit) return { error: limit };
  // drop abandoned attempts, so the account never collects unverified factors
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const f of existing?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  if (existing?.totp.some((f) => f.status === "verified")) return { error: "An authenticator is already set up. Remove it first to replace it." };
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`, issuer: "Atls" });
  if (error || !data) {
    log("warn", "mfa_enroll_failed", { reason: error?.code ?? "unknown" });
    return { error: "Two-factor authentication could not be started. Check that it is enabled for this project." };
  }
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Step 2: prove the app is set up by entering one code. The session is upgraded to aal2. */
export async function confirmTotpEnrollment(_: FormState, form: FormData): Promise<FormState> {
  const parsedCode = code.safeParse(form.get("code"));
  const parsedId = factorId.safeParse(form.get("factorId"));
  if (!parsedId.success) return { error: "Start again." };
  if (!parsedCode.success) return { error: parsedCode.error.issues[0]?.message };
  const { user, supabase } = await getSessionUser();
  if (!user) return { error: "Sign in again first." };
  const limit = await limited(user.id, "verify");
  if (limit) return { error: limit };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsedId.data, code: parsedCode.data });
  if (error) return { error: "That code is not right. Check the time on your phone and try the current code." };
  log("info", "mfa_enabled", {});
  revalidatePath("/settings");
  return { message: "Two-factor authentication is on. You will be asked for a code each time you sign in." };
}

/** Turn 2FA off. Supabase only allows this from a session that has passed the second step. */
export async function removeTotpFactor(id: string): Promise<string | null> {
  const parsed = factorId.safeParse(id);
  if (!parsed.success) return "Unknown authenticator.";
  const { user, supabase, mfaPending } = await getSessionUser();
  if (!user || mfaPending) return "Sign in again first.";
  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsed.data });
  if (error) return "It could not be removed. Sign out, sign in again with a code, and retry.";
  log("info", "mfa_disabled", {});
  revalidatePath("/settings");
  return null;
}
