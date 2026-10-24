import { NextResponse } from "next/server";
import { z } from "zod";
import { NOTIFY_EVENTS, SLACK_WEBHOOK, TELEGRAM_CHAT, TELEGRAM_TOKEN } from "@/core/notify";
import { ApiError, fromDbError, readJson, route, uuid } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";

const events = z.array(z.enum(NOTIFY_EVENTS)).min(1).max(4);
const label = z.string().trim().min(1).max(80);
const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("slack"), label, events, slack_url: z.string().trim().regex(SLACK_WEBHOOK, "Paste a Slack incoming webhook URL (https://hooks.slack.com/services/...).") }).strict(),
  z
    .object({
      kind: z.literal("telegram"),
      label,
      events,
      telegram_token: z.string().trim().regex(TELEGRAM_TOKEN, "Paste the bot token BotFather gave you (123456789:AA...)."),
      telegram_chat_id: z.string().trim().regex(TELEGRAM_CHAT, "The chat ID is a number, for a group often starting with -100."),
    })
    .strict(),
]);

/**
 * POST /api/v1/orgs/{orgId}/notifications (owner/admin): connect a Slack incoming webhook or a
 * Telegram bot. The secret is stored for the server only and is never returned.
 */
export const POST = route<{ orgId: string }>("notifications.add", async (request, { params }) => {
  if (!uuid.safeParse(params.orgId).success) throw new ApiError(404, "not_found", "Organization not found.");
  const input = await readJson(request, body, 2048);
  const { supabase, user } = await requireOrgAccess(request, params.orgId, "notifications.manage", { mutating: true });
  await rateLimit("userWrite", "user:" + user.id);
  const target = input.kind === "slack" ? input.slack_url : `${input.telegram_token}|${input.telegram_chat_id}`;
  const { data, error } = await supabase.rpc("add_notification_channel", {
    p_org: params.orgId,
    p_kind: input.kind,
    p_target: target,
    p_label: input.label,
    p_events: [...new Set(input.events)],
  });
  if (error) throw fromDbError(error);
  return NextResponse.json({ id: data as string }, { status: 201 });
});
