import { z } from "zod";
declare const envSchema: z.ZodObject<{
    SUPABASE_URL: z.ZodString;
    SUPABASE_SERVICE_ROLE_KEY: z.ZodString;
    ANTHROPIC_API_KEY: z.ZodString;
    LLM_MODEL: z.ZodDefault<z.ZodString>;
    LLM_TEMPERATURE: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    ANTHROPIC_API_KEY: string;
    LLM_MODEL: string;
    LLM_TEMPERATURE: number;
}, {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    ANTHROPIC_API_KEY: string;
    LLM_MODEL?: string | undefined;
    LLM_TEMPERATURE?: number | undefined;
}>;
export type Env = z.infer<typeof envSchema>;
/** Validate process.env for server-side Supabase admin usage and LLM agents. Call once at process startup. */
export declare function loadEnv(overrides?: Record<string, string | undefined>): Env;
export {};
//# sourceMappingURL=env.d.ts.map