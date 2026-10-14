import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import vectors from "../../atls-cli/tests/fixtures/receipts.json";
import { canonical, digest, keyId, publicKeyFromB64u, receiptHash, verifyChain, verifyReceiptSignature, type Receipt } from "./receipts";
import { BATCH_MAX, batchSchema, planIngest } from "./ingest";

const pub = publicKeyFromB64u(vectors.public_key);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const receipts = (): Receipt[] => clone(vectors.receipts) as Receipt[];

describe("cross-implementation receipt vectors (signed by the Python CLI)", () => {
  it("derives the same key id", () => {
    expect(pub.kid).toBe(vectors.kid);
    expect(keyId(pub.raw)).toBe(vectors.kid);
  });

  it("computes the same receipt hashes", () => {
    expect(receipts().map(receiptHash)).toEqual(vectors.hashes);
  });

  it("verifies every signature and the chain", () => {
    for (const r of receipts()) expect(verifyReceiptSignature(r, pub)).toBe(true);
    const report = verifyChain(receipts(), pub);
    expect(report.ok).toBe(true);
    expect(report.head).toBe(vectors.hashes.at(-1));
  });

  it("detects tampering, deletion, reordering and a wrong key", () => {
    const edited = receipts();
    (edited[1]!.decision as Record<string, unknown>).verdict = "allow";
    expect(verifyChain(edited, pub).errors.map((e) => e.index)).toEqual([1, 2]);

    const deleted = receipts();
    deleted.splice(1, 1);
    expect(verifyChain(deleted, pub).ok).toBe(false);

    const reordered = receipts();
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(verifyChain(reordered, pub).ok).toBe(false);

    const { publicKey } = generateKeyPairSync("ed25519");
    const raw = publicKey.export({ format: "jwk" }).x!;
    expect(verifyChain(receipts(), publicKeyFromB64u(raw)).ok).toBe(false);
  });

  it("rejects malformed signatures without throwing", () => {
    const r = receipts()[0]!;
    for (const sig of ["", "!!!", "A".repeat(86), 42]) {
      expect(verifyReceiptSignature({ ...r, sig } as Receipt, pub)).toBe(false);
    }
    expect(verifyReceiptSignature({ ...r, v: "other/1" } as Receipt, pub)).toBe(false);
  });

  it("canonical JSON sorts keys and matches JavaScript number formatting", () => {
    expect(canonical({ b: 1, a: [1.5, "ü", null, true] })).toBe('{"a":[1.5,"ü",null,true],"b":1}');
    expect(digest({})).toBe("sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
  });
});

describe("ingest planning", () => {
  const empty = { lastSeq: -1, lastHash: null };
  const now = new Date("2026-10-11T10:00:00Z");

  it("accepts a fresh chain and computes the new head", () => {
    const plan = planIngest(empty, new Map(), receipts(), pub, now);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.rows.map((r) => r.seq)).toEqual([0, 1, 2, 3]);
    expect(plan.rows[1]!.verdict).toBe("deny");
    expect(plan.rows.every((r) => !r.has_args)).toBe(true);
    expect(plan.newHead).toEqual({ lastSeq: 3, lastHash: vectors.hashes[3] });
  });

  it("is idempotent for an exact retry and continues after the stored head", () => {
    const stored = new Map(vectors.hashes.slice(0, 2).map((h, i) => [i, h] as [number, string]));
    const plan = planIngest({ lastSeq: 1, lastHash: vectors.hashes[1]! }, stored, receipts(), pub, now);
    expect(plan.ok && plan.duplicates).toBe(2);
    expect(plan.ok && plan.rows.map((r) => r.seq)).toEqual([2, 3]);
  });

  it("rejects a replayed seq with different content as a conflict", () => {
    const stored = new Map([[0, "sha256:" + "0".repeat(64)]]);
    const plan = planIngest({ lastSeq: 0, lastHash: "sha256:" + "0".repeat(64) }, stored, receipts().slice(0, 1), pub, now);
    expect(plan).toMatchObject({ ok: false, status: 409, code: "chain_conflict" });
  });

  it("rejects gaps, broken links, bad signatures, other keys and unordered batches", () => {
    expect(planIngest(empty, new Map(), receipts().slice(1), pub, now)).toMatchObject({ ok: false, code: "chain_gap" });
    const broken = receipts();
    broken[2]!.prev = "sha256:" + "1".repeat(64);
    expect(planIngest(empty, new Map(), broken, pub, now)).toMatchObject({ ok: false, code: "chain_broken", index: 2 });
    const forged = receipts();
    (forged[1]!.outcome as Record<string, unknown>).status = "ok";
    expect(planIngest(empty, new Map(), forged, pub, now)).toMatchObject({ ok: false, code: "bad_signature", index: 1 });
    const other = receipts();
    other[0]!.kid = "atl_0000000000000000";
    expect(planIngest(empty, new Map(), other, pub, now)).toMatchObject({ ok: false, code: "wrong_key" });
    const swapped = receipts();
    [swapped[1], swapped[2]] = [swapped[2]!, swapped[1]!];
    expect(planIngest(empty, new Map(), swapped, pub, now)).toMatchObject({ ok: false, code: "unordered_batch" });
  });

  it("rejects receipts from the future, unknown fields and oversize receipts", () => {
    expect(planIngest(empty, new Map(), receipts(), pub, new Date("2026-10-11T08:00:00Z"))).toMatchObject({ ok: false, code: "clock_skew" });
    const extra = receipts();
    (extra[0] as Record<string, unknown>).admin = true;
    expect(planIngest(empty, new Map(), extra, pub, now)).toMatchObject({ ok: false, code: "invalid_receipt" });
    const big = receipts();
    (big[0]!.action as Record<string, unknown>).args = { blob: "x".repeat(20_000) };
    expect(planIngest(empty, new Map(), big, pub, now)).toMatchObject({ ok: false, code: "receipt_too_large" });
  });

  it("bounds the batch size", () => {
    expect(batchSchema.safeParse({ receipts: [] }).success).toBe(false);
    expect(batchSchema.safeParse({ receipts: new Array(BATCH_MAX + 1).fill({}) }).success).toBe(false);
    expect(batchSchema.safeParse({ receipts: [{}], org_id: "x" }).success).toBe(false);
  });

  it("verifies receipts signed by a Node key with the same canonical bytes", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const x = publicKey.export({ format: "jwk" }).x!;
    const key = publicKeyFromB64u(x);
    const body = { ...receipts()[0]!, kid: key.kid } as Record<string, unknown>;
    delete body.sig;
    const sig = cryptoSign(null, Buffer.from(canonical(body)), privateKey).toString("base64url");
    expect(verifyReceiptSignature({ ...body, sig } as Receipt, key)).toBe(true);
  });
});
