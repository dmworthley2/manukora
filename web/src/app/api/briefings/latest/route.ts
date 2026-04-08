import type { BriefingBlackboardRow, BriefingSectionRow } from "@manukora/backend";

/**
 * GET /api/briefings/latest
 * Returns sections from the most recent briefing blackboard, regardless of is_final status.
 * Used by the Retrieve Analysis button after a polling timeout.
 */
export async function GET() {
  try {
    const { createSupabaseAdminClient, loadEnv } = await import("@manukora/backend");

    const env = loadEnv();
    const client = createSupabaseAdminClient(env);

    // Get most recent report run
    const { data: latestRun, error: runError } = await client
      .from("report_runs")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runError || !latestRun) {
      return Response.json({ error: "No report runs found" }, { status: 404 });
    }

    // Get most recent blackboard for that run
    const { data: blackboard, error: bbError } = await client
      .from("briefing_blackboard")
      .select("*")
      .eq("report_run_id", latestRun.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bbError || !blackboard) {
      return Response.json({ error: "No briefing found for the latest run" }, { status: 404 });
    }

    const bb = blackboard as BriefingBlackboardRow;

    // Get sections for that blackboard
    const { data: sections, error: sectionsError } = await client
      .from("briefing_section")
      .select("*")
      .eq("blackboard_id", bb.id)
      .order("section_id");

    if (sectionsError) {
      return Response.json({ error: "Failed to load sections" }, { status: 500 });
    }

    if (!sections || sections.length === 0) {
      return Response.json({ error: "No sections written yet" }, { status: 404 });
    }

    const sectionResponses = (sections as BriefingSectionRow[]).map((section) => ({
      section_id: section.section_id,
      title: section.title,
      status: section.auditor_status || "pending",
      analyst_draft: section.analyst_draft,
      analyst_reasoning: section.analyst_reasoning,
      analyst_submitted_at: section.analyst_submitted_at,
      analyst_response: section.analyst_response,
      analyst_position: section.analyst_position,
      auditor_status: section.auditor_status,
      auditor_challenges: section.auditor_challenges,
      auditor_notes: section.auditor_notes,
      auditor_reviewed_at: section.auditor_reviewed_at,
      is_approved: section.is_approved,
      escalation_reason: section.escalation_reason,
      resolution_type: section.resolution_type,
    }));

    const conflicts = (bb.conflicts as Array<{ section_id: string; escalation_reason: string }>) || [];

    return Response.json({
      reportRunId: latestRun.id,
      period: bb.created_at?.split("-").slice(0, 2).join("-"),
      created_at: bb.created_at,
      briefing_status: {
        overall_status: bb.overall_status,
        is_final: bb.is_final,
        approval_summary: bb.approval_summary,
      },
      sections: sectionResponses,
      conflicts,
      ceo_decision: bb.overall_status === "escalated-to-ceo" ? { unresolved_conflicts: conflicts } : null,
    });
  } catch (error) {
    console.error("Get latest briefing failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get briefing" },
      { status: 500 },
    );
  }
}
