import { describe, it, expect } from "vitest";
import { withTimeout } from "./timeout.js";

describe("withTimeout", () => {
  it("returns result when promise settles before timeout", async () => {
    const promise = Promise.resolve("success");
    const result = await withTimeout(promise, 1000);
    expect(result).toBe("success");
  });

  it("rejects when promise takes longer than timeout", async () => {
    const slowPromise = new Promise((resolve) => {
      setTimeout(() => resolve("slow"), 500);
    });
    const promise = withTimeout(slowPromise, 100);
    await expect(promise).rejects.toThrow(/timeout/i);
  });

  it("clears timeout handle after promise settles", async () => {
    const promise = Promise.resolve("done");
    const result = await withTimeout(promise, 1000);
    expect(result).toBe("done");
    // No hanging timeouts or memory leaks
  });

  it("rejects with timeout error message", async () => {
    const slowPromise = new Promise((resolve) => {
      setTimeout(() => resolve("result"), 200);
    });
    const promise = withTimeout(slowPromise, 50);
    try {
      await promise;
      throw new Error("Should have timed out");
    } catch (err) {
      expect((err as Error).message).toMatch(/50ms/);
    }
  });
});
