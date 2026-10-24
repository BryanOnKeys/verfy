import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { deliver, messages, type Kind, type NotifyEvent } from "@/core/notify";
import { log } from "./log";

/**
 * Send one event to every channel of the organization that subscribed to it. Never throws: a
 * notification that fails is recorded on the channel (last_error) and must not fail the request
 * that caused it. Call it inside `after()` so the response does not wait for Slack or Telegram.
 */
export async function notify(orgId: string, event: NotifyEvent, text: string): Promise<void> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.from("notification_channels").select("id, kind, target").eq("org_id", orgId).contains("events", [event]);
    if (error) throw error;
    await Promise.all(
      (data ?? []).map(async (c) => {
        try {
          await deliver(c.kind as Kind, c.target as string, text);
          await db.from("notification_channels").update({ last_sent_at: new Date().toISOString(), last_error: null }).eq("id", c.id);
        } catch (e) {
          const message = e instanceof Error ? e.message.slice(0, 300) : "failed";
          await db.from("notification_channels").update({ last_error: message }).eq("id", c.id);
          log("warn", "notify_failed", { channel: c.id, event, message });
        }
      }),
    );
  } catch (e) {
    log("warn", "notify_error", { event, message: e instanceof Error ? e.message : "unknown" });
  }
}

export function texts() {
  return messages(publicEnv().NEXT_PUBLIC_APP_URL);
}

export async function deviceName(deviceId: string): Promise<string> {
  const { data } = await createAdminClient().from("devices").select("name").eq("id", deviceId).maybeSingle();
  return (data?.name as string | undefined) ?? "a device";
}
