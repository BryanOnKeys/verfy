import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, fromDbError, readJson, uuid } from "./http";
import { rateLimit } from "./ratelimit";
import { requireOrgAccess } from "./session";

const body = z.object({ org_id: uuid, note: z.string().max(200).optional() }).strict();

/** Approve or reject a pending lock (owner/admin). The database writes the audit entry. */
export async function decideLock(request: NextRequest, lockId: string, approve: boolean) {
  if (!uuid.safeParse(lockId).success) throw new ApiError(404, "not_found", "Lock not found.");
  const input = await readJson(request, body, 2048);
  const { supabase, user } = await requireOrgAccess(request, input.org_id, "locks.decide", { mutating: true });
  await rateLimit("userWrite", "user:" + user.id);
  const { data: lock, error: readError } = await supabase.from("locks").select("id").eq("id", lockId).eq("org_id", input.org_id).maybeSingle();
  if (readError) throw fromDbError(readError);
  if (!lock) throw new ApiError(404, "not_found", "Lock not found.");
  const { data, error } = await supabase.rpc("decide_lock", { p_lock: lockId, p_approve: approve, p_note: input.note ?? null });
  if (error) throw fromDbError(error);
  return NextResponse.json({ id: lockId, status: data });
}
