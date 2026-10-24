import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { batchSchema, BATCH_MAX, planIngest, RECEIPT_MAX_BYTES } from "@/core/ingest";
import { publicKeyFromB64u } from "@/core/receipts";
import { authenticateDevice } from "@/server/device-auth";
import { ApiError, fromDbError, readJson, route } from "@/server/http";
import { log } from "@/server/log";
import { deviceName, notify, texts } from "@/server/notify";
import { rateLimit } from "@/server/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/v1/receipts/batch: a device uploads up to 500 signed receipts.
 *
 * Checked here: device token, v1 schema, Ed25519 signature with the device's
 * enrolled key, contiguous seq, prev hash links, idempotency by hash, future
 * clock skew. Checked again in the database under a row lock: the chain head.
 */
export const POST = route("receipts.batch", async (request) => {
  const device = await authenticateDevice(request);
  await rateLimit("ingest", "device:" + device.deviceId);
  const { receipts } = await readJson(request, batchSchema, BATCH_MAX * RECEIPT_MAX_BYTES + 1024);
  const admin = createAdminClient();

  const { data: chain, error: chainError } = await admin
    .from("chains")
    .select("last_seq, last_hash, device_id")
    .eq("org_id", device.orgId)
    .eq("chain_id", device.kid)
    .maybeSingle();
  if (chainError) throw fromDbError(chainError);
  if (chain && chain.device_id !== device.deviceId) throw new ApiError(403, "forbidden", "This chain belongs to another device.");
  const state = { lastSeq: chain?.last_seq ?? -1, lastHash: chain?.last_hash ?? null };

  // hashes already stored for the seq range of this batch (for idempotent retries)
  const seqs = receipts.map((r) => (r && typeof r === "object" ? (r as { seq?: unknown }).seq : null)).filter((s): s is number => Number.isInteger(s));
  const existing = new Map<number, string>();
  if (seqs.length && state.lastSeq >= 0) {
    const lo = Math.min(...seqs);
    const hi = Math.min(Math.max(...seqs), state.lastSeq);
    if (lo <= hi) {
      const { data: rows, error } = await admin
        .from("receipts")
        .select("seq, hash, chains!inner(chain_id)")
        .eq("org_id", device.orgId)
        .eq("chains.chain_id", device.kid)
        .gte("seq", lo)
        .lte("seq", hi)
        .limit(BATCH_MAX);
      if (error) throw fromDbError(error);
      for (const r of rows ?? []) existing.set(r.seq as number, r.hash as string);
    }
  }

  const plan = planIngest(state, existing, receipts, publicKeyFromB64u(device.publicKey));
  if (!plan.ok) {
    log("warn", "ingest_rejected", { code: plan.code, index: plan.index, device: device.deviceId });
    throw new ApiError(plan.status, plan.code, "The receipts were not accepted.", plan.detail, { index: plan.index });
  }
  if (plan.rows.length === 0) {
    return NextResponse.json({ accepted: 0, duplicates: plan.duplicates, head_seq: state.lastSeq, head_hash: state.lastHash });
  }
  const { data, error } = await admin.rpc("ingest_receipts", {
    p_device: device.deviceId,
    p_expected_last_seq: state.lastSeq,
    p_rows: plan.rows,
  });
  if (error) {
    if (error.message === "chain_moved") throw new ApiError(409, "chain_moved", "Another upload changed this chain at the same time. Retry.");
    throw fromDbError(error);
  }
  const res = data as { inserted: number; head_seq: number; head_hash: string };
  const denied = plan.rows.filter((r) => r.verdict === "deny");
  if (denied.length) {
    const rules = [...new Set(denied.flatMap((r) => r.rules))];
    after(async () => notify(device.orgId, "receipt.deny", texts().deny(await deviceName(device.deviceId), denied.length, rules)));
  }
  return NextResponse.json({ accepted: res.inserted, duplicates: plan.duplicates, head_seq: res.head_seq, head_hash: res.head_hash });
});
