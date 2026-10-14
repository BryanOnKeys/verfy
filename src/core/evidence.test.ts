import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import vectors from "../../atls-cli/tests/fixtures/receipts.json";
import { buildEvidence } from "./evidence";
import { canonical, type Receipt } from "./receipts";

const base = {
  exportId: "e1",
  orgId: "o1",
  from: "2026-10-01T00:00:00Z",
  to: "2026-10-31T00:00:00Z",
  filters: {},
  generatedAt: "2026-10-11T12:00:00Z",
  chains: [{ chain_id: vectors.kid, device_name: "laptop", public_key: vectors.public_key }],
};

describe("evidence export", () => {
  it("is deterministic and self-describing", () => {
    const receipts = vectors.receipts.map((body, seq) => ({ chain_id: vectors.kid, seq, body: body as Receipt })).reverse();
    const a = buildEvidence({ ...base, receipts });
    const b = buildEvidence({ ...base, receipts: [...receipts].reverse() });
    expect(a.jsonl).toBe(b.jsonl);
    expect(a.manifestSha256).toBe(b.manifestSha256);
    expect(a.manifest.receipts_sha256).toBe(createHash("sha256").update(a.jsonl).digest("hex"));
    expect(createHash("sha256").update(canonical(a.manifest)).digest("hex")).toBe(a.manifestSha256);
    const chain = (a.manifest.chains as { verified_at_export: boolean; count: number; head: string }[])[0]!;
    expect(chain).toMatchObject({ verified_at_export: true, count: 4, head: vectors.hashes[3] });
  });

  it("verifies a range that starts in the middle of a chain", () => {
    const receipts = vectors.receipts.slice(2).map((body, i) => ({ chain_id: vectors.kid, seq: i + 2, body: body as Receipt }));
    const out = buildEvidence({ ...base, receipts });
    const chain = (out.manifest.chains as { verified_at_export: boolean; starts_after: string }[])[0]!;
    expect(chain.verified_at_export).toBe(true);
    expect(chain.starts_after).toBe(vectors.hashes[1]);
  });

  it("checks signatures only for a filtered (gapped) export", () => {
    const receipts = [0, 2].map((seq) => ({ chain_id: vectors.kid, seq, body: vectors.receipts[seq] as Receipt }));
    const chain = (buildEvidence({ ...base, filters: { verdict: "allow" }, receipts }).manifest.chains as { verified_at_export: boolean; contiguous: boolean; starts_after: unknown }[])[0]!;
    expect(chain).toMatchObject({ contiguous: false, verified_at_export: true, starts_after: null });
  });

  it("marks a tampered chain as not verified", () => {
    const receipts = vectors.receipts.map((body, seq) => ({ chain_id: vectors.kid, seq, body: JSON.parse(JSON.stringify(body)) as Receipt }));
    (receipts[1]!.body.decision as Record<string, unknown>).verdict = "allow";
    const chain = (buildEvidence({ ...base, receipts }).manifest.chains as { verified_at_export: boolean }[])[0]!;
    expect(chain.verified_at_export).toBe(false);
  });
});
