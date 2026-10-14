import { route } from "@/server/http";
import { decideLock } from "@/server/lock-decision";

export const runtime = "nodejs";

/** POST /api/v1/locks/{id}/reject (owner/admin). Body: { org_id, note? } */
export const POST = route<{ id: string }>("locks.reject", (request, { params }) => decideLock(request, params.id, false));
