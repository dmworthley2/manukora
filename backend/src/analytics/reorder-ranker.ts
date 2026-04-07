/**
 * Reorder ranking logic for prioritizing inventory replenishment.
 * Ranks SKUs by revenue opportunity, conflict detection, and days of cover.
 * Categorizes recommendations for different decision workflows.
 */

import { calculateReorderRecommendations, detectRevenueVsTrendConflict } from "./inventory-metrics.js";
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
export function rankReorders(
  feedRows: AgentReasoningFeedRow[],
  minRiskLevel: "critical" | "high" | "medium" = "medium",
): readonly ReorderRecommendation[] {
  const { recommendations } = calculateReorderRecommendations(feedRows);

  // Filter by minimum risk level
  const riskLevelPriority = { critical: 3, high: 2, medium: 1, low: 0 };
  const minRiskScore = riskLevelPriority[minRiskLevel];

  const filtered = recommendations.filter(
    (r) => riskLevelPriority[r.riskLevel] >= minRiskScore
  );

  // Return top 5 (or fewer)
  return filtered.slice(0, 5).map((r, idx) => ({
    ...r,
    rank: idx + 1,
  }));
}

/**
 * Categorization result for grouping recommendations by decision workflow.
 */
export type CategorizedRecommendations = {
  readonly immediate: readonly ReorderRecommendation[]; // Critical cover risk → reorder ASAP
  readonly flaggedForReview: readonly ReorderRecommendation[]; // High revenue but declining trend → manual review
  readonly opportunistic: readonly ReorderRecommendation[]; // Growing demand → increase allocation
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
export function categorizeByConflict(
  recommendations: readonly ReorderRecommendation[],
): CategorizedRecommendations {
  const immediate: ReorderRecommendation[] = [];
  const flaggedForReview: ReorderRecommendation[] = [];
  const opportunistic: ReorderRecommendation[] = [];

  for (const rec of recommendations) {
    // IMMEDIATE: Critical cover risk
    if (rec.riskLevel === "critical") {
      immediate.push(rec);
      continue;
    }

    // CONFLICT: High revenue + declining trend
    const hasConflict = detectRevenueVsTrendConflict(
      rec.revenueOpportunity,
      rec.momentumTrend,
      rec.daysOfCover
    );

    if (hasConflict) {
      flaggedForReview.push(rec);
      continue;
    }

    // OPPORTUNISTIC: Growing demand
    if (rec.momentumTrend === "GROWING") {
      opportunistic.push(rec);
      continue;
    }

    // Note: STABLE trend without conflict or critical risk is not categorized
    // (would be handled as routine reorder via standard procurement process)
  }

  // Sort within each category by rank
  immediate.sort((a, b) => a.rank - b.rank);
  flaggedForReview.sort((a, b) => a.rank - b.rank);
  opportunistic.sort((a, b) => a.rank - b.rank);

  return { immediate, flaggedForReview, opportunistic };
}
