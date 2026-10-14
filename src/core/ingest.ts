import { z } from "zod";
import { RECEIPT_VERSION, receiptHash, verifyReceiptSignature, type Receipt } from "./receipts";
import type { KeyObject } from "node:crypto";

/**
 * Pure planning for `POST /api/v1/receipts/batch`. No I/O: the route loads the
 * chain state and the hashes already stored, calls `planIngest`, and writes the
 * accepted rows in one database transaction (`ingest_receipts`), which checks
 * the chain head again under a row lock.
 */

export const BATCH_MAX = 500;
export const RECEIPT_MAX_BYTES = 16 * 1024;
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

const sha = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const shortText = (max: number) => z.string().max(max);

export const receiptSchema = z
  .object({
    v: z.literal(RECEIPT_VERSION),
    id: z.string().regex(/^rcpt_[A-Za-z0-9]{1,64}$/),
    seq: z.number().int().min(0).max(2_147_483_647),
    prev: sha.nullable(),
    issued_at: z.string().datetime({ offset: true }),
    agent: shortText(200),
    session: shortText(200),
    action: z
      .object({
        server: shortText(200),
        tool: shortText(200),
        kind: shortText(40),
        args_sha256: sha,
        args: z.unknown().optional(),
      })
      .strict(),
    decision: z
      .object({
        verdict: z.enum(["allow", "ask", "deny"]),
        rules: z.array(shortText(100)).max(100),
        policy_sha256: shortText(80),
        approved_by: shortText(100).optional(),
      })
      .strict(),
    outcome: z
      .object({
        status: z.enum(["ok", "error", "blocked", "declined", "pending", "asked"]),
        result_sha256: sha.nullable(),
      })
      .strict(),
    tool_sha256: sha.nullable(),
    kid: z.string().regex(/^atl_[0-9a-f]{16}$/),
    sig: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
  })
  .strict();

export type ValidReceipt = z.infer<typeof receiptSchema>;

export const batchSchema = z
  .object({
    receipts: z.array(z.unknown()).min(1).max(BATCH_MAX),
  })
  .strict();

export interface ChainState {
  /** -1 when the server has no receipts for this chain yet */
  lastSeq: number;
  lastHash: string | null;
}

export interface ReceiptRow {
  seq: number;
  prev: string | null;
  hash: string;
  receipt_id: string;
  issued_at: string;
  agent: string;
  session: string;
  server: string;
  tool: string;
  kind: string;
  verdict: "allow" | "ask" | "deny";
  rules: string[];
  policy_sha256: string;
  tool_sha256: string | null;
  outcome_status: string;
  has_args: boolean;
  body: ValidReceipt;
}

export type IngestPlan =
  | { ok: true; rows: ReceiptRow[]; duplicates: number; newHead: ChainState }
  | { ok: false; status: 409 | 422; code: string; detail: string; index?: number };

/**
 * Decide what to store.
 *
 * - every receipt must match the v1 schema, be signed by the device key and be at most 16 KB
 * - receipts must be in ascending, contiguous `seq` order
 * - a receipt already stored with the same hash is a duplicate (idempotent retry)
 * - a different receipt at an already stored `seq` is a fork or replay: 409
 * - a gap after the stored head, or a wrong `prev`, is rejected: 422
 * - `issued_at` more than 5 minutes in the future is rejected: 422
 */
export function planIngest(
  state: ChainState,
  existing: Map<number, string>,
  batch: unknown[],
  pub: { key: KeyObject; kid: string },
  now: Date = new Date(),
): IngestPlan {
  const rows: ReceiptRow[] = [];
  let duplicates = 0;
  let head = { ...state };
  let prevSeq: number | null = null;

  for (let index = 0; index < batch.length; index++) {
    const raw = batch[index];
    let size: number;
    try {
      size = Buffer.byteLength(JSON.stringify(raw) ?? "", "utf8");
    } catch {
      return { ok: false, status: 422, code: "invalid_receipt", detail: "receipt is not JSON", index };
    }
    if (size > RECEIPT_MAX_BYTES) {
      return { ok: false, status: 422, code: "receipt_too_large", detail: `receipt is larger than ${RECEIPT_MAX_BYTES} bytes`, index };
    }
    const parsed = receiptSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, status: 422, code: "invalid_receipt", detail: `${issue?.path.join(".") || "receipt"}: ${issue?.message ?? "invalid"}`, index };
    }
    const r = parsed.data;
    if (prevSeq !== null && r.seq !== prevSeq + 1) {
      return { ok: false, status: 422, code: "unordered_batch", detail: "receipts in a batch must have contiguous, ascending seq", index };
    }
    prevSeq = r.seq;
    if (r.kid !== pub.kid) {
      return { ok: false, status: 422, code: "wrong_key", detail: "receipt was signed by a different key than this device's", index };
    }
    // hash and verify the exact object the device signed, not the parsed copy
    const hash = receiptHash(raw);

    if (r.seq <= head.lastSeq) {
      const stored = existing.get(r.seq);
      if (stored === hash) {
        duplicates += 1;
        continue;
      }
      return { ok: false, status: 409, code: "chain_conflict", detail: `seq ${r.seq} is already stored with different content (fork or replay)`, index };
    }
    if (r.seq !== head.lastSeq + 1) {
      return { ok: false, status: 422, code: "chain_gap", detail: `expected seq ${head.lastSeq + 1}, got ${r.seq}`, index };
    }
    if ((r.prev ?? null) !== head.lastHash) {
      return { ok: false, status: 422, code: "chain_broken", detail: `prev of seq ${r.seq} does not match the stored head`, index };
    }
    if (Date.parse(r.issued_at) - now.getTime() > MAX_FUTURE_SKEW_MS) {
      return { ok: false, status: 422, code: "clock_skew", detail: "issued_at is more than 5 minutes in the future", index };
    }
    if (!verifyReceiptSignature(raw as Receipt, pub)) {
      return { ok: false, status: 422, code: "bad_signature", detail: `signature of seq ${r.seq} does not verify`, index };
    }
    rows.push({
      seq: r.seq,
      prev: r.prev,
      hash,
      receipt_id: r.id,
      issued_at: r.issued_at,
      agent: r.agent,
      session: r.session,
      server: r.action.server,
      tool: r.action.tool,
      kind: r.action.kind,
      verdict: r.decision.verdict,
      rules: r.decision.rules,
      policy_sha256: r.decision.policy_sha256,
      tool_sha256: r.tool_sha256,
      outcome_status: r.outcome.status,
      has_args: r.action.args !== undefined,
      body: raw as ValidReceipt,
    });
    head = { lastSeq: r.seq, lastHash: hash };
  }
  return { ok: true, rows, duplicates, newHead: head };
}
