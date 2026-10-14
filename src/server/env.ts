import "server-only";
import { z } from "zod";
import { ConfigError, publicEnv } from "@/lib/env";

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20, "SUPABASE_SECRET_KEY is missing"),
  ATLS_IP_HASH_SALT: z.string().min(32, "ATLS_IP_HASH_SALT must be at least 32 characters"),
});

export type ServerEnv = z.infer<typeof serverSchema> & ReturnType<typeof publicEnv>;

let cached: ServerEnv | null = null;

/** Server-only configuration. Throws a ConfigError with a clear message when anything is missing. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    ATLS_IP_HASH_SALT: process.env.ATLS_IP_HASH_SALT,
  });
  if (!parsed.success) {
    throw new ConfigError(`Atls server is not configured: ${parsed.error.issues.map((i) => i.message).join("; ")}. See docs/DEPLOYMENT.md.`);
  }
  if (parsed.data.SUPABASE_SECRET_KEY.startsWith("sb_publishable_")) {
    throw new ConfigError("SUPABASE_SECRET_KEY holds a publishable key; use the secret key (sb_secret_...).");
  }
  cached = { ...publicEnv(), ...parsed.data };
  return cached;
}
