import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/** GET /api/health: liveness for smoke tests. Says only whether configuration is present, never values. */
export function GET() {
  return NextResponse.json({ ok: true, service: "atls", version: "0.2.0", configured: isConfigured() }, { headers: { "Cache-Control": "no-store" } });
}
