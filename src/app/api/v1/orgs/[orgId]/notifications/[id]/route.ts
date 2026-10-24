import { NextResponse } from "next/server";
import { ApiError, fromDbError, route, uuid } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";

/** DELETE /api/v1/orgs/{orgId}/notifications/{id} (owner/admin). The database writes the audit entry. */
export const DELETE = route<{ orgId: string; id: string }>("notifications.remove", async (request, { params }) => {
  if (!uuid.safeParse(params.orgId).success || !uuid.safeParse(params.id).success) throw new ApiError(404, "not_found", "Channel not found.");
  const { supabase, user } = await requireOrgAccess(request, params.orgId, "notifications.manage", { mutating: true });
  await rateLimit("userWrite", "user:" + user.id);
  const { data: rows, error: listError } = await supabase.rpc("list_notification_channels", { p_org: params.orgId });
  if (listError) throw fromDbError(listError);
  if (!((rows ?? []) as { id: string }[]).some((r) => r.id === params.id)) throw new ApiError(404, "not_found", "Channel not found.");
  const { error } = await supabase.rpc("remove_notification_channel", { p_id: params.id });
  if (error) throw fromDbError(error);
  return new NextResponse(null, { status: 204 });
});
