import type { FactBundle } from "../analytics/fact-bundle.js";
import type { AgentReasoningFeedRow } from "../db/types.js";

/**
 * Analyst-drafted section (all 5 sections generated in one LLM call).
 * Includes narrative + reasoning for CFO review.
 */
export interface AnalystDraftedSection {
  readonly section_id: string;
  readonly title: string;
  readonly analyst_draft: string;
  readonly analyst_reasoning: string;
}

/**
 * Auditor challenge to analyst (section-specific).
 */
export interface AuditorChallenge {
  readonly id: string; // "ch-1", "ch-2", etc.
  readonly type: "numerical" | "hallucination" | "assumption" | "tradeoff" | "policy";
  readonly claim: string;
  readonly question: string;
  readonly evidence: string;
  readonly severity: "error" | "assumption" | "concern";
  readonly requestedAction: string;
}

/**
 * Auditor review per section (alias for AuditorReview from briefing-blackboard).
 */
export type AuditorSectionReview = {
  readonly section_id: string;
  readonly auditor_status: "approved" | "challenged" | "escalated";
  readonly auditor_challenges?: readonly AuditorChallenge[];
  readonly auditor_notes?: string;
};

/**
 * Analyst response to auditor challenges (per section).
 */
export interface AnalystResponseToChallenge {
  readonly section_id: string;
  readonly analyst_response: string;
  readonly resolution_type: "accepted" | "clarified" | "escalated";
  readonly analyst_position?: string; // If escalated
}

/**
 * Complete state for the briefing generation workflow (Blackboard pattern).
 * Tracks: Analyst draft → Auditor review → Analyst response → Auditor final decision
 */
export interface BriefingState {
  readonly factBundle: FactBundle;
  readonly reportRunId: string; // Link to report_runs table
  readonly blackboardId?: string; // Created after analyst drafts
  readonly period: string;

  // Inventory context (optional)
  readonly inventoryReasoningFeed?: readonly AgentReasoningFeedRow[] | null;

  // Workflow phase (state machine)
  readonly phase:
    | "initializing"
    | "analyst-drafting"
    | "auditor-reviewing"
    | "analyst-responding"
    | "auditor-finalizing"
    | "complete";

  readonly iterationCount: number; // 1 or 2 (max 2)

  // Analyst work
  readonly analystDraft?: readonly AnalystDraftedSection[]; // All 5 sections
  readonly analyst_submitted_at?: string;

  // Auditor work
  readonly auditorReviews?: readonly AuditorSectionReview[]; // Per section
  readonly auditor_completed_review_at?: string;

  // Analyst response to challenges
  readonly analystResponses?: readonly AnalystResponseToChallenge[]; // Responses to challenges
  readonly analyst_completed_response_at?: string;

  // Auditor final decisions (after analyst response round)
  readonly auditorFinalDecisions?: readonly {
    readonly section_id: string;
    readonly is_approved: boolean;
    readonly escalation_reason?: string;
    readonly auditor_position?: string;
  }[];

  // Final approval
  readonly is_final?: boolean;
  readonly overall_status?: "in-progress" | "under-review" | "responding" | "approved" | "escalated-to-ceo";
  readonly approval_summary?: {
    readonly total: number;
    readonly approved: number;
    readonly escalated: number;
    readonly pending: number;
  };

  // Error tracking
  readonly error?: string;
  readonly timeout?: boolean;
}

/**
 * Final approved briefing, ready for storage.
 * Contains all 5 sections and metadata.
 */
export interface ApprovedBriefing {
  readonly sections: readonly AnalystDraftedSection[];
  readonly iterationsRequired: number;
  readonly auditApprovedAt: string;
  readonly factBundleSummary: {
    readonly period: string;
    readonly totalRevenue: number;
    readonly highRiskSkuCount: number;
    readonly recommendationCount: number;
  };
}
