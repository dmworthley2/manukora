/**
 * Briefing Section Service
 * Convenience methods and queries for individual section operations.
 * Wraps briefing_section table for efficient UX queries.
 */
import type { SupabaseAdminClient } from "../supabase/admin-client.js";
import type { BriefingSectionRow } from "../db/types.js";
/**
 * Get sections by approval status.
 */
export declare function getSectionsByStatus(client: SupabaseAdminClient, blackboardId: string, status: "approved" | "challenged" | "escalated" | "pending"): Promise<BriefingSectionRow[]>;
/**
 * Get approved sections.
 */
export declare function getApprovedSections(client: SupabaseAdminClient, blackboardId: string): Promise<BriefingSectionRow[]>;
/**
 * Get escalated sections (unresolved conflicts).
 */
export declare function getEscalatedSections(client: SupabaseAdminClient, blackboardId: string): Promise<BriefingSectionRow[]>;
/**
 * Get sections still under review (auditor hasn't reviewed yet).
 */
export declare function getPendingSections(client: SupabaseAdminClient, blackboardId: string): Promise<BriefingSectionRow[]>;
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
export declare function getPublicSectionSummaries(client: SupabaseAdminClient, blackboardId: string): Promise<SectionSummary[]>;
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
export declare function getConflictsForCEO(client: SupabaseAdminClient, blackboardId: string): Promise<ConflictDetail[]>;
export interface SectionDetail {
    section_id: string;
    title: string;
    analyst_draft: string | null;
    analyst_reasoning: string | null;
    auditor_status: string | null;
    auditor_challenges: any;
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
export declare function getSectionDetail(client: SupabaseAdminClient, blackboardId: string, sectionId: string): Promise<SectionDetail | null>;
//# sourceMappingURL=briefing-section.d.ts.map