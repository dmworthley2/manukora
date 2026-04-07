import type { BriefingState } from "./types.js";
/**
 * Auditor finalizer node: Blackboard pattern - auditor makes final decisions.
 * Generates AuditorFinalDecision[] per section after analyst responses.
 * Timeout: 2 minutes
 * Returns: updated state with auditorFinalDecisions
 */
export declare function runAuditorFinalizerNode(state: BriefingState, env: {
    ANTHROPIC_API_KEY?: string;
    LLM_MODEL: string;
    LLM_TEMPERATURE: number;
}): Promise<Partial<BriefingState>>;
//# sourceMappingURL=auditor-finalizer-node.d.ts.map