import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliver, type Kind } from "@/core/notify";
import { ApiError, fromDbError, route, uuid } from "@/server/http";
import { texts } from "@/server/notify";
import { rateLimit } from "@/server/ratelimit";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";

/** POST /api/v1/orgs/{orgId}/notifications/{id}/test (owner/admin): send a test message now and report the result. */
export const POST = route<{ orgId: string; id: string }>("notifications.test", async (request, { params }) => {
  if (!uuid.safeParse(params.orgId).success || !uuid.safeParse(params.id).success) throw new ApiError(404, "not_found", "Channel not found.");
  const { user } = await requireOrgAccess(request, params.orgId, "notifications.manage", { mutating: true });
  await rateLimit("userWrite", "user:" + user.id);
  const db = createAdminClient();
  const { data: channel, error } = await db.from("notification_channels").select("id, kind, target").eq("id", params.id).eq("org_id", params.orgId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!channel) throw new ApiError(404, "not_found", "Channel not found.");
  try {
    await deliver(channel.kind as Kind, channel.target as string, texts().test());
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : "failed";
    await db.from("notification_channels").update({ last_error: message }).eq("id", channel.id);
    throw new ApiError(502, "delivery_failed", "The test message was not delivered.", message);
  }
  await db.from("notification_channels").update({ last_sent_at: new Date().toISOString(), last_error: null }).eq("id", channel.id);
  return NextResponse.json({ sent: true });
});
