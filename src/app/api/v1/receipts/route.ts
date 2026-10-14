import { NextResponse } from "next/server";
import { listReceipts, receiptFilters } from "@/server/data";
import { readQuery, route, uuid } from "@/server/http";
import { requireOrgAccess } from "@/server/session";
import { z } from "zod";

export const runtime = "nodejs";

const query = receiptFilters.extend({ org: uuid });

/** GET /api/v1/receipts?org=…&verdict=&tool=&server=&device=&from=&to=&page=&page_size= (any member role) */
export const GET = route("receipts.list", async (request) => {
  const q = readQuery(request, query) as z.infer<typeof query>;
  const { supabase } = await requireOrgAccess(request, q.org, "receipts.read");
  return NextResponse.json(await listReceipts(supabase, q.org, q));
});
