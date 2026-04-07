import type { SupabaseAdminClient } from "../supabase/admin-client.js";
import type { BriefingState } from "./types.js";
import type { Env } from "../env.js";
import type { FactBundle } from "../analytics/fact-bundle.js";
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
export declare function runBriefingWorkflow(factBundle: FactBundle, reportRunId: string, period: string, env: Env, client: SupabaseAdminClient, inventoryReasoningFeed?: unknown): Promise<BriefingState>;
/**
 * Helper to determine if workflow succeeded (briefing is final and approved, not escalated).
 */
export declare function isWorkflowApproved(state: BriefingState): boolean;
//# sourceMappingURL=orchestration.d.ts.map