import { NextResponse } from "next/server";
import { z } from "zod";
import { fromDbError, readJson, route, uuid } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";

const body = z.object({ org_id: uuid }).strict();

/** POST /api/v1/devices/enrollments: a one-time code (valid 1 hour) for `verfy team enroll` (owner/admin). Shown once. */
export const POST = route("devices.enrollments.create", async (request) => {
  const input = await readJson(request, body, 1024);
  const { supabase, user } = await requireOrgAccess(request, input.org_id, "devices.enroll", { mutating: true });
  await rateLimit("userWrite", "user:" + user.id);
  const { data, error } = await supabase.rpc("create_device_enrollment", { p_org: input.org_id });
  if (error) throw fromDbError(error);
  return NextResponse.json({ code: data as string, expires_in_seconds: 3600 }, { status: 201 });
});
