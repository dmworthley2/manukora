import { describe, it, expect } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("throws when required Supabase vars are missing", () => {
    expect(() =>
      loadEnv({
        SUPABASE_URL: undefined,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
        ANTHROPIC_API_KEY: "sk-ant-test",
      }),
    ).toThrow(/Invalid environment/);
  });

  it("throws when ANTHROPIC_API_KEY is missing", () => {
    expect(() =>
      loadEnv({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
        ANTHROPIC_API_KEY: undefined,
      }),
    ).toThrow(/Invalid environment/);
  });

  it("accepts valid env with all required vars", () => {
    const env = loadEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      ANTHROPIC_API_KEY: "sk-ant-test-key",
    });
    expect(env.SUPABASE_URL).toBe("https://example.supabase.co");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test-key");
  });

  it("uses default values for optional LLM vars", () => {
    const env = loadEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      ANTHROPIC_API_KEY: "sk-ant-test-key",
      LLM_MODEL: undefined, // will use default
      LLM_TEMPERATURE: undefined, // will use default
    });
    expect(env.LLM_MODEL).toBe("claude-3-5-haiku-20241022");
    expect(env.LLM_TEMPERATURE).toBe(0.3);
  });

  it("accepts custom LLM_TEMPERATURE value", () => {
    const env = loadEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      ANTHROPIC_API_KEY: "sk-ant-test-key",
      LLM_TEMPERATURE: "0.1",
    });
    expect(env.LLM_TEMPERATURE).toBe(0.1);
  });
});
