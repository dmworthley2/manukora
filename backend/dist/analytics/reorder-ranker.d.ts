/**
 * Reorder ranking logic for prioritizing inventory replenishment.
 * Ranks SKUs by revenue opportunity, conflict detection, and days of cover.
 * Categorizes recommendations for different decision workflows.
 */
import type { ReorderRecommendation } from "./inventory-metrics.js";
import type { AgentReasoningFeedRow } from "../db/types.js";
/**
 * Rank SKUs for reorder by:
 * 1. Revenue opportunity (primary sort, DESC)
 * 2. Trend conflict detection (secondary flag)
 * 3. Days of cover (tie-breaker, ASC)
 *
 * Returns top 3–5 recommendations with clear reasoning.
 * Only includes products meeting minimum risk level threshold.
 *
 * @param feedRows - Agent reasoning feed rows with inventory and sales data
 * @param minRiskLevel - Minimum risk level to include ("critical" | "high" | "medium")
 * @returns Ranked recommendations, limited to top 5 (or fewer if fewer meet threshold)
 */
export declare function rankReorders(feedRows: AgentReasoningFeedRow[], minRiskLevel?: "critical" | "high" | "medium"): readonly ReorderRecommendation[];
/**
 * Categorization result for grouping recommendations by decision workflow.
 */
export type CategorizedRecommendations = {
    readonly immediate: readonly ReorderRecommendation[];
    readonly flaggedForReview: readonly ReorderRecommendation[];
    readonly opportunistic: readonly ReorderRecommendation[];
};
/**
 * Filter recommendations by conflict type, grouping into decision categories.
 *
 * - **immediate**: Critical cover risk (critical risk level)
 *   → Reorder immediately to prevent stockout
 *
 * - **flaggedForReview**: High revenue opportunity + declining trend conflict
 *   → Requires manual review: may indicate demand shift or need for promotional strategy
 *
 * - **opportunistic**: Growing demand trend
 *   → Increase allocation to capture revenue growth
 *
 * Recommendations not matching any category are omitted.
 */
export declare function categorizeByConflict(recommendations: readonly ReorderRecommendation[]): CategorizedRecommendations;
//# sourceMappingURL=reorder-ranker.d.ts.map