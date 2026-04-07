import type { BriefingState } from "./types.js";
import { executeGraph } from "./graph.js";
import { withTimeout } from "../lib/timeout.js";
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
export async function runBriefingWorkflow(
  factBundle: FactBundle,
  uploadId: string,
  period: string,
  env: Env,
): Promise<BriefingState> {
  const initialState: BriefingState = {
    factBundle,
    uploadId,
    period,
    iterationCount: 0,
    approved: false,
  };

  try {
    const finalState = await withTimeout(
      executeGraph(initialState, env),
      300000, // 5 minutes total
    );

    return finalState;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("timeout")) {
      return {
        ...initialState,
        error: "Briefing workflow timeout (5 minutes exceeded)",
        timeout: true,
      };
    }

    // Graph execution failed
    return {
      ...initialState,
      error: `Workflow failed: ${message}`,
    };
  }
}

/**
 * Helper to determine if workflow succeeded.
 */
export function isWorkflowApproved(state: BriefingState): boolean {
  return state.approved && !state.error && !state.timeout;
}
