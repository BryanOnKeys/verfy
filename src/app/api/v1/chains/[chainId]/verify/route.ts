import { NextResponse } from "next/server";
import { verifyStoredChain } from "@/server/data";
import { ApiError, route, uuid } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/v1/chains/{chainId}/verify?org=… : re-verify every signature and link of a device chain on the server. */
export const GET = route<{ chainId: string }>("chains.verify", async (request, { params }) => {
  const org = uuid.safeParse(request.nextUrl.searchParams.get("org"));
  if (!org.success || !/^atl_[0-9a-f]{16}$/.test(params.chainId)) throw new ApiError(404, "not_found", "Chain not found.");
  const { user, supabase } = await requireOrgAccess(request, org.data, "chains.verify");
  await rateLimit("simulate", "verify:" + user.id);
  const report = await verifyStoredChain(supabase, org.data, params.chainId);
  if (!report) throw new ApiError(404, "not_found", "Chain not found.");
  return NextResponse.json({ ...report, errors: report.errors.slice(0, 100), verified_at: new Date().toISOString() });
});
