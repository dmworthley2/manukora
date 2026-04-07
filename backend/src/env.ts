import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().default("claude-3-5-haiku-20241022"),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.3),
});

export type Env = z.infer<typeof envSchema>;

// Force rebuild: 2026-04-07

/** Validate process.env for server-side Supabase admin usage and LLM agents. Call once at process startup. */
export function loadEnv(overrides?: Record<string, string | undefined>): Env {
  const source = { ...process.env, ...overrides };
  const parsed = envSchema.safeParse({
    SUPABASE_URL: source.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: source.ANTHROPIC_API_KEY,
    LLM_MODEL: source.LLM_MODEL,
    LLM_TEMPERATURE: source.LLM_TEMPERATURE,
  });
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    throw new Error(
      `Invalid environment: ${JSON.stringify(msg)}. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY`,
    );
  }
  return parsed.data;
}
