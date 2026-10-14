import { canonical, publicKeyFromB64u, sha256Hex, verifyChain, verifyReceiptSignature, type Receipt } from "./receipts";

/**
 * Evidence export format `atls.export/1`:
 *   receipts.jsonl  one signed receipt per line, grouped by chain, in seq order
 *   manifest.json   what is inside, the device public keys, and the SHA-256 of receipts.jsonl
 * The manifest's own SHA-256 (of its canonical JSON) is stored in the database
 * and shown in the dashboard, so a recipient can check both files offline:
 *   1. sha256(receipts.jsonl) == manifest.receipts_sha256
 *   2. sha256(canonical(manifest)) == the manifest hash they were given
 *   3. `atls verify --ledger receipts.jsonl --pub KEY --kid CHAIN [--start-after HASH]` per chain
 * A chain in an export may start after seq 0 (a date range); its first
 * receipt's `prev` is then listed as `starts_after`.
 */

export const EXPORT_FORMAT = "atls.export/1";
export const EXPORT_MAX_RECEIPTS = 20_000;

export interface ExportChainInput {
  chain_id: string;
  device_name: string;
  public_key: string;
}

export interface ExportInput {
  exportId: string;
  orgId: string;
  from: string;
  to: string;
  filters: Record<string, unknown>;
  generatedAt: string;
  chains: ExportChainInput[];
  /** receipts with their chain id, any order */
  receipts: { chain_id: string; seq: number; body: Receipt }[];
}

export interface ExportResult {
  jsonl: string;
  manifest: Record<string, unknown>;
  manifestSha256: string;
}

export function buildEvidence(input: ExportInput): ExportResult {
  const byChain = new Map<string, { seq: number; body: Receipt }[]>();
  for (const r of input.receipts) {
    const list = byChain.get(r.chain_id) ?? [];
    list.push(r);
    byChain.set(r.chain_id, list);
  }
  const lines: string[] = [];
  const chains = [];
  for (const chain of [...input.chains].sort((a, b) => a.chain_id.localeCompare(b.chain_id))) {
    const items = (byChain.get(chain.chain_id) ?? []).sort((a, b) => a.seq - b.seq);
    if (!items.length) continue;
    const first = items[0]!;
    const start = { seq: first.seq - 1, hash: (first.body.prev as string | null) ?? null };
    const pub = publicKeyFromB64u(chain.public_key);
    // A filtered export (for example only denied actions) has gaps: each
    // signature can still be checked, but the links only in a full export.
    const contiguous = items.every((it, i) => it.seq === first.seq + i);
    const report = contiguous ? verifyChain(items.map((i) => i.body), pub, start) : null;
    const signaturesOk = report ? report.ok : items.every((i) => verifyReceiptSignature(i.body, pub));
    for (const i of items) lines.push(JSON.stringify(i.body));
    chains.push({
      chain_id: chain.chain_id,
      device: chain.device_name,
      public_key: chain.public_key,
      first_seq: first.seq,
      last_seq: items.at(-1)!.seq,
      count: items.length,
      contiguous,
      starts_after: contiguous ? start.hash : null,
      head: report ? report.head : null,
      verified_at_export: signaturesOk,
    });
  }
  const jsonl = lines.length ? lines.join("\n") + "\n" : "";
  const manifest = {
    format: EXPORT_FORMAT,
    export_id: input.exportId,
    org_id: input.orgId,
    range: { from: input.from, to: input.to },
    filters: input.filters,
    generated_at: input.generatedAt,
    receipt_count: lines.length,
    receipts_file: "receipts.jsonl",
    receipts_sha256: sha256Hex(Buffer.from(jsonl, "utf8")),
    chains,
    how_to_verify: [
      "sha256sum receipts.jsonl must equal receipts_sha256",
      "sha256 of the canonical JSON of this manifest must equal the manifest hash shown in Atls",
      "for each contiguous chain: `atls verify --ledger receipts.jsonl --pub PUBLIC_KEY --kid CHAIN_ID` and, when starts_after is not null, add `--start-after STARTS_AFTER`",
      "a chain with contiguous=false comes from a filtered export: each signature verifies on its own, but the hash links can only be checked against an unfiltered export",
    ],
    limits: "Receipts prove what passed through the Atls guard or gateway and that the records were not changed afterwards. They do not prove what a tool did internally.",
  };
  return { jsonl, manifest, manifestSha256: sha256Hex(Buffer.from(canonical(manifest), "utf8")) };
}
