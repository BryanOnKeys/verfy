import { z } from "zod";
import { NextResponse } from "next/server";
import { TEAM_SIZES, WAITLIST_AGENTS, type WaitlistAgent } from "@/core/waitlist";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/server/env";
import { assertSameOrigin, fromDbError, readJson, route } from "@/server/http";
import { rateLimitIp } from "@/server/ratelimit";

export const runtime = "nodejs";

const AGENTS = WAITLIST_AGENTS.map(([id]) => id) as [WaitlistAgent, ...WaitlistAgent[]];

const body = z
  .object({
    email: z.string().trim().toLowerCase().max(254).email("is not an email address"),
    company: z.string().trim().max(120).default(""),
    team_size: z.enum(["", ...TEAM_SIZES]).default(""),
    agents: z.array(z.enum(AGENTS)).max(8).default([]),
    // a field people never see; forms that fill it are bots
    website: z.string().max(200).default(""),
  })
  .strict();

/**
 * POST /api/v1/waitlist: join the waitlist for the hosted Team plan.
 * Same answer whether the address is new or already listed, so the form cannot be used to check who signed up.
 */
export const POST = route("waitlist.join", async (request) => {
  assertSameOrigin(request, serverEnv().NEXT_PUBLIC_APP_URL);
  await rateLimitIp("waitlist", request);
  const input = await readJson(request, body, 4096);
  if (input.website === "") {
    const { error } = await createAdminClient()
      .from("waitlist")
      .upsert({ email: input.email, company: input.company, team_size: input.team_size, agents: [...new Set(input.agents)] }, { onConflict: "email", ignoreDuplicates: true });
    if (error) throw fromDbError(error);
  }
  return NextResponse.json({ ok: true }, { status: 202 });
});
