import { createClient } from "@supabase/supabase-js";
/** Service-role client: bypasses RLS. Use only on trusted servers. */
export function createSupabaseAdminClient(env) {
    return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
}
//# sourceMappingURL=admin-client.js.map