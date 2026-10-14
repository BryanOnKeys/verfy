import { NextResponse } from "next/server";
import { ApiError, fromDbError, route, uuid } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";

/** DELETE /api/v1/orgs/{orgId}/invitations/{id} (owner/admin): the invite link stops working. */
export const DELETE = route<{ orgId: string; id: string }>("invitations.revoke", async (request, { params }) => {
  if (!uuid.safeParse(params.orgId).success || !uuid.safeParse(params.id).success) throw new ApiError(404, "not_found", "Invitation not found.");
  const { supabase, user } = await requireOrgAccess(request, params.orgId, "members.invite", { mutating: true });
  await rateLimit("userWrite", "user:" + user.id);
  const { data: inv } = await supabase.from("invitations").select("id").eq("id", params.id).eq("org_id", params.orgId).maybeSingle();
  if (!inv) throw new ApiError(404, "not_found", "Invitation not found.");
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation: params.id });
  if (error) throw fromDbError(error);
  return new NextResponse(null, { status: 204 });
});
