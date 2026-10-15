import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { keyId, publicKeyFromB64u } from "@/core/receipts";
import { newDeviceToken, sha256Hex } from "@/server/device-auth";
import { ApiError, fromDbError, readJson, route } from "@/server/http";
import { rateLimitIp } from "@/server/ratelimit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const body = z
  .object({
    code: z.string().regex(/^atle_[0-9a-f]{64}$/, "is not a Verfy enrollment code"),
    public_key: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "must be a base64url Ed25519 public key"),
    kid: z.string().regex(/^atl_[0-9a-f]{16}$/),
    name: z.string().trim().min(1).max(80),
    platform: z.string().max(80).default(""),
  })
  .strict();

/**
 * POST /api/v1/devices/enroll: a CLI redeems a one-time enrollment code.
 * The device sends only its PUBLIC key; the private key never leaves it.
 * Returns a device token, shown once and stored here only as a SHA-256 hash.
 */
export const POST = route("devices.enroll", async (request) => {
  await rateLimitIp("enroll", request);
  const input = await readJson(request, body, 4096);
  let pub;
  try {
    pub = publicKeyFromB64u(input.public_key);
  } catch {
    throw new ApiError(422, "invalid_request", "public_key is not a valid Ed25519 key.");
  }
  if (keyId(pub.raw) !== input.kid) throw new ApiError(422, "invalid_request", "kid does not match public_key.");
  const { token, hash } = newDeviceToken();
  const { data, error } = await createAdminClient().rpc("enroll_device", {
    p_code_hash: sha256Hex(input.code),
    p_name: input.name,
    p_platform: input.platform,
    p_kid: input.kid,
    p_public_key: input.public_key,
    p_token_hash: hash,
  });
  if (error) {
    if (error.message === "invalid_enrollment_code") throw new ApiError(400, "invalid_enrollment_code", "This enrollment code is not valid (wrong, used or expired).");
    if (error.message === "device_key_exists") throw new ApiError(409, "device_key_exists", "This signing key is already enrolled in the organization.");
    throw fromDbError(error);
  }
  const res = data as { device_id: string; org_id: string; org_name: string };
  return NextResponse.json({ device_id: res.device_id, org_id: res.org_id, org_name: res.org_name, token }, { status: 201 });
});
