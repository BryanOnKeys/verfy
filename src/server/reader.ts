import "server-only";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Permission } from "@/core/permissions";
import { authenticateDevice, bearerToken } from "./device-auth";
import { ApiError, uuid } from "./http";
import { rateLimit } from "./ratelimit";
import { requireOrgAccess } from "./session";

/**
 * Read endpoints that both the CLI (device token) and people (session) use.
 * A device can only ever read its own organization; a person must be a member
 * of the `org` query parameter's organization (RLS applies as well).
 */
export async function resolveReader(request: NextRequest, permission: Permission): Promise<{ db: SupabaseClient; orgId: string; via: "device" | "session" }> {
  if (bearerToken(request)) {
    const device = await authenticateDevice(request);
    await rateLimit("deviceRead", "device:" + device.deviceId);
    return { db: createAdminClient(), orgId: device.orgId, via: "device" };
  }
  const org = uuid.safeParse(request.nextUrl.searchParams.get("org"));
  if (!org.success) throw new ApiError(422, "invalid_request", "Pass ?org=<organization id>.");
  const { supabase } = await requireOrgAccess(request, org.data, permission);
  return { db: supabase as unknown as SupabaseClient, orgId: org.data, via: "session" };
}
