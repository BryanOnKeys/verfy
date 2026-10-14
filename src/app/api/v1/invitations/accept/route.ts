import { NextResponse } from "next/server";
import { z } from "zod";
import { fromDbError, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { requireSignedIn } from "@/server/session";

export const runtime = "nodejs";

const body = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/, "is not an invitation token") }).strict();

/** POST /api/v1/invitations/accept: join the organization; the signed-in email must match the invited one. */
export const POST = route("invitations.accept", async (request) => {
  const { user, supabase } = await requireSignedIn(request, { mutating: true });
  await rateLimit("auth", "accept:" + user.id);
  const input = await readJson(request, body, 512);
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: input.token });
  if (error) throw fromDbError(error);
  return NextResponse.json({ org_id: data as string });
});
