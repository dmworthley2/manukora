import type { BriefingState } from "./types.js";
import type { Env } from "../env.js";
import type { FactBundle } from "../analytics/fact-bundle.js";
/**
 * Main entry point: Run the briefing generation workflow.
 * Orchestrates Analyst → Auditor with max 2 iterations, 5-minute total timeout.
 *
 * @param factBundle - Source data for briefing
 * @param uploadId - Upload ID for tracking
 * @param period - Report period (e.g., "2026-04")
 * @param env - Environment config (Anthropic API key, model, temperature)
 * @returns Final state with approved briefing or error details
 */
export declare function runBriefingWorkflow(factBundle: FactBundle, uploadId: string, period: string, env: Env): Promise<BriefingState>;
/**
 * Helper to determine if workflow succeeded.
 */
export declare function isWorkflowApproved(state: BriefingState): boolean;
//# sourceMappingURL=orchestration.d.ts.map