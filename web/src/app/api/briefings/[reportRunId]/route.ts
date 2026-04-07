import type { BriefingBlackboardRow, BriefingSectionRow } from "@manukora/backend";
import type { NextRequest } from "next/server";

/**
 * GET /api/briefings/:reportRunId
 * Executive Summary route: Returns full briefing with analyst-auditor dialogue
 *
 * Response includes:
 * - Briefing metadata (status, approval summary)
 * - All 5 sections with analyst draft, reasoning, and auditor feedback
 * - Conflicts (if escalated)
 * - CEO decision point (if escalated)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reportRunId: string }> },
) {
  const { reportRunId } = await params;
  try {
    const { getBlackboard, listSections, createSupabaseAdminClient, loadEnv } = await import(
      "@manukora/backend"
    );

    const env = loadEnv();
    const client = createSupabaseAdminClient(env);

    // Get blackboard state
    const blackboard = (await getBlackboard(client, reportRunId)) as BriefingBlackboardRow | null;

    if (!blackboard) {
      return Response.json(
        { error: "Briefing not found or not finalized" },
        { status: 404 },
      );
    }

    if (!blackboard.is_final) {
      return Response.json(
        { error: "Briefing not yet finalized" },
        { status: 404 },
      );
    }

    // Get all sections for this blackboard
    const sections = (await listSections(client, blackboard.id)) as BriefingSectionRow[];

    // Transform sections to response format
    const sectionResponses = sections.map((section: BriefingSectionRow) => ({
      section_id: section.section_id,
      title: section.title,
      status: section.auditor_status || "pending",

      // Analyst's work
      analyst_draft: section.analyst_draft,
      analyst_reasoning: section.analyst_reasoning,
      analyst_submitted_at: section.analyst_submitted_at,
      analyst_response: section.analyst_response,
      analyst_position: section.analyst_position,

      // Auditor's work
      auditor_status: section.auditor_status,
      auditor_challenges: section.auditor_challenges,
      auditor_notes: section.auditor_notes,
      auditor_reviewed_at: section.auditor_reviewed_at,

      // Final decision
      is_approved: section.is_approved,
      escalation_reason: section.escalation_reason,
      resolution_type: section.resolution_type,
    }));

    // Get conflicts from blackboard
    const conflicts = (blackboard.conflicts as Array<{
      section_id: string;
      escalation_reason: string;
    }>) || [];

    // Build response
    return Response.json(
      {
        reportRunId,
        period: blackboard.created_at?.split("-").slice(0, 2).join("-"),
        created_at: blackboard.created_at,

        briefing_status: {
          overall_status: blackboard.overall_status,
          is_final: blackboard.is_final,
          approval_summary: blackboard.approval_summary,
        },

        sections: sectionResponses,

        conflicts,

        ceo_decision: blackboard.overall_status === "escalated-to-ceo" ? {
          unresolved_conflicts: conflicts,
        } : null,
      },
      {
        headers: {
          "Cache-Control": "max-age=300, must-revalidate",
          ...(blackboard.updated_at && { "ETag": `"${blackboard.updated_at}"` }),
        },
      },
    );
  } catch (error) {
    console.error("Get briefing failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get briefing" },
      { status: 500 },
    );
  }
}
