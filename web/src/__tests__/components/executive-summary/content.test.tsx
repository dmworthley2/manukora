/**
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

jest.mock("remark-gfm", () => ({ __esModule: true, default: () => {} }));

jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(() => ({
    get: jest.fn((key: string) => (key === "reportRunId" ? "test-run-123" : null)),
  })),
}));

jest.mock("@/contexts/DataSourceContext", () => ({
  useDataSource: jest.fn(() => ({
    latestReportRunId: null,
  })),
}));

import ExecutiveSummaryContent from "@/app/dashboard/executive-summary/content";

const makeBriefingResponse = (sections: Array<{
  section_id: string;
  title: string;
  analyst_draft: string;
  analyst_reasoning?: string;
}>) => ({
  reportRunId: "test-run-123",
  period: "April 2026",
  briefing_status: { overall_status: "complete" },
  sections,
});

const BASE_SECTION = {
  section_id: "capital-allocation",
  title: "Capital Allocation Strategy",
  analyst_draft: "Deploy capital toward SKU-A.",
};

function mockFetch(reasoningValue?: string | null) {
  const section = {
    ...BASE_SECTION,
    ...(reasoningValue !== undefined ? { analyst_reasoning: reasoningValue } : {}),
  };

  (global.fetch as jest.Mock)
    // Primary briefing poll
    .mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue(makeBriefingResponse([section])),
    })
    // Metrics side-request (can fail — component ignores errors)
    .mockResolvedValueOnce({ ok: false, json: jest.fn().mockResolvedValue({}) });
}

describe("ExecutiveSummaryContent — Reasoning panel", () => {
  beforeAll(() => {
    global.fetch = jest.fn();
  });

  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  it("does not render Reasoning when analyst_reasoning is absent", async () => {
    mockFetch(undefined);
    render(<ExecutiveSummaryContent />);

    await waitFor(() => {
      expect(screen.getByText("Capital Allocation Strategy")).toBeInTheDocument();
    });

    expect(screen.queryByText("Reasoning")).not.toBeInTheDocument();
  });

  it("does not render Reasoning when analyst_reasoning is whitespace only", async () => {
    mockFetch("   ");
    render(<ExecutiveSummaryContent />);

    await waitFor(() => {
      expect(screen.getByText("Capital Allocation Strategy")).toBeInTheDocument();
    });

    expect(screen.queryByText("Reasoning")).not.toBeInTheDocument();
  });

  it("renders Reasoning summary when analyst_reasoning has content", async () => {
    mockFetch("SKU-A showed declining momentum across all three months.");
    render(<ExecutiveSummaryContent />);

    await waitFor(() => {
      expect(screen.getByText("Reasoning")).toBeInTheDocument();
    });
  });

  it("renders the reasoning text inside the panel", async () => {
    const reasoning = "SKU-A showed declining momentum across all three months.";
    mockFetch(reasoning);
    render(<ExecutiveSummaryContent />);

    await waitFor(() => {
      expect(screen.getByText(reasoning)).toBeInTheDocument();
    });
  });
});
