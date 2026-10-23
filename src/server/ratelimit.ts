import "server-only";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError, ipHash } from "./http";
import { serverEnv } from "./env";
import { log } from "./log";

/**
 * Rate limits stored in Postgres (public.rate_limit_hit), so they hold across
 * every serverless instance. If the limiter itself fails, the request is
 * refused (503): a broken limiter must not turn into "no limit".
 */
export const LIMITS = {
  enroll: { windowSeconds: 3600, max: 20 },
  ingest: { windowSeconds: 60, max: 120 },
  proposeLock: { windowSeconds: 3600, max: 200 },
  deviceRead: { windowSeconds: 60, max: 120 },
  publicRead: { windowSeconds: 60, max: 60 },
  auth: { windowSeconds: 900, max: 10 },
  // per account, whatever the address: stops credential stuffing spread over many IPs
  authAccount: { windowSeconds: 3600, max: 20 },
  // per address that receives mail (magic link, reset, sign-up): stops email bombing
  emailSend: { windowSeconds: 3600, max: 5 },
  // failed device-token authentications per IP
  deviceAuthFail: { windowSeconds: 600, max: 30 },
  userWrite: { windowSeconds: 60, max: 60 },
  export: { windowSeconds: 3600, max: 10 },
  simulate: { windowSeconds: 60, max: 30 },
  waitlist: { windowSeconds: 3600, max: 5 },
} as const;

export type LimitName = keyof typeof LIMITS;

export async function rateLimit(name: LimitName, key: string): Promise<void> {
  const { windowSeconds, max } = LIMITS[name];
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
    p_bucket: `${name}:${key}`.slice(0, 200),
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) {
    log("error", "rate_limit_unavailable", { limit: name, code: error.code });
    throw new ApiError(503, "rate_limit_unavailable", "Please try again in a moment.");
  }
  if (data !== true) {
    log("warn", "rate_limited", { limit: name });
    throw new ApiError(429, "rate_limited", "Too many requests. Slow down and try again later.", undefined, { retry_after_seconds: windowSeconds });
  }
}

export async function rateLimitIp(name: LimitName, request: NextRequest): Promise<void> {
  await rateLimit(name, "ip:" + ipHash(request, serverEnv().ATLS_IP_HASH_SALT));
}
