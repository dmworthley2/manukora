import { z } from "zod";
declare const envSchema: z.ZodObject<{
    SUPABASE_URL: z.ZodString;
    SUPABASE_SERVICE_ROLE_KEY: z.ZodString;
}, "strip", z.ZodTypeAny, {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
}, {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
}>;
export type Env = z.infer<typeof envSchema>;
/** Validate process.env for server-side Supabase admin usage. Call once at process startup. */
export declare function loadEnv(overrides?: Record<string, string | undefined>): Env;
export {};
//# sourceMappingURL=env.d.ts.map