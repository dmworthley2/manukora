import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env.js";

/**
 * SupabaseAdminClient type.
 * Uses generic SupabaseClient (not Database-typed) to avoid type issues with insert/update.
 * Row types are still available via db/types.ts for casting results.
 */
export type SupabaseAdminClient = SupabaseClient;

/** Service-role client: bypasses RLS. Use only on trusted servers. */
export function createSupabaseAdminClient(env: Env): SupabaseAdminClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
