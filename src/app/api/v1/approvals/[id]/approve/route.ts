import { route } from "@/server/http";
import { decideApproval } from "@/server/approval-decision";

export const runtime = "nodejs";

/** POST /api/v1/approvals/{id}/approve (owner/admin). Body: { org_id, note? } */
export const POST = route<{ id: string }>("approvals.approve", (request, { params }) => decideApproval(request, params.id, true));
