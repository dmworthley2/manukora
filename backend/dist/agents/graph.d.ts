import type { BriefingState } from "./types.js";
import type { SupabaseAdminClient } from "../supabase/admin-client.js";
import type { Env } from "../env.js";
/**
 * Blackboard pattern graph executor: Section-level collaboration.
 * Flow:
 *   START → Create Blackboard
 *        → Analyst (generate 5 sections)
 *        → Submit Analyst Draft
 *        → Auditor (review 5 sections)
 *        → Submit Auditor Challenges
 *        → Router (any challenged? → continue : finalize)
 *        → Analyst Response (respond to challenges)
 *        → Submit Analyst Responses
 *        → Auditor Finalizer (make final calls)
 *        → Finalize Decisions
 *        → [max 2 iterations]
 */
export declare function executeGraph(initialState: BriefingState, env: Env, client?: SupabaseAdminClient): Promise<BriefingState>;
//# sourceMappingURL=graph.d.ts.map