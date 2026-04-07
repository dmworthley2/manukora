import type { BriefingState } from "./types.js";
/**
 * Analyst node: Transform FactBundle → 5 AnalystDraftedSection[] with reasoning and certainty factors.
 * Blackboard pattern: All 5 sections generated in one LLM call.
 * Timeout: 2 minutes
 * Returns: updated state with analystDraft (array of sections)
 */
export declare function runAnalystNode(state: BriefingState, env: {
    ANTHROPIC_API_KEY?: string;
    LLM_MODEL: string;
    LLM_TEMPERATURE: number;
}): Promise<Partial<BriefingState>>;
//# sourceMappingURL=analyst-node.d.ts.map