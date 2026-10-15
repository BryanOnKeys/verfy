import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/server/env";

let client: SupabaseClient | null = null;

/**
 * Supabase client with the SECRET key. It bypasses RLS, so it is only used in
 * server code paths that have already authenticated and authorized the caller
 * themselves: device-token ingest, device enrollment, exports and rate limits.
 * It never runs in the browser (`server-only`) and never sees user cookies.
 */
export function createAdminClient(): SupabaseClient {
  if (client) return client;
  const env = serverEnv();
  client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-client-info": "verfy-server" } },
  });
  return client;
}
