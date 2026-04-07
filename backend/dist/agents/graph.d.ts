import type { BriefingState } from "./types.js";
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
export declare function executeGraph(initialState: BriefingState, env: Env): Promise<BriefingState>;
//# sourceMappingURL=graph.d.ts.map