"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { ApiError, ipHash } from "@/server/http";
import { serverEnv } from "@/server/env";
import { log } from "@/server/log";
import { secondFactorDue } from "@/server/mfa";
import { rateLimit } from "@/server/ratelimit";

/**
 * Server Actions for sign-in and sign-up. Next.js checks the Origin of every
 * Server Action request (CSRF). Passwords go straight from this server to
 * Supabase Auth; they are never logged or stored by Atls.
 *
 * Layers against brute force and abuse, in order:
 *  1. the shield in src/proxy.ts (per-IP flood limit before any work),
 *  2. a per-IP limit for each kind of action (Postgres, all instances),
 *  3. a per-account limit, so attempts spread over many IPs still stop,
 *  4. a per-recipient limit on anything that sends email,
 *  5. an optional CAPTCHA (Cloudflare Turnstile), verified by Supabase Auth,
 *  6. Supabase Auth's own rate limits.
 */

export interface FormState {
  error?: string;
  message?: string;
  fields?: Record<string, string>;
}

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
const password = z.string().min(12, "Use at least 12 characters.").max(128, "Use at most 128 characters.");

const accountKey = (address: string) => createHash("sha256").update(serverEnv().ATLS_IP_HASH_SALT + "|acct|" + address).digest("hex").slice(0, 32);

/** Per-IP limit, then (if an address is given) the per-account or per-recipient limit. */
async function limit(kind: string, address?: string, perAddress: "authAccount" | "emailSend" = "authAccount"): Promise<string | null> {
  try {
    await rateLimit("auth", `${kind}:${ipHash(await headers(), serverEnv().ATLS_IP_HASH_SALT)}`);
    if (address) await rateLimit(perAddress, `${kind}:${accountKey(address)}`);
    return null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) return "Too many attempts. Wait a while and try again.";
    return "Sign-in is temporarily unavailable. Try again in a moment.";
  }
}

/**
 * When a Turnstile site key is configured, every auth form carries a CAPTCHA token. Supabase Auth verifies it
 * (with the secret key entered in the Supabase dashboard); here we only refuse forms that arrive without one.
 */
function captcha(form: FormData): { token?: string; error?: string } {
  if (!publicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY) return {};
  const token = String(form.get("cf-turnstile-response") ?? "");
  if (!/^[\w.:-]{10,4096}$/.test(token)) return { error: "Complete the security check and try again." };
  return { token };
}

const GENERIC_SIGNIN = "That email and password do not match an account.";

export async function signInWithPassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password.").max(128) }).safeParse({ email: form.get("email"), password: form.get("password") });
  const next = safeNext(String(form.get("next") ?? ""));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, fields: { email: String(form.get("email") ?? "") } };
  const cap = captcha(form);
  if (cap.error) return { error: cap.error, fields: { email: parsed.data.email } };
  const limited = await limit("signin", parsed.data.email);
  if (limited) return { error: limited, fields: { email: parsed.data.email } };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ ...parsed.data, options: cap.token ? { captchaToken: cap.token } : undefined });
  if (error) {
    log("warn", "auth_signin_failed", { reason: error.code ?? "unknown" });
    const unconfirmed = error.code === "email_not_confirmed";
    return { error: unconfirmed ? "Confirm your email first: open the link we sent you." : GENERIC_SIGNIN, fields: { email: parsed.data.email } };
  }
  // with two-factor authentication on, the password alone only reaches the code prompt
  if (await secondFactorDue(supabase)) redirect(`/auth/mfa?next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function signInWithMagicLink(_: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(form.get("email"));
  const next = safeNext(String(form.get("next") ?? ""));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const cap = captcha(form);
  if (cap.error) return { error: cap.error, fields: { email: parsed.data } };
  const limited = await limit("magic", parsed.data, "emailSend");
  if (limited) return { error: limited, fields: { email: parsed.data } };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
      ...(cap.token ? { captchaToken: cap.token } : {}),
    },
  });
  if (error) log("warn", "auth_magic_failed", { reason: error.code ?? "unknown" });
  // Same answer whether or not the account exists, so the form cannot be used to discover accounts.
  return { message: "If an account exists for that address, a sign-in link is on its way. It expires in one hour.", fields: { email: parsed.data } };
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({ email, password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "The passwords do not match.", path: ["confirm"] })
    .safeParse({ email: form.get("email"), password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, fields: { email: String(form.get("email") ?? "") } };
  const cap = captcha(form);
  if (cap.error) return { error: cap.error, fields: { email: parsed.data.email } };
  const limited = await limit("signup", parsed.data.email, "emailSend");
  if (limited) return { error: limited, fields: { email: parsed.data.email } };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`, ...(cap.token ? { captchaToken: cap.token } : {}) },
  });
  if (error) {
    log("warn", "auth_signup_failed", { reason: error.code ?? "unknown" });
    if (error.code === "weak_password") return { error: "Choose a stronger password (longer, not a common one).", fields: { email: parsed.data.email } };
    return { error: "We could not create the account. Check the address and try again.", fields: { email: parsed.data.email } };
  }
  if (data.session) redirect("/dashboard");
  return { message: "Check your inbox: open the confirmation link to finish creating your account." };
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const cap = captcha(form);
  if (cap.error) return { error: cap.error };
  const limited = await limit("reset", parsed.data, "emailSend");
  if (limited) return { error: limited };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/settings&reset=1`,
    ...(cap.token ? { captchaToken: cap.token } : {}),
  });
  if (error) log("warn", "auth_reset_failed", { reason: error.code ?? "unknown" });
  return { message: "If an account exists for that address, a reset link is on its way." };
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "The passwords do not match." })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.code === "same_password" ? "Choose a password you have not used before." : "The password could not be changed." };
  return { message: "Password updated." };
}

export async function signInWithGitHub(form: FormData): Promise<void> {
  if (publicEnv().NEXT_PUBLIC_AUTH_GITHUB_ENABLED !== "true") redirect("/auth/sign-in?error=github_disabled");
  const next = safeNext(String(form.get("next") ?? ""));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`, scopes: "read:user user:email" },
  });
  if (error || !data.url) redirect("/auth/sign-in?error=github_failed");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
