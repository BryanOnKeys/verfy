import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { advisoryQuery, listAdvisories } from "@/server/advisories";
import { readQuery, route } from "@/server/http";
import { rateLimitIp } from "@/server/ratelimit";

export const runtime = "nodejs";

/**
 * GET /api/v1/advisories?q=&severity=&ecosystem= : the public Atls Advisories
 * feed (OSV-based). Rate limited per IP. Entries with review_status
 * "unreviewed" come from public sources and were not reproduced by Atls.
 */
export const GET = route("advisories.list", async (request) => {
  await rateLimitIp("publicRead", request);
  const q = readQuery(request, advisoryQuery) as z.infer<typeof advisoryQuery>;
  const supabase = await createClient();
  const rows = await listAdvisories(supabase, q);
  return NextResponse.json(
    { format: "atls.advisories/1", count: rows.length, advisories: rows },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
});
