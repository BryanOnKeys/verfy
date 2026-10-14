import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildEvidence, EXPORT_MAX_RECEIPTS } from "@/core/evidence";
import type { Receipt } from "@/core/receipts";
import { ApiError, fromDbError, readJson, readQuery, route, uuid } from "@/server/http";
import { log } from "@/server/log";
import { rateLimit } from "@/server/ratelimit";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const createBody = z
  .object({
    org_id: uuid,
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    verdict: z.enum(["allow", "ask", "deny"]).optional(),
  })
  .strict();

/**
 * POST /api/v1/exports (owner/admin/auditor): build an evidence package.
 * The request is authorized and audited by `start_export` (as the user).
 * Exports up to 20,000 receipts are built right away; the files go to the
 * private `exports` bucket and are downloaded through short-lived signed URLs.
 */
export const POST = route("exports.create", async (request) => {
  const input = await readJson(request, createBody, 2048);
  const { supabase, user } = await requireOrgAccess(request, input.org_id, "exports.create", { mutating: true });
  await rateLimit("export", "user:" + user.id);
  const filters = input.verdict ? { verdict: input.verdict } : {};
  const { data: exportId, error } = await supabase.rpc("start_export", { p_org: input.org_id, p_from: input.from, p_to: input.to, p_filters: filters });
  if (error) throw fromDbError(error);

  const admin = createAdminClient();
  const fail = async (message: string) => {
    await admin.rpc("complete_export", { p_export: exportId, p_count: 0, p_manifest: null, p_manifest_sha: null, p_path: null, p_error: message });
  };
  try {
    let q = admin
      .from("receipts")
      .select("seq, body, chains!inner(chain_id)", { count: "exact" })
      .eq("org_id", input.org_id)
      .gte("issued_at", input.from)
      .lt("issued_at", input.to)
      .order("issued_at", { ascending: true });
    if (input.verdict) q = q.eq("verdict", input.verdict);
    const rows: { chain_id: string; seq: number; body: Receipt }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error: e, count } = await q.range(from, from + 999);
      if (e) throw e;
      if ((count ?? 0) > EXPORT_MAX_RECEIPTS) {
        await fail(`more than ${EXPORT_MAX_RECEIPTS} receipts in this range; choose a shorter range`);
        throw new ApiError(422, "export_too_large", `This range has more than ${EXPORT_MAX_RECEIPTS} receipts. Choose a shorter range.`);
      }
      for (const r of data ?? []) rows.push({ chain_id: (r.chains as unknown as { chain_id: string }).chain_id, seq: r.seq as number, body: r.body as Receipt });
      if (!data || data.length < 1000) break;
    }
    const { data: chains, error: ce } = await admin.from("chains").select("chain_id, devices(name, public_key)").eq("org_id", input.org_id);
    if (ce) throw ce;
    const evidence = buildEvidence({
      exportId: exportId as string,
      orgId: input.org_id,
      from: input.from,
      to: input.to,
      filters,
      generatedAt: new Date().toISOString(),
      chains: (chains ?? []).map((c) => {
        const d = c.devices as unknown as { name: string; public_key: string };
        return { chain_id: c.chain_id as string, device_name: d.name, public_key: d.public_key };
      }),
      receipts: rows,
    });
    const prefix = `${input.org_id}/${exportId}`;
    const bucket = admin.storage.from("exports");
    const up1 = await bucket.upload(`${prefix}/receipts.jsonl`, evidence.jsonl, { contentType: "application/x-ndjson", upsert: false });
    const up2 = await bucket.upload(`${prefix}/manifest.json`, JSON.stringify(evidence.manifest, null, 2), { contentType: "application/json", upsert: false });
    if (up1.error || up2.error) throw new Error("storage upload failed");
    const { error: done } = await admin.rpc("complete_export", {
      p_export: exportId,
      p_count: rows.length,
      p_manifest: evidence.manifest,
      p_manifest_sha: evidence.manifestSha256,
      p_path: prefix,
      p_error: null,
    });
    if (done) throw done;
    return NextResponse.json({ id: exportId, status: "ready", receipt_count: rows.length, manifest_sha256: evidence.manifestSha256 }, { status: 201 });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    log("error", "export_failed", { export: exportId });
    await fail("the export could not be built");
    throw new ApiError(500, "export_failed", "The export could not be built. Try again or choose a shorter range.");
  }
});

const listQuery = z.object({ org: uuid });

/** GET /api/v1/exports?org=… (owner/admin/auditor) */
export const GET = route("exports.list", async (request) => {
  const q = readQuery(request, listQuery) as z.infer<typeof listQuery>;
  const { supabase } = await requireOrgAccess(request, q.org, "exports.read");
  const { data, error } = await supabase
    .from("exports")
    .select("id, status, from_ts, to_ts, filters, receipt_count, manifest_sha256, error, created_at, completed_at")
    .eq("org_id", q.org)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw fromDbError(error);
  return NextResponse.json({ exports: data ?? [] });
});
