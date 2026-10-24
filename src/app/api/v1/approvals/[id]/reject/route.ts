import { route } from "@/server/http";
import { decideApproval } from "@/server/approval-decision";

export const runtime = "nodejs";

/** POST /api/v1/approvals/{id}/reject (owner/admin). Body: { org_id, note? } */
export const POST = route<{ id: string }>("approvals.reject", (request, { params }) => decideApproval(request, params.id, false));
