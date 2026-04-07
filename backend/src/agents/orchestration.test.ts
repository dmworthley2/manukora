import { describe, it, expect, vi } from "vitest";
import { runBriefingWorkflow, isWorkflowApproved } from "./orchestration.js";
import type { FactBundle } from "../analytics/fact-bundle.js";
import type { Env } from "../env.js";

// Mock the graph module
vi.mock("./graph.js");

import * as graphModule from "./graph.js";

describe("runBriefingWorkflow", () => {
  const mockEnv: Env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
    ANTHROPIC_API_KEY: "sk-ant-test",
    LLM_MODEL: "claude-3-5-haiku-20241022",
    LLM_TEMPERATURE: 0.3,
  };

  const mockFactBundle: FactBundle = {
    summary: { totalRevenue: 1000, highRiskSkuCount: 2 },
    skuMetrics: {},
    trends: { threeMonthVelocity: {} },
    coverRisks: [],
    valueAtRisk: [],
    reorderRecommendations: [],
    proactiveRisks: [],
  } as any;

  it("returns approved state from workflow", async () => {
    vi.mocked(graphModule.executeGraph).mockResolvedValueOnce({
      factBundle: mockFactBundle,
      uploadId: "upload-123",
      period: "2026-04",
      iterationCount: 1,
      approved: true,
      analystDraft: {
        sections: [{ id: "test", title: "Test", content: "Content" }],
        generatedAt: new Date().toISOString(),
      },
    });

    const result = await runBriefingWorkflow(
      mockFactBundle,
      "upload-123",
      "2026-04",
      mockEnv,
    );

    expect(result.approved).toBe(true);
    expect(result.analystDraft).toBeDefined();
  });

  it("returns error state if workflow fails", async () => {
    vi.mocked(graphModule.executeGraph).mockResolvedValueOnce({
      factBundle: mockFactBundle,
      uploadId: "upload-123",
      period: "2026-04",
      iterationCount: 0,
      approved: false,
      error: "Workflow failed",
    });

    const result = await runBriefingWorkflow(
      mockFactBundle,
      "upload-123",
      "2026-04",
      mockEnv,
    );

    expect(result.error).toBe("Workflow failed");
    expect(result.approved).toBe(false);
  });

  it("handles timeout gracefully", async () => {
    vi.mocked(graphModule.executeGraph).mockRejectedValueOnce(
      new Error("Operation timeout after 300000ms"),
    );

    const result = await runBriefingWorkflow(
      mockFactBundle,
      "upload-123",
      "2026-04",
      mockEnv,
    );

    expect(result.timeout).toBe(true);
    expect(result.error).toContain("Briefing workflow timeout");
    expect(result.approved).toBe(false);
  });
});

describe("isWorkflowApproved", () => {
  it("returns true for approved workflows with no errors", () => {
    const state = {
      factBundle: {} as any,
      uploadId: "123",
      period: "2026-04",
      iterationCount: 1,
      approved: true,
    };
    expect(isWorkflowApproved(state)).toBe(true);
  });

  it("returns false if approved flag is false", () => {
    const state = {
      factBundle: {} as any,
      uploadId: "123",
      period: "2026-04",
      iterationCount: 1,
      approved: false,
    };
    expect(isWorkflowApproved(state)).toBe(false);
  });

  it("returns false if error is set", () => {
    const state = {
      factBundle: {} as any,
      uploadId: "123",
      period: "2026-04",
      iterationCount: 1,
      approved: true,
      error: "Some error",
    };
    expect(isWorkflowApproved(state)).toBe(false);
  });

  it("returns false if timeout is set", () => {
    const state = {
      factBundle: {} as any,
      uploadId: "123",
      period: "2026-04",
      iterationCount: 1,
      approved: true,
      timeout: true,
    };
    expect(isWorkflowApproved(state)).toBe(false);
  });
});
