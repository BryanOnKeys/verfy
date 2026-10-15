import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * "Continue with Google" without sending people through the Supabase domain.
 *
 * Google's sign-in page names the site it returns to. With the usual Supabase OAuth flow that is
 * <project>.supabase.co, which Verfy cannot prove it owns, so Google can never show "Verfy" there. Here Google
 * returns straight to this app (OpenID Connect, response_type=id_token, response_mode=form_post) and the ID token is
 * handed to Supabase with signInWithIdToken, which checks its signature, audience and nonce.
 *
 * The state and the raw nonce live in a short-lived HttpOnly cookie. It is SameSite=None because Google posts the
 * token back cross-site; the state comparison is what ties that post to the browser that started the sign-in.
 */
export const GOOGLE_COOKIE = "__Host-verfy_google";
export const GOOGLE_COOKIE_SECONDS = 600;

export interface GoogleAttempt {
  state: string;
  nonce: string;
  next: string;
}

const token = () => randomBytes(32).toString("base64url");
export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export function newAttempt(next: string): GoogleAttempt {
  return { state: token(), nonce: token(), next };
}

export function encodeAttempt(a: GoogleAttempt): string {
  return Buffer.from(JSON.stringify(a)).toString("base64url");
}

export function decodeAttempt(raw: string | undefined): GoogleAttempt | null {
  if (!raw || raw.length > 1024) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<GoogleAttempt>;
    if (typeof v.state !== "string" || typeof v.nonce !== "string" || typeof v.next !== "string") return null;
    return { state: v.state, nonce: v.nonce, next: v.next };
  } catch {
    return null;
  }
}

export function sameState(expected: string, got: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Google's sign-in page, always with the account chooser. Google receives only the hash of the nonce. */
export function googleAuthUrl(clientId: string, appUrl: string, a: GoogleAttempt): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/auth/google`,
    response_type: "id_token",
    response_mode: "form_post",
    scope: "openid email profile",
    nonce: sha256Hex(a.nonce),
    state: a.state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
