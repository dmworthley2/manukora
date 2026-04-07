/**
 * Briefing Blackboard Service
 * Section-level state management for analyst-auditor collaboration.
 * Manages master briefing state with conflict tracking.
 */
import type { SupabaseAdminClient } from "../supabase/admin-client.js";
import type { BriefingBlackboardRow, AuditChallenge } from "../db/types.js";
/**
 * Create a new briefing blackboard for a report run.
 * Initializes with empty sections and overall_status = "in-progress".
 */
export declare function createBlackboard(client: SupabaseAdminClient, reportRunId: string, iteration?: number): Promise<{
    success: boolean;
    blackboardId?: string;
    error?: string;
}>;
export interface AnalystSection {
    section_id: string;
    title: string;
    analyst_draft: string;
    analyst_reasoning?: string;
}
/**
 * Submit analyst draft: all 5 sections at once.
 * Creates briefing_section rows and updates blackboard state.
 */
export declare function submitAnalystDraft(client: SupabaseAdminClient, blackboardId: string, sections: AnalystSection[]): Promise<{
    success: boolean;
    error?: string;
}>;
export interface AuditorReview {
    section_id: string;
    auditor_status: "approved" | "challenged" | "escalated";
    auditor_challenges?: AuditChallenge[];
    auditor_notes?: string;
}
/**
 * Submit auditor review: challenges per section.
 * Updates briefing_section rows with auditor feedback.
 */
export declare function submitAuditorChallenges(client: SupabaseAdminClient, blackboardId: string, reviews: AuditorReview[]): Promise<{
    success: boolean;
    error?: string;
}>;
export interface AnalystSectionResponse {
    section_id: string;
    analyst_response: string;
    resolution_type: "accepted" | "clarified" | "escalated";
    analyst_position?: string;
}
/**
 * Submit analyst responses to auditor challenges.
 * Updates briefing_section rows with analyst feedback.
 */
export declare function submitAnalystResponses(client: SupabaseAdminClient, blackboardId: string, responses: AnalystSectionResponse[]): Promise<{
    success: boolean;
    error?: string;
}>;
export interface AuditorFinalDecision {
    section_id: string;
    is_approved: boolean;
    escalation_reason?: string;
    auditor_position?: string;
}
export interface FinalizeResult {
    success: boolean;
    totalApproved: number;
    totalEscalated: number;
    conflicts: Array<{
        section_id: string;
        reason: string;
    }>;
    error?: string;
}
/**
 * Finalize auditor decisions: mark sections as approved or escalated.
 * Creates conflicts array if any sections are escalated.
 * Sets is_final = true and overall_status = "approved" or "escalated-to-ceo".
 */
export declare function finalizeAuditorDecisions(client: SupabaseAdminClient, blackboardId: string, decisions: AuditorFinalDecision[]): Promise<FinalizeResult>;
/**
 * Get full blackboard state for a report run (latest iteration).
 */
export declare function getBlackboard(client: SupabaseAdminClient, reportRunId: string): Promise<BriefingBlackboardRow | null>;
/**
 * Get all sections for a blackboard.
 */
export declare function listSections(client: SupabaseAdminClient, blackboardId: string): Promise<any[]>;
/**
 * Get a single section by ID.
 */
export declare function getSection(client: SupabaseAdminClient, blackboardId: string, sectionId: string): Promise<any>;
//# sourceMappingURL=briefing-blackboard.d.ts.map