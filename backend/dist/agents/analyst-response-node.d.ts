import type { BriefingState } from "./types.js";
/**
 * Analyst response node: Blackboard pattern - analyst responds to auditor challenges.
 * Generates AnalystSectionResponse[] per section with analyst_response and resolution_type.
 * Timeout: 2 minutes
 * Returns: updated state with analystResponses
 */
export declare function runAnalystResponseNode(state: BriefingState, env: {
    ANTHROPIC_API_KEY?: string;
    LLM_MODEL: string;
    LLM_TEMPERATURE: number;
}): Promise<Partial<BriefingState>>;
//# sourceMappingURL=analyst-response-node.d.ts.map