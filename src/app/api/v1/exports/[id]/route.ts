import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError, fromDbError, route, uuid } from "@/server/http";
import { requireOrgAccess } from "@/server/session";

export const runtime = "nodejs";

const SIGNED_URL_SECONDS = 60;

/**
 * GET /api/v1/exports/{id}?org=… (owner/admin/auditor): status, manifest hash
 * and 60-second download links. The row is read as the user (RLS decides who
 * may see it); only then does the server sign the storage URLs.
 */
export const GET = route<{ id: string }>("exports.get", async (request, { params }) => {
  const org = uuid.safeParse(request.nextUrl.searchParams.get("org"));
  if (!org.success || !uuid.safeParse(params.id).success) throw new ApiError(404, "not_found", "Export not found.");
  const { supabase } = await requireOrgAccess(request, org.data, "exports.read");
  const { data: exp, error } = await supabase
    .from("exports")
    .select("id, status, receipt_count, manifest_sha256, storage_path, error, created_at, completed_at")
    .eq("id", params.id)
    .eq("org_id", org.data)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!exp) throw new ApiError(404, "not_found", "Export not found.");
  let downloads: { receipts: string; manifest: string } | null = null;
  if (exp.status === "ready" && exp.storage_path) {
    const bucket = createAdminClient().storage.from("exports");
    const [a, b] = await Promise.all([
      bucket.createSignedUrl(`${exp.storage_path}/receipts.jsonl`, SIGNED_URL_SECONDS, { download: `verfy-${exp.id}-receipts.jsonl` }),
      bucket.createSignedUrl(`${exp.storage_path}/manifest.json`, SIGNED_URL_SECONDS, { download: `verfy-${exp.id}-manifest.json` }),
    ]);
    if (a.error || b.error || !a.data || !b.data) throw new ApiError(503, "unavailable", "Download links could not be created. Try again.");
    downloads = { receipts: a.data.signedUrl, manifest: b.data.signedUrl };
  }
  const { storage_path: _p, ...rest } = exp;
  return NextResponse.json({ ...rest, downloads, downloads_expire_in_seconds: downloads ? SIGNED_URL_SECONDS : null });
});
