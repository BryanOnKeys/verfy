import { NextResponse } from "next/server";
import { listLocks, lockStatus } from "@/server/data";
import { ApiError, route } from "@/server/http";
import { resolveReader } from "@/server/reader";

export const runtime = "nodejs";

/** GET /api/v1/locks?status=approved: team locks (device token or member session with ?org=). */
export const GET = route("locks.list", async (request) => {
  const { db, orgId } = await resolveReader(request, "locks.read");
  const status = request.nextUrl.searchParams.get("status");
  const parsed = status ? lockStatus.safeParse(status) : null;
  if (parsed && !parsed.success) throw new ApiError(422, "invalid_request", "status must be pending, approved or rejected.");
  const locks = await listLocks(db, orgId, parsed?.data);
  return NextResponse.json({ locks: locks.map(({ devices: _d, ...l }) => l) });
});
