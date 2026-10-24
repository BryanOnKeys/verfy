import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError, fromDbError, route } from "@/server/http";
import { notify, texts } from "@/server/notify";
import { rateLimit } from "@/server/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const HOURS = 24;

/**
 * GET /api/cron/silent-devices: daily (vercel.json). Tells each organization with a device.silent
 * channel which active devices have not uploaded receipts for 24 hours, once per silence.
 *
 * With CRON_SECRET set (Vercel sends it as a bearer token), only Vercel Cron can run it. Without
 * it, anyone calling it can only cause the alerts that are due anyway, at most once per silence.
 */
export const GET = route("cron.silent_devices", async (request) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const got = Buffer.from(request.headers.get("authorization") ?? "");
    const want = Buffer.from(`Bearer ${secret}`);
    if (got.length !== want.length || !timingSafeEqual(got, want)) throw new ApiError(401, "unauthenticated", "Not allowed.");
  }
  await rateLimit("publicRead", "cron:silent-devices");
  const db = createAdminClient();
  const { data: devices, error } = await db.rpc("silent_devices", { p_hours: HOURS });
  if (error) throw fromDbError(error);
  const rows = (devices ?? []) as { id: string; org_id: string; name: string; last_seen_at: string }[];
  const orgs = [...new Set(rows.map((d) => d.org_id))];
  if (!orgs.length) return NextResponse.json({ silent: 0, notified: 0 });

  // only devices of organizations that asked for this event are marked, so a channel added later still hears about them
  const { data: channels, error: chError } = await db.from("notification_channels").select("org_id").in("org_id", orgs).contains("events", ["device.silent"]);
  if (chError) throw fromDbError(chError);
  const listening = new Set((channels ?? []).map((c) => c.org_id as string));
  const due = rows.filter((d) => listening.has(d.org_id));
  for (const org of listening) {
    await notify(org, "device.silent", texts().silent(due.filter((d) => d.org_id === org)));
  }
  if (due.length) {
    const { error: markError } = await db.rpc("mark_silence_alerted", { p_ids: due.map((d) => d.id) });
    if (markError) throw fromDbError(markError);
  }
  return NextResponse.json({ silent: rows.length, notified: due.length });
});
