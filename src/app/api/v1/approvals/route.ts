import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { engine } from "@/core/engine";
import { authenticateDevice } from "@/server/device-auth";
import { fromDbError, readJson, route } from "@/server/http";
import { deviceName, notify, texts } from "@/server/notify";
import { rateLimit } from "@/server/ratelimit";

export const runtime = "nodejs";

const finding = z.object({ rule: z.string().min(1).max(100), verdict: z.enum(["ask", "deny"]), message: z.string().max(500) }).strict();
const body = z
  .object({
    server_id: z.string().min(1).max(200),
    tool_name: z.string().min(1).max(200),
    kind: z.string().min(1).max(40),
    args_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    findings: z.array(finding).min(1).max(20),
    ttl_seconds: z.number().int().min(10).max(900).default(120),
  })
  .strict();

/** POST /api/v1/approvals: a device asks the team to approve one call. Arguments are never sent, only their hash. */
export const POST = route("approvals.request", async (request) => {
  const device = await authenticateDevice(request);
  await rateLimit("requestApproval", "device:" + device.deviceId);
  const input = await readJson(request, body, 16 * 1024);
  const { data, error } = await createAdminClient().rpc("request_approval", {
    p_device: device.deviceId,
    p_server: input.server_id,
    p_tool: input.tool_name,
    p_kind: input.kind,
    p_args_sha: input.args_sha256,
    // the CLI already redacts; this is the second line
    p_findings: engine.redactValue(input.findings),
    p_ttl_seconds: input.ttl_seconds,
  });
  if (error) throw fromDbError(error);
  after(async () =>
    notify(device.orgId, "approval.request", texts().approval(await deviceName(device.deviceId), input.server_id, input.tool_name, input.findings.map((f) => f.rule))),
  );
  return NextResponse.json(data, { status: 201 });
});
