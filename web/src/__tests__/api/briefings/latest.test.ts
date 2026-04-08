/**
 * @jest-environment node
 *
 * Tests for GET /api/briefings/latest
 * Verifies the route returns sections from the most recent blackboard
 * regardless of is_final status.
 */

const mockSupabaseClient = {
  from: jest.fn(),
};

const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockMaybeSingle = jest.fn();

// Chain builder — each method returns the chain object
const chain = {
  select: mockSelect,
  eq: mockEq,
  order: mockOrder,
  limit: mockLimit,
  maybeSingle: mockMaybeSingle,
};

mockSelect.mockReturnValue(chain);
mockEq.mockReturnValue(chain);
mockOrder.mockReturnValue(chain);
mockLimit.mockReturnValue(chain);

jest.mock("@manukora/backend", () => ({
  createSupabaseAdminClient: () => mockSupabaseClient,
  loadEnv: () => ({}),
}));

describe("GET /api/briefings/latest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect.mockReturnValue(chain);
    mockEq.mockReturnValue(chain);
    mockOrder.mockReturnValue(chain);
    mockLimit.mockReturnValue(chain);
    mockSupabaseClient.from.mockReturnValue(chain);
  });

  it("returns 404 when no report runs exist", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const { GET } = await import("@/app/api/briefings/latest/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("No report runs found");
  });

  it("returns 404 when no blackboard exists for the latest run", async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { id: "run-1" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const { GET } = await import("@/app/api/briefings/latest/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("No briefing found for the latest run");
  });

  it("returns 404 when blackboard exists but has no sections", async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { id: "run-1" }, error: null })
      .mockResolvedValueOnce({
        data: { id: "bb-1", report_run_id: "run-1", overall_status: "in-progress", is_final: false, created_at: "2026-04-08T00:00:00Z", conflicts: [], approval_summary: null },
        error: null,
      });

    // sections query returns empty
    mockSelect.mockReturnValueOnce({
      ...chain,
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    mockSupabaseClient.from
      .mockReturnValueOnce(chain) // report_runs
      .mockReturnValueOnce(chain) // briefing_blackboard
      .mockReturnValueOnce({     // briefing_section
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

    const { GET } = await import("@/app/api/briefings/latest/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("No sections written yet");
  });

  it("returns sections regardless of is_final status", async () => {
    const mockBlackboard = {
      id: "bb-1",
      report_run_id: "run-1",
      overall_status: "under-review",
      is_final: false,
      created_at: "2026-04-08T00:00:00Z",
      conflicts: [],
      approval_summary: null,
    };

    const mockSections = [
      {
        section_id: "executive-summary",
        title: "Executive Summary",
        analyst_draft: "Test summary",
        analyst_reasoning: null,
        analyst_submitted_at: null,
        analyst_response: null,
        analyst_position: null,
        auditor_status: "pending",
        auditor_challenges: null,
        auditor_notes: null,
        auditor_reviewed_at: null,
        is_approved: false,
        escalation_reason: null,
        resolution_type: null,
      },
    ];

    mockSupabaseClient.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: { id: "run-1" }, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: mockBlackboard, error: null }),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: mockSections, error: null }),
          }),
        }),
      });

    const { GET } = await import("@/app/api/briefings/latest/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reportRunId).toBe("run-1");
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0].section_id).toBe("executive-summary");
    expect(body.briefing_status.is_final).toBe(false);
  });
});
