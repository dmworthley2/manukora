import type { BriefingState } from "./types.js";
import { runAnalystNode } from "./analyst-node.js";
import { runAuditorNode } from "./auditor-node.js";
import type { Env } from "../env.js";

/**
 * Simple graph executor: Runs Analyst → Auditor with max 2 iterations.
 * No external StateGraph dependency - pure orchestration logic.
 *
 * Flow:
 *   START → Analyst (generate draft)
 *        → Auditor (verify draft)
 *        → Router (approved? → FINALIZE : continue)
 *        → [if revise] back to Analyst with feedback
 *        → [if max iterations] FAIL
 */
export async function executeGraph(
  initialState: BriefingState,
  env: Env,
): Promise<BriefingState> {
  // Validate required environment for agent execution
  if (!env.ANTHROPIC_API_KEY) {
    return {
      ...initialState,
      error: "ANTHROPIC_API_KEY environment variable is required for briefing generation",
    };
  }

  let state = { ...initialState };

  // Max 2 iterations: 0 (initial) → 1 (first revision) → 2 (final)
  while (state.iterationCount < 2) {
    // Run Analyst node
    try {
      const analystUpdate = await runAnalystNode(state, env);
      state = { ...state, ...analystUpdate };

      if (state.error || state.timeout) {
        return state; // Exit on error/timeout
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ...state, error: `Analyst failed: ${message}` };
    }

    // Run Auditor node
    try {
      const auditorUpdate = await runAuditorNode(state, env);
      state = { ...state, ...auditorUpdate };

      if (state.error || state.timeout) {
        return state; // Exit on error/timeout
      }

      // Check approval
      if (state.approved) {
        return state; // Success - exit loop
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ...state, error: `Auditor failed: ${message}` };
    }

    // If not approved and still iterations left, loop continues (implicit)
  }

  // Max iterations reached without approval
  return {
    ...state,
    error: "Max iterations reached without approval",
  };
}
