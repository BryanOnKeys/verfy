import { z } from "zod";

/**
 * Environment variables, validated once. Public values are inlined into the
 * browser bundle by Next.js, so nothing secret may use the NEXT_PUBLIC_ prefix.
 * Server-only values are read in src/server/env.ts, which imports "server-only".
 */

const url = z.string().url().refine((u) => /^https?:\/\//.test(u), "must be an http(s) URL");

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: url.transform((u) => u.replace(/\/+$/, "")),
  NEXT_PUBLIC_AUTH_GITHUB_ENABLED: z.enum(["true", "false"]).default("false"),
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: z.enum(["true", "false"]).default("false"),
  // optional: Cloudflare Turnstile site key; when set, sign-in, sign-up and reset forms require the check
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().regex(/^[\w-]{8,100}$/).optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function describe(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

let cachedPublic: PublicEnv | null = null;

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  // Listed one by one so Next.js can inline them at build time.
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_AUTH_GITHUB_ENABLED: process.env.NEXT_PUBLIC_AUTH_GITHUB_ENABLED || undefined,
    NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED || undefined,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined,
  });
  if (!parsed.success) {
    throw new ConfigError(`Verfy is not configured: ${describe(parsed.error)}. See .env.example and docs/DEPLOYMENT.md.`);
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}

/** True when the public Supabase settings are present (used to show a setup notice instead of crashing public pages). */
export function isConfigured(): boolean {
  try {
    publicEnv();
    return true;
  } catch {
    return false;
  }
}
