import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, fromDbError, readJson, uuid } from "./http";
import { rateLimit } from "./ratelimit";
import { requireOrgAccess } from "./session";

const body = z.object({ org_id: uuid, note: z.string().max(200).optional() }).strict();

/** Approve or reject one waiting call (owner/admin). The database checks the deadline and writes the audit entry. */
export async function decideApproval(request: NextRequest, approvalId: string, approve: boolean) {
  if (!uuid.safeParse(approvalId).success) throw new ApiError(404, "not_found", "Request not found.");
  const input = await readJson(request, body, 2048);
  const { supabase, user } = await requireOrgAccess(request, input.org_id, "approvals.decide", { mutating: true });
  await rateLimit("userWrite", "user:" + user.id);
  const { data: row, error: readError } = await supabase.from("approvals").select("id").eq("id", approvalId).eq("org_id", input.org_id).maybeSingle();
  if (readError) throw fromDbError(readError);
  if (!row) throw new ApiError(404, "not_found", "Request not found.");
  const { data, error } = await supabase.rpc("decide_approval", { p_id: approvalId, p_approve: approve, p_note: input.note ?? null });
  if (error) throw fromDbError(error);
  return NextResponse.json({ id: approvalId, status: data });
}
