import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, fromDbError, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { requireSignedIn } from "@/server/session";

export const runtime = "nodejs";

const body = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "use 3-40 lowercase letters, numbers and dashes"),
  })
  .strict();

/** POST /api/v1/orgs: create an organization; the caller becomes its owner and policy v1 is the Atls defaults. */
export const POST = route("orgs.create", async (request) => {
  const { user, supabase } = await requireSignedIn(request, { mutating: true });
  await rateLimit("userWrite", "user:" + user.id);
  const input = await readJson(request, body, 1024);
  const { data, error } = await supabase.rpc("create_org", { p_name: input.name, p_slug: input.slug });
  if (error) {
    if (error.code === "23505") throw new ApiError(409, "slug_taken", "That URL name is taken.");
    throw fromDbError(error);
  }
  return NextResponse.json({ id: data as string }, { status: 201 });
});
