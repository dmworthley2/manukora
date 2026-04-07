import { describe, it, expect, vi } from "vitest";
import { executeGraph } from "./graph.js";
import type { BriefingState } from "./types.js";
import type { Env } from "../env.js";

// Mock the node functions
vi.mock("./analyst-node.js");
vi.mock("./auditor-node.js");

import * as analystModule from "./analyst-node.js";
import * as auditorModule from "./auditor-node.js";

describe("executeGraph", () => {
  const mockEnv: Env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
    ANTHROPIC_API_KEY: "sk-ant-test",
    LLM_MODEL: "claude-3-5-haiku-20241022",
    LLM_TEMPERATURE: 0.3,
  };

  const initialState: BriefingState = {
    factBundle: {
      summary: { totalRevenue: 1000, highRiskSkuCount: 2 },
      skuMetrics: {},
      trends: { threeMonthVelocity: {} },
      coverRisks: [],
      valueAtRisk: [],
      reorderRecommendations: [],
      proactiveRisks: [],
    } as any,
    uploadId: "upload-123",
    period: "2026-04",
    iterationCount: 0,
    approved: false,
  };

  it("runs analyst and auditor and returns approved state", async () => {
    // Mock analyst to return a draft
    vi.mocked(analystModule.runAnalystNode).mockResolvedValueOnce({
      analystDraft: {
        sections: [{ id: "summary", title: "Summary", content: "Test" }],
        generatedAt: new Date().toISOString(),
      },
      iterationCount: 1,
    });

    // Mock auditor to approve
    vi.mocked(auditorModule.runAuditorNode).mockResolvedValueOnce({
      auditResult: {
        approved: true,
        corrections: [],
        checklist: {
          numericalAccuracy: true,
          noHallucinations: true,
          logicConsistency: true,
          citationFormat: true,
        },
      },
      approved: true,
    });

    const result = await executeGraph(initialState, mockEnv);

    expect(result.approved).toBe(true);
    expect(result.analystDraft).toBeDefined();
    expect(result.iterationCount).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("handles analyst errors gracefully", async () => {
    vi.mocked(analystModule.runAnalystNode).mockResolvedValueOnce({
      error: "Analyst failed",
    });

    const result = await executeGraph(initialState, mockEnv);

    expect(result.error).toContain("Analyst failed");
    expect(result.approved).toBe(false);
  });

  it("handles auditor errors gracefully", async () => {
    vi.mocked(analystModule.runAnalystNode).mockResolvedValueOnce({
      analystDraft: {
        sections: [{ id: "summary", title: "Summary", content: "Test" }],
        generatedAt: new Date().toISOString(),
      },
      iterationCount: 1,
    });

    vi.mocked(auditorModule.runAuditorNode).mockResolvedValueOnce({
      error: "Auditor failed",
    });

    const result = await executeGraph(initialState, mockEnv);

    expect(result.error).toContain("Auditor failed");
    expect(result.approved).toBe(false);
  });

  it("stops after max iterations without approval", async () => {
    let callCount = 0;

    // Mock analyst to always return a draft
    vi.mocked(analystModule.runAnalystNode).mockImplementation(async () => {
      callCount++;
      return {
        analystDraft: {
          sections: [{ id: "summary", title: "Summary", content: `Iteration ${callCount}` }],
          generatedAt: new Date().toISOString(),
        },
        iterationCount: callCount,
      };
    });

    // Mock auditor to always reject (never approve)
    vi.mocked(auditorModule.runAuditorNode).mockResolvedValue({
      auditResult: {
        approved: false,
        corrections: [
          {
            claim: "Test claim",
            issue: "Test issue",
            fix: "Test fix",
          },
        ],
        checklist: {
          numericalAccuracy: false,
          noHallucinations: true,
          logicConsistency: true,
          citationFormat: true,
        },
      },
      approved: false,
    });

    const result = await executeGraph(initialState, mockEnv);

    expect(result.approved).toBe(false);
    expect(result.error).toContain("Max iterations");
    expect(result.iterationCount).toBe(2); // Should have attempted 2 iterations (0->1->2)
  });

  it("exits early on timeout", async () => {
    vi.mocked(analystModule.runAnalystNode).mockResolvedValueOnce({
      timeout: true,
      error: "Analyst timeout",
    });

    const result = await executeGraph(initialState, mockEnv);

    expect(result.timeout).toBe(true);
    expect(result.error).toContain("timeout");
    expect(result.approved).toBe(false);
  });
});
