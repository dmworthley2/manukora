/**
 * Briefing Section Service
 * Convenience methods and queries for individual section operations.
 * Wraps briefing_section table for efficient UX queries.
 */
import { log } from "../lib/log.js";
// ============================================================================
// SECTION QUERIES
// ============================================================================
/**
 * Get sections by approval status.
 */
export async function getSectionsByStatus(client, blackboardId, status) {
    try {
        const { data, error } = await client
            .from("briefing_section")
            .select("*")
            .eq("blackboard_id", blackboardId)
            .eq("auditor_status", status)
            .order("section_id");
        if (error) {
            log.error(`Failed to fetch ${status} sections: ${error.message}`);
            return [];
        }
        return data || [];
    }
    catch (err) {
        log.error(`Section query error: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
}
/**
 * Get approved sections.
 */
export async function getApprovedSections(client, blackboardId) {
    return getSectionsByStatus(client, blackboardId, "approved");
}
/**
 * Get escalated sections (unresolved conflicts).
 */
export async function getEscalatedSections(client, blackboardId) {
    return getSectionsByStatus(client, blackboardId, "escalated");
}
/**
 * Get sections still under review (auditor hasn't reviewed yet).
 */
export async function getPendingSections(client, blackboardId) {
    return getSectionsByStatus(client, blackboardId, "pending");
}
/**
 * Get a summary of all sections for the briefing.
 * Used by Executive Summary page to show status overview.
 */
export async function getPublicSectionSummaries(client, blackboardId) {
    try {
        const { data, error } = await client
            .from("briefing_section")
            .select("*")
            .eq("blackboard_id", blackboardId)
            .order("section_id");
        if (error) {
            log.error(`Failed to fetch section summaries: ${error.message}`);
            return [];
        }
        return (data || []).map((section) => ({
            section_id: section.section_id,
            title: section.title || section.section_id,
            status: (section.auditor_status || "pending"),
            analyst_submitted: !!section.analyst_draft,
            auditor_reviewed: !!section.auditor_reviewed_at,
            analyst_responded: !!section.analyst_response,
            is_approved: !!section.is_approved,
            escalation_summary: section.escalation_reason || undefined,
        }));
    }
    catch (err) {
        log.error(`Section summary error: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
}
/**
 * Get all escalated sections formatted for CEO review.
 * Shows analyst position vs. auditor position for each conflict.
 */
export async function getConflictsForCEO(client, blackboardId) {
    try {
        const escalated = await getEscalatedSections(client, blackboardId);
        return escalated
            .map((section) => ({
            section_id: section.section_id,
            title: section.title || section.section_id,
            analyst_position: section.analyst_position || "",
            auditor_position: section.auditor_position || "",
            escalation_reason: section.escalation_reason || "",
        }))
            .filter((c) => c.analyst_position && c.auditor_position);
    }
    catch (err) {
        log.error(`Conflict summary error: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
}
/**
 * Get full section detail for rendering in UI.
 * Returns all analyst + auditor + resolution data for a single section.
 */
export async function getSectionDetail(client, blackboardId, sectionId) {
    try {
        const { data, error } = await client
            .from("briefing_section")
            .select("*")
            .eq("blackboard_id", blackboardId)
            .eq("section_id", sectionId)
            .maybeSingle();
        if (error) {
            log.error(`Failed to fetch section detail: ${error.message}`);
            return null;
        }
        if (!data)
            return null;
        return {
            section_id: data.section_id,
            title: data.title || data.section_id,
            analyst_draft: data.analyst_draft,
            analyst_reasoning: data.analyst_reasoning,
            auditor_status: data.auditor_status,
            auditor_challenges: data.auditor_challenges,
            auditor_notes: data.auditor_notes,
            analyst_response: data.analyst_response,
            resolution_type: data.resolution_type,
            is_approved: data.is_approved,
            escalation_reason: data.escalation_reason,
            analyst_position: data.analyst_position,
            auditor_position: data.auditor_position,
        };
    }
    catch (err) {
        log.error(`Section detail error: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}
//# sourceMappingURL=briefing-section.js.map