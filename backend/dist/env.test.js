import { describe, it, expect } from "vitest";
import { loadEnv } from "./env.js";
describe("loadEnv", () => {
    it("throws when required vars are missing", () => {
        expect(() => loadEnv({
            SUPABASE_URL: undefined,
            SUPABASE_SERVICE_ROLE_KEY: undefined,
        })).toThrow(/Invalid environment/);
    });
    it("accepts valid env", () => {
        const env = loadEnv({
            SUPABASE_URL: "https://example.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
        });
        expect(env.SUPABASE_URL).toBe("https://example.supabase.co");
    });
});
//# sourceMappingURL=env.test.js.map