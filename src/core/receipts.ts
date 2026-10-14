import { createHash, createPublicKey, verify as cryptoVerify, type KeyObject } from "node:crypto";
import { engine } from "./engine";

/**
 * Server-side verifier for `atls.receipt/1`.
 *
 * A receipt is signed with Ed25519 over the canonical JSON of every field
 * except `sig`. `prev` is the `sha256:` digest of the canonical JSON of the
 * whole previous receipt, so editing, deleting or reordering any receipt breaks
 * the chain. Canonical JSON comes from the shared engine, so the bytes are the
 * same ones the Python CLI signed (checked by the cross-implementation vectors
 * in atls-cli/tests/fixtures/receipts.json).
 */

export const RECEIPT_VERSION = "atls.receipt/1";
const B64U = /^[A-Za-z0-9_-]*$/;

export function canonical(value: unknown): string {
  return engine.canonical(value);
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function digest(value: unknown): string {
  return "sha256:" + sha256Hex(Buffer.from(canonical(value), "utf8"));
}

export function b64uDecode(s: string): Buffer {
  if (typeof s !== "string" || !B64U.test(s)) throw new Error("not base64url");
  return Buffer.from(s, "base64url");
}

export function keyId(publicKey: Uint8Array): string {
  return "atl_" + sha256Hex(publicKey).slice(0, 16);
}

export function publicKeyFromB64u(b64u: string): { raw: Buffer; key: KeyObject; kid: string } {
  const raw = b64uDecode(b64u);
  if (raw.length !== 32) throw new Error("an Ed25519 public key is 32 bytes");
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
  return { raw, key, kid: keyId(raw) };
}

export type Receipt = Record<string, unknown> & { seq?: unknown; prev?: unknown; sig?: unknown; kid?: unknown; v?: unknown };

export function receiptHash(receipt: unknown): string {
  return digest(receipt);
}

export function verifyReceiptSignature(receipt: Receipt, pub: { key: KeyObject; kid: string }): boolean {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return false;
  if (receipt.v !== RECEIPT_VERSION || typeof receipt.sig !== "string" || receipt.kid !== pub.kid) return false;
  let sig: Buffer;
  try {
    sig = b64uDecode(receipt.sig);
  } catch {
    return false;
  }
  if (sig.length !== 64) return false;
  const body: Record<string, unknown> = { ...receipt };
  delete body.sig;
  let message: Buffer;
  try {
    message = Buffer.from(canonical(body), "utf8");
  } catch {
    return false;
  }
  try {
    return cryptoVerify(null, message, pub.key, sig);
  } catch {
    return false;
  }
}

export interface ChainError {
  index: number;
  seq: unknown;
  error: string;
}

export interface ChainReport {
  ok: boolean;
  count: number;
  head: string | null;
  errors: ChainError[];
}

/**
 * Verify signatures and links. `start` lets a verifier continue from a known
 * head (for example the receipts already stored on the server).
 */
export function verifyChain(
  receipts: Receipt[],
  pub: { key: KeyObject; kid: string },
  start: { seq: number; hash: string | null } = { seq: -1, hash: null },
): ChainReport {
  const errors: ChainError[] = [];
  let prev = start.hash;
  let expected = start.seq + 1;
  receipts.forEach((r, index) => {
    if (!verifyReceiptSignature(r, pub)) errors.push({ index, seq: r?.seq ?? null, error: "bad signature" });
    if (r && typeof r === "object") {
      if (r.seq !== expected) errors.push({ index, seq: r.seq, error: `expected seq ${expected}` });
      if ((r.prev ?? null) !== prev) errors.push({ index, seq: r.seq, error: "broken chain: prev does not match the receipt before it" });
      prev = receiptHash(r);
    }
    expected += 1;
  });
  return { ok: errors.length === 0, count: receipts.length, head: prev, errors };
}
