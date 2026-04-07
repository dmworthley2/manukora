/**
 * Briefing Section Service
 * Convenience methods and queries for individual section operations.
 * Wraps briefing_section table for efficient UX queries.
 */

import type { SupabaseAdminClient } from "../supabase/admin-client.js";
import type { BriefingSectionRow } from "../db/types.js";
import { log } from "../lib/log.js";

// ============================================================================
// SECTION QUERIES
// ============================================================================

/**
 * Get sections by approval status.
 */
export async function getSectionsByStatus(
  client: SupabaseAdminClient,
  blackboardId: string,
  status: "approved" | "challenged" | "escalated" | "pending",
): Promise<BriefingSectionRow[]> {
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
  } catch (err) {
    log.error(
      `Section query error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Get approved sections.
 */
export async function getApprovedSections(
  client: SupabaseAdminClient,
  blackboardId: string,
): Promise<BriefingSectionRow[]> {
  return getSectionsByStatus(client, blackboardId, "approved");
}

/**
 * Get escalated sections (unresolved conflicts).
 */
export async function getEscalatedSections(
  client: SupabaseAdminClient,
  blackboardId: string,
): Promise<BriefingSectionRow[]> {
  return getSectionsByStatus(client, blackboardId, "escalated");
}

/**
 * Get sections still under review (auditor hasn't reviewed yet).
 */
export async function getPendingSections(
  client: SupabaseAdminClient,
  blackboardId: string,
): Promise<BriefingSectionRow[]> {
  return getSectionsByStatus(client, blackboardId, "pending");
}

// ============================================================================
// SECTION SUMMARIES
// ============================================================================

export interface SectionSummary {
  section_id: string;
  title: string;
  status: "approved" | "challenged" | "escalated" | "pending";
  analyst_submitted: boolean;
  auditor_reviewed: boolean;
  analyst_responded: boolean;
  is_approved: boolean;
  escalation_summary?: string;
}

/**
 * Get a summary of all sections for the briefing.
 * Used by Executive Summary page to show status overview.
 */
export async function getPublicSectionSummaries(
  client: SupabaseAdminClient,
  blackboardId: string,
): Promise<SectionSummary[]> {
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

    return (data || []).map((section: BriefingSectionRow): SectionSummary => ({
      section_id: section.section_id,
      title: section.title || section.section_id,
      status: (section.auditor_status || "pending") as "approved" | "challenged" | "escalated" | "pending",
      analyst_submitted: !!section.analyst_draft,
      auditor_reviewed: !!section.auditor_reviewed_at,
      analyst_responded: !!section.analyst_response,
      is_approved: !!section.is_approved,
      escalation_summary: section.escalation_reason || undefined,
    }));
  } catch (err) {
    log.error(
      `Section summary error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// ============================================================================
// CONFLICT SUMMARY
// ============================================================================

export interface ConflictDetail {
  section_id: string;
  title: string;
  analyst_position: string;
  auditor_position: string;
  escalation_reason: string;
}

/**
 * Get all escalated sections formatted for CEO review.
 * Shows analyst position vs. auditor position for each conflict.
 */
export async function getConflictsForCEO(
  client: SupabaseAdminClient,
  blackboardId: string,
): Promise<ConflictDetail[]> {
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
  } catch (err) {
    log.error(
      `Conflict summary error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// ============================================================================
// SECTION DETAIL (for UX component)
// ============================================================================

export interface SectionDetail {
  section_id: string;
  title: string;
  analyst_draft: string | null;
  analyst_reasoning: string | null;
  auditor_status: string | null;
  auditor_challenges: any; // JSONB array of challenges
  auditor_notes: string | null;
  analyst_response: string | null;
  resolution_type: string | null;
  is_approved: boolean;
  escalation_reason: string | null;
  analyst_position: string | null;
  auditor_position: string | null;
}

/**
 * Get full section detail for rendering in UI.
 * Returns all analyst + auditor + resolution data for a single section.
 */
export async function getSectionDetail(
  client: SupabaseAdminClient,
  blackboardId: string,
  sectionId: string,
): Promise<SectionDetail | null> {
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

    if (!data) return null;

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
  } catch (err) {
    log.error(
      `Section detail error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
