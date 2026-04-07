import type { BriefingState } from "./types.js";
/**
 * Analyst node: Transform FactBundle → BriefingDraft with citations.
 * Timeout: 2 minutes
 * Returns: updated state with analystDraft
 */
export declare function runAnalystNode(state: BriefingState, env: {
    ANTHROPIC_API_KEY?: string;
    LLM_MODEL: string;
    LLM_TEMPERATURE: number;
}): Promise<Partial<BriefingState>>;
//# sourceMappingURL=analyst-node.d.ts.map