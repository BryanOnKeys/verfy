import { NextResponse } from "next/server";
import { getReceipt } from "@/server/data";
import { ApiError, route, uuid } from "@/server/http";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";

/** GET /api/v1/receipts/{id}?org=… : one receipt with its signed body and a fresh signature check. */
export const GET = route<{ id: string }>("receipts.get", async (request, { params }) => {
  const org = uuid.safeParse(request.nextUrl.searchParams.get("org"));
  if (!org.success || !uuid.safeParse(params.id).success) throw new ApiError(404, "not_found", "Receipt not found.");
  const { supabase } = await requireOrgAccess(request, org.data, "receipts.read");
  const receipt = await getReceipt(supabase, org.data, params.id);
  if (!receipt) throw new ApiError(404, "not_found", "Receipt not found.");
  return NextResponse.json({
    id: receipt.id,
    seq: receipt.seq,
    hash: receipt.hash,
    signature: receipt.signature,
    received_at: receipt.received_at,
    chain_id: (receipt.chains as { chain_id: string } | null)?.chain_id ?? null,
    body: receipt.body,
  });
});
