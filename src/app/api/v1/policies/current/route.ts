import { NextResponse } from "next/server";
import { z } from "zod";
import { simulate, validatePolicy, type TeamPolicy } from "@/core/policy";
import { getCurrentPolicy } from "@/server/data";
import { ApiError, fromDbError, readJson, route, uuid } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { resolveReader } from "@/server/reader";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";

/** GET /api/v1/policies/current: the latest team policy (device token or member session with ?org=). */
export const GET = route("policies.current.get", async (request) => {
  const { db, orgId } = await resolveReader(request, "policies.read");
  const policy = await getCurrentPolicy(db, orgId);
  if (!policy) throw new ApiError(404, "not_found", "This organization has no policy yet.");
  return NextResponse.json({ version: policy.version, sha256: policy.sha256, body: policy.body, note: policy.note, created_at: policy.created_at });
});

const putBody = z
  .object({
    org_id: uuid,
    body: z.record(z.string(), z.unknown()),
    note: z.string().max(200).optional(),
    expected_version: z.number().int().min(0),
    acknowledge_lockout: z.boolean().default(false),
  })
  .strict();

/**
 * PUT /api/v1/policies/current: publish a new policy version (owner/admin).
 * The simulator runs first; a policy that would block most everyday developer
 * actions is refused unless `acknowledge_lockout` is true.
 */
export const PUT = route("policies.current.put", async (request) => {
  const input = await readJson(request, putBody, 80 * 1024);
  const { supabase, user } = await requireOrgAccess(request, input.org_id, "policies.publish", { mutating: true });
  await rateLimit("userWrite", "user:" + user.id);
  const valid = validatePolicy(input.body);
  if (!valid.ok) throw new ApiError(422, "invalid_policy", "The policy is not valid.", valid.error);
  const current = await getCurrentPolicy(supabase, input.org_id);
  if ((current?.version ?? 0) !== input.expected_version) {
    throw new ApiError(409, "version_conflict", "Someone published a newer version. Reload and review it first.", undefined, { current_version: current?.version ?? 0 });
  }
  const currentBody = validatePolicy(current?.body ?? {});
  const sim = simulate(currentBody.ok ? currentBody.policy : ({} as TeamPolicy), valid.policy);
  if (sim.lockout && !input.acknowledge_lockout) {
    throw new ApiError(422, "policy_lockout", "This policy would block most everyday developer actions.", sim.warnings[0], { simulation: sim });
  }
  const { data, error } = await supabase.rpc("publish_policy", { p_org: input.org_id, p_body: valid.policy, p_note: input.note ?? null });
  if (error) throw fromDbError(error);
  return NextResponse.json({ version: data as number, simulation: sim });
});
