import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { SHIELD, clientIp } from "@/lib/shield";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "./env";
import { ApiError, ipHash } from "./http";
import { rateLimit } from "./ratelimit";

/**
 * Device tokens: `atd_` + 43 base64url characters (32 random bytes). Only the
 * SHA-256 of a token is stored. A token stops working when its device is
 * revoked, the token is revoked, or it expires (365 days).
 */
const TOKEN = /^atd_[A-Za-z0-9_-]{43}$/;

export interface DeviceIdentity {
  deviceId: string;
  orgId: string;
  kid: string;
  publicKey: string;
}

export function newDeviceToken(): { token: string; hash: string } {
  const token = "atd_" + randomBytes(32).toString("base64url");
  return { token, hash: sha256Hex(token) };
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

export function isDeviceToken(token: string | null): token is string {
  return token !== null && TOKEN.test(token);
}

/**
 * Guessing tokens is pointless (256 random bits), but failed attempts are still counted per IP, in memory and in
 * Postgres, so a client that keeps presenting bad tokens is cut off instead of costing a database lookup each time.
 */
async function failed(request: NextRequest, message: string): Promise<never> {
  const v = SHIELD.badTokens.hit(clientIp(request.headers));
  if (!v.ok) throw new ApiError(429, "rate_limited", "Too many failed authentications. Try again later.", undefined, { retry_after_seconds: v.retryAfter });
  await rateLimit("deviceAuthFail", "ip:" + ipHash(request, serverEnv().ATLS_IP_HASH_SALT));
  throw new ApiError(401, "unauthenticated", message);
}

export async function authenticateDevice(request: NextRequest): Promise<DeviceIdentity> {
  if (SHIELD.badTokens.blocked(clientIp(request.headers))) {
    throw new ApiError(429, "rate_limited", "Too many failed authentications. Try again later.", undefined, { retry_after_seconds: 600 });
  }
  const token = bearerToken(request);
  if (!isDeviceToken(token)) return failed(request, "A valid device token is required.");
  const { data, error } = await createAdminClient().rpc("device_for_token", { p_token_hash: sha256Hex(token) });
  if (error) throw new ApiError(503, "unavailable", "Please try again in a moment.");
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return failed(request, "This device token is not valid (revoked, expired or unknown).");
  return { deviceId: row.device_id, orgId: row.org_id, kid: row.kid, publicKey: row.public_key };
}
