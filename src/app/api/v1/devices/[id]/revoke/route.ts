import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, fromDbError, readJson, route, uuid } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";

const body = z.object({ org_id: uuid }).strict();

/** POST /api/v1/devices/{id}/revoke (owner/admin): the device's tokens stop working immediately; its receipts stay. */
export const POST = route<{ id: string }>("devices.revoke", async (request, { params }) => {
  if (!uuid.safeParse(params.id).success) throw new ApiError(404, "not_found", "Device not found.");
  const input = await readJson(request, body, 1024);
  const { supabase, user } = await requireOrgAccess(request, input.org_id, "devices.revoke", { mutating: true });
  await rateLimit("userWrite", "user:" + user.id);
  const { data: device } = await supabase.from("devices").select("id").eq("id", params.id).eq("org_id", input.org_id).maybeSingle();
  if (!device) throw new ApiError(404, "not_found", "Device not found.");
  const { error } = await supabase.rpc("revoke_device", { p_device: params.id });
  if (error) throw fromDbError(error);
  return NextResponse.json({ id: params.id, status: "revoked" });
});
