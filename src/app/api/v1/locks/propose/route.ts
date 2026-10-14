import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { engine } from "@/core/engine";
import { authenticateDevice } from "@/server/device-auth";
import { ApiError, fromDbError, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

const body = z
  .object({
    server_id: z.string().min(1).max(200),
    tool_name: z.string().min(1).max(200),
    digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    definition: z
      .object({ name: z.string().max(200), description: z.string().max(20000), inputSchema: z.unknown() })
      .strict(),
  })
  .strict();

/** POST /api/v1/locks/propose: a device asks admins to approve a changed or new tool definition. */
export const POST = route("locks.propose", async (request) => {
  const device = await authenticateDevice(request);
  await rateLimit("proposeLock", "device:" + device.deviceId);
  const input = await readJson(request, body, 80 * 1024);
  if (input.definition.name !== input.tool_name) throw new ApiError(422, "invalid_request", "definition.name must equal tool_name.");
  // The digest must be the canonical digest of the definition, exactly as the CLI computes it.
  if ((await engine.toolPin(input.definition)) !== input.digest) {
    throw new ApiError(422, "digest_mismatch", "digest is not the SHA-256 of the canonical definition.");
  }
  const { data, error } = await createAdminClient().rpc("propose_lock", {
    p_device: device.deviceId,
    p_server: input.server_id,
    p_tool: input.tool_name,
    p_digest: input.digest,
    p_definition: input.definition,
  });
  if (error) throw fromDbError(error);
  return NextResponse.json(data, { status: 201 });
});
