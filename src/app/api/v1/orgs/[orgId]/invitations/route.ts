import { NextResponse } from "next/server";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { ApiError, fromDbError, readJson, route, uuid } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";

const body = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(["admin", "member", "auditor"]),
  })
  .strict();

/**
 * POST /api/v1/orgs/{orgId}/invitations (owner/admin): returns a one-time
 * invite link (valid 7 days) for that email address. Atls does not send
 * email; copy the link to the person. Only the hash of the token is stored.
 */
export const POST = route<{ orgId: string }>("invitations.create", async (request, { params }) => {
  if (!uuid.safeParse(params.orgId).success) throw new ApiError(404, "not_found", "Organization not found.");
  const input = await readJson(request, body, 1024);
  const { supabase, user } = await requireOrgAccess(request, params.orgId, "members.invite", { mutating: true });
  await rateLimit("userWrite", "user:" + user.id);
  const { data, error } = await supabase.rpc("create_invitation", { p_org: params.orgId, p_email: input.email, p_role: input.role });
  if (error) throw fromDbError(error);
  const link = `${publicEnv().NEXT_PUBLIC_APP_URL}/invite/${data as string}`;
  return NextResponse.json({ link, email: input.email, role: input.role, expires_in_days: 7 }, { status: 201 });
});
