import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { publicKeyFromB64u, verifyChain, verifyReceiptSignature, type ChainReport, type Receipt } from "@/core/receipts";
import { fromDbError } from "./http";

/**
 * Reads shared by API routes and dashboard pages. With a session client every
 * query is filtered by RLS; every query also filters by org_id explicitly, so
 * the same code is safe with the admin client after device authentication.
 */

type Db = SupabaseClient;

export const receiptFilters = z.object({
  verdict: z.enum(["allow", "ask", "deny"]).optional(),
  tool: z.string().max(200).optional(),
  server: z.string().max(200).optional(),
  device: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});
export type ReceiptFilters = z.infer<typeof receiptFilters>;

export interface ReceiptListRow {
  id: string;
  receipt_id: string;
  seq: number;
  issued_at: string;
  agent: string;
  server: string;
  tool: string;
  kind: string;
  verdict: "allow" | "ask" | "deny";
  rules: string[];
  outcome_status: string;
  has_args: boolean;
  device_id: string;
  devices: { name: string } | null;
}

export async function listReceipts(db: Db, orgId: string, f: ReceiptFilters) {
  let q = db
    .from("receipts")
    .select("id, receipt_id, seq, issued_at, agent, server, tool, kind, verdict, rules, outcome_status, has_args, device_id, devices(name)", { count: "exact" })
    .eq("org_id", orgId)
    .order("issued_at", { ascending: false })
    .order("seq", { ascending: false });
  if (f.verdict) q = q.eq("verdict", f.verdict);
  if (f.tool) q = q.eq("tool", f.tool);
  if (f.server) q = q.eq("server", f.server);
  if (f.device) q = q.eq("device_id", f.device);
  if (f.from) q = q.gte("issued_at", f.from);
  if (f.to) q = q.lt("issued_at", f.to);
  const start = (f.page - 1) * f.page_size;
  const { data, error, count } = await q.range(start, start + f.page_size - 1);
  if (error) throw fromDbError(error);
  return { rows: (data ?? []) as unknown as ReceiptListRow[], total: count ?? 0, page: f.page, page_size: f.page_size };
}

export async function getReceipt(db: Db, orgId: string, id: string) {
  const { data, error } = await db
    .from("receipts")
    .select("*, devices(id, name, kid, public_key, status), chains(chain_id, last_seq)")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) return null;
  const device = data.devices as { public_key: string; kid: string } | null;
  let signature: "valid" | "invalid" | "unknown_key" = "unknown_key";
  if (device) signature = verifyReceiptSignature(data.body as Receipt, publicKeyFromB64u(device.public_key)) ? "valid" : "invalid";
  return { ...data, signature };
}

export const CHAIN_VERIFY_MAX = 100_000;

/** Re-verify a whole chain from the stored, signed bodies. */
export async function verifyStoredChain(db: Db, orgId: string, chainId: string): Promise<(ChainReport & { chain_id: string; device: string; truncated: boolean; stored_head: string | null }) | null> {
  const { data: chain, error } = await db
    .from("chains")
    .select("id, chain_id, last_seq, last_hash, devices(name, public_key)")
    .eq("org_id", orgId)
    .eq("chain_id", chainId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!chain) return null;
  const device = chain.devices as unknown as { name: string; public_key: string };
  const pub = publicKeyFromB64u(device.public_key);
  const bodies: Receipt[] = [];
  const pageSize = 1000;
  for (let from = 0; from < CHAIN_VERIFY_MAX; from += pageSize) {
    const { data, error: e } = await db
      .from("receipts")
      .select("body")
      .eq("org_id", orgId)
      .eq("chain_pk", chain.id)
      .order("seq", { ascending: true })
      .range(from, from + pageSize - 1);
    if (e) throw fromDbError(e);
    bodies.push(...(data ?? []).map((r) => r.body as Receipt));
    if (!data || data.length < pageSize) break;
  }
  const report = verifyChain(bodies, pub);
  const headMatches = report.head === chain.last_hash;
  return {
    ...report,
    ok: report.ok && headMatches,
    errors: headMatches ? report.errors : [...report.errors, { index: bodies.length, seq: chain.last_seq, error: "stored chain head does not match the receipts" }],
    chain_id: chain.chain_id,
    device: device.name,
    truncated: bodies.length >= CHAIN_VERIFY_MAX,
    stored_head: chain.last_hash,
  };
}

export async function getCurrentPolicy(db: Db, orgId: string) {
  const { data, error } = await db
    .from("policies")
    .select("version, body, sha256, note, created_at, created_by")
    .eq("org_id", orgId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data as { version: number; body: Record<string, unknown>; sha256: string; note: string | null; created_at: string; created_by: string | null } | null;
}

export async function listPolicyVersions(db: Db, orgId: string) {
  const { data, error } = await db
    .from("policies")
    .select("version, sha256, note, created_at, profiles:created_by(email)")
    .eq("org_id", orgId)
    .order("version", { ascending: false })
    .limit(50);
  if (error) throw fromDbError(error);
  return data ?? [];
}

export const lockStatus = z.enum(["pending", "approved", "rejected"]);

export async function listApprovals(db: Db, orgId: string) {
  const { data, error } = await db
    .from("approvals")
    .select("id, server_id, tool_name, kind, args_sha256, findings, status, created_at, expires_at, decided_at, decision_note, devices:device_id(name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw fromDbError(error);
  const now = Date.now();
  // a request past its deadline is expired even before the database marks it
  return (data ?? []).map((r) => (r.status === "pending" && Date.parse(r.expires_at) <= now ? { ...r, status: "expired" as const } : r));
}

export async function listLocks(db: Db, orgId: string, status?: z.infer<typeof lockStatus>) {
  let q = db
    .from("locks")
    .select("id, server_id, tool_name, digest, definition, status, created_at, decided_at, decision_note, proposed_by_device, devices:proposed_by_device(name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw fromDbError(error);
  return data ?? [];
}

export async function listDevices(db: Db, orgId: string) {
  const { data, error } = await db
    .from("devices")
    .select("id, name, platform, kid, status, created_at, last_seen_at, revoked_at, chains(last_seq, receipt_count)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw fromDbError(error);
  return data ?? [];
}

export async function orgStats(db: Db, orgId: string) {
  const { data, error } = await db.rpc("org_stats", { p_org: orgId });
  if (error) throw fromDbError(error);
  return data as {
    receipts_total: number;
    receipts_7d: number;
    denied_7d: number;
    asked_7d: number;
    devices_active: number;
    locks_pending: number;
    policy_version: number | null;
    members: number;
  };
}
