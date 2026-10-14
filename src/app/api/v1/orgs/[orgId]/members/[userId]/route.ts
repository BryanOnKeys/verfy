import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, fromDbError, readJson, route, uuid } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";

type P = { orgId: string; userId: string };

function check(params: P) {
  if (!uuid.safeParse(params.orgId).success || !uuid.safeParse(params.userId).success) throw new ApiError(404, "not_found", "Member not found.");
}

const patchBody = z.object({ role: z.enum(["owner", "admin", "member", "auditor"]) }).strict();

/** PATCH /api/v1/orgs/{orgId}/members/{userId} (owner/admin; only owners change owners; the last owner stays) */
export const PATCH = route<P>("members.role", async (request, { params }) => {
  check(params);
  const input = await readJson(request, patchBody, 512);
  const { supabase, user } = await requireOrgAccess(request, params.orgId, "members.manage", { mutating: true });
  await rateLimit("userWrite", "user:" + user.id);
  const { error } = await supabase.rpc("set_member_role", { p_org: params.orgId, p_user: params.userId, p_role: input.role });
  if (error) throw fromDbError(error);
  return NextResponse.json({ user_id: params.userId, role: input.role });
});

/** DELETE /api/v1/orgs/{orgId}/members/{userId}: remove a member, or leave (your own id). */
export const DELETE = route<P>("members.remove", async (request, { params }) => {
  check(params);
  const { supabase, user } = await requireOrgAccess(request, params.orgId, undefined, { mutating: true });
  await rateLimit("userWrite", "user:" + user.id);
  const { error } = await supabase.rpc("remove_member", { p_org: params.orgId, p_user: params.userId });
  if (error) throw fromDbError(error);
  return new NextResponse(null, { status: 204 });
});
