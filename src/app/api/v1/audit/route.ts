import { NextResponse } from "next/server";
import { z } from "zod";
import { fromDbError, readQuery, route, uuid } from "@/server/http";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";

const query = z.object({ org: uuid, before: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) });

/** GET /api/v1/audit?org=…&before=<id>&limit= (owner/admin/auditor): the hash-chained audit log, newest first. */
export const GET = route("audit.list", async (request) => {
  const q = readQuery(request, query) as z.infer<typeof query>;
  const { supabase } = await requireOrgAccess(request, q.org, "audit.read");
  let sel = supabase
    .from("audit_log")
    .select("id, action, target, details, at, actor_user, actor_device, prev_hash, hash")
    .eq("org_id", q.org)
    .order("id", { ascending: false })
    .limit(q.limit);
  if (q.before) sel = sel.lt("id", q.before);
  const { data, error } = await sel;
  if (error) throw fromDbError(error);
  return NextResponse.json({ entries: data ?? [] });
});
