import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateDevice } from "@/server/device-auth";
import { ApiError, fromDbError, route, uuid } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

/** GET /api/v1/approvals/{id}: the device that asked polls for the decision. */
export const GET = route<{ id: string }>("approvals.poll", async (request, { params }) => {
  const device = await authenticateDevice(request);
  await rateLimit("deviceRead", "device:" + device.deviceId);
  if (!uuid.safeParse(params.id).success) throw new ApiError(404, "not_found", "Request not found.");
  const { data, error } = await createAdminClient().rpc("approval_for_device", { p_device: device.deviceId, p_id: params.id });
  if (error) throw fromDbError(error);
  return NextResponse.json(data);
});
