import { z } from "zod";
const envSchema = z.object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});
/** Validate process.env for server-side Supabase admin usage. Call once at process startup. */
export function loadEnv(overrides) {
    const source = { ...process.env, ...overrides };
    const parsed = envSchema.safeParse({
        SUPABASE_URL: source.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    });
    if (!parsed.success) {
        const msg = parsed.error.flatten().fieldErrors;
        throw new Error(`Invalid environment: ${JSON.stringify(msg)}. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY`);
    }
    return parsed.data;
}
//# sourceMappingURL=env.js.map