import type { BriefingState } from "./types.js";
/**
 * Auditor node: Verify BriefingDraft against FactBundle.
 * Checks: numerical accuracy, no hallucinations, logic consistency, citation format.
 * Timeout: 1 minute
 * Returns: updated state with auditResult and approved flag
 */
export declare function runAuditorNode(state: BriefingState, env: {
    ANTHROPIC_API_KEY: string;
    LLM_MODEL: string;
    LLM_TEMPERATURE: number;
}): Promise<Partial<BriefingState>>;
//# sourceMappingURL=auditor-node.d.ts.map