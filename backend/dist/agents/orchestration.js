import { executeGraph } from "./graph.js";
import { withTimeout } from "../lib/timeout.js";
/**
 * Main entry point: Run the briefing generation workflow (blackboard pattern).
 * Orchestrates: Analyst draft → Auditor review → Analyst response → Auditor finalize.
 * Max 2 iterations, 5-minute total timeout, section-level granularity.
 *
 * @param factBundle - Source data for briefing
 * @param reportRunId - Report run ID for blackboard creation
 * @param period - Report period (e.g., "2026-04")
 * @param env - Environment config (Anthropic API key, model, temperature)
 * @param client - Supabase admin client for blackboard operations
 * @param inventoryReasoningFeed - Optional agent reasoning feed for inventory context
 * @returns Final state with blackboard ID and approval status
 */
export async function runBriefingWorkflow(factBundle, reportRunId, period, env, client, inventoryReasoningFeed) {
    const initialState = {
        factBundle,
        reportRunId,
        period,
        inventoryReasoningFeed: inventoryReasoningFeed && Array.isArray(inventoryReasoningFeed)
            ? inventoryReasoningFeed
            : null,
        iterationCount: 0,
        phase: "initializing",
    };
    try {
        const finalState = await withTimeout(executeGraph(initialState, env, client), 300000);
        return finalState;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("timeout")) {
            return {
                ...initialState,
                error: "Briefing workflow timeout (5 minutes exceeded)",
                timeout: true,
                phase: "complete",
            };
        }
        // Graph execution failed
        return {
            ...initialState,
            error: `Workflow failed: ${message}`,
            phase: "complete",
        };
    }
}
/**
 * Helper to determine if workflow succeeded (briefing is final and approved, not escalated).
 */
export function isWorkflowApproved(state) {
    return !!(state.is_final && state.overall_status === "approved" && !state.error && !state.timeout);
}
//# sourceMappingURL=orchestration.js.map