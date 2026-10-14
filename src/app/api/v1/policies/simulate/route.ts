import { NextResponse } from "next/server";
import { z } from "zod";
import { simulate, validatePolicy } from "@/core/policy";
import { getCurrentPolicy } from "@/server/data";
import { ApiError, readJson, route, uuid } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";

const action = z
  .object({
    name: z.string().min(1).max(120),
    action: z.object({ tool: z.string().min(1).max(200), server: z.string().max(200).optional(), arguments: z.record(z.string(), z.unknown()).optional() }).strict(),
  })
  .strict();

const body = z
  .object({
    org_id: uuid,
    body: z.record(z.string(), z.unknown()),
    actions: z.array(action).max(50).default([]),
  })
  .strict();

/** POST /api/v1/policies/simulate: compare the current policy with a proposed one on the shared fixture corpus (no changes are saved). */
export const POST = route("policies.simulate", async (request) => {
  const input = await readJson(request, body, 120 * 1024);
  const { supabase, user } = await requireOrgAccess(request, input.org_id, "policies.simulate", { mutating: true });
  await rateLimit("simulate", "user:" + user.id);
  const proposed = validatePolicy(input.body);
  if (!proposed.ok) throw new ApiError(422, "invalid_policy", "The policy is not valid.", proposed.error);
  const current = await getCurrentPolicy(supabase, input.org_id);
  const cur = validatePolicy(current?.body ?? {});
  return NextResponse.json(simulate(cur.ok ? cur.policy : {}, proposed.policy, input.actions));
});
