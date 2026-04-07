import type { BriefingState } from "./types.js";
/**
 * Auditor node: Blackboard pattern - review analyst sections per section.
 * Generates AuditorReview[] per section with challenges and notes.
 * Timeout: 2 minutes (one pass for all 5 sections)
 * Returns: updated state with auditorReviews
 */
export declare function runAuditorNode(state: BriefingState, env: {
    ANTHROPIC_API_KEY?: string;
    LLM_MODEL: string;
    LLM_TEMPERATURE: number;
}): Promise<Partial<BriefingState>>;
//# sourceMappingURL=auditor-node.d.ts.map