import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";

/**
 * True when the signed-in user has a verified second factor that this session has not used yet (it is still aal1).
 * Fails closed: if the check cannot run, the user is sent to the code prompt rather than let through.
 */
export async function secondFactorDue(supabase: ServerSupabase): Promise<boolean> {
  const { data, error } = await supabase.rpc("mfa_required");
  return error ? true : data === true;
}
