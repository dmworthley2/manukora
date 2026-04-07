/**
 * Inventory metrics calculator for reorder recommendations.
 * Applies special case logic for Propolis, MGO 1700+, and Bioactive Blends.
 * All calculations are deterministic based on agent_reasoning_feed data.
 */

import type { AgentReasoningFeedRow } from "../db/types.js";

/**
 * Reorder recommendation with reasoning and action guidance.
 */
export type ReorderRecommendation = {
  readonly rank: number;
  readonly sku: string;
  readonly productName: string;
  readonly revenueOpportunity: number; // retail_price × current_demand
  readonly monthsOfCover: number;
  readonly momentumTrend: "GROWING" | "DECLINING" | "STABLE";
  readonly daysOfCover: number; // months_of_cover × 30
  readonly rationale: string;
  readonly recommendedAction: string;
  readonly riskLevel: "critical" | "high" | "medium";
};

/**
 * Special handling flags for products with unique constraints.
 */
export type SpecialCaseFlag = {
  readonly sku: string;
  readonly caseType: "propolis_phaseout" | "mgo_premium" | "bioactive_new_launch";
  readonly guidance: string;
};

/**
 * Detect if a product is Propolis Tincture (being phased out Q2 2026).
 */
function isPropolis(productName: string): boolean {
  return /propolis/i.test(productName);
}

/**
 * Detect if a product is MGO 1700+ 100g (premium, target 3-month cover).
 */
function isMgo1700Premium(productName: string): boolean {
  return /mgo\s*1700\+.*100g/i.test(productName);
}

/**
 * Detect if a product is a Bioactive Blend (Immunity, Energy, Recovery).
 * Launched mid-January 2026 — only assess M2–M4 trend.
 */
function isBioactiveBlend(productName: string): boolean {
  return /bioactive|immunity|energy|recovery/i.test(productName) &&
    /blend/i.test(productName);
}

/**
 * Calculate days of cover from months of cover (30-day months).
 */
export function daysOfCover(monthsOfCover: number): number {
  return Math.round(monthsOfCover * 30);
}

/**
 * Assess cover risk level based on days of cover and target months.
 */
export function assessCoverRisk(
  daysOfCoverValue: number,
  targetMonthsCover: number,
): "critical" | "high" | "medium" | "low" {
  const targetDays = targetMonthsCover * 30;

  if (daysOfCoverValue < 10) return "critical";
  if (daysOfCoverValue < targetDays / 2) return "high";
  if (daysOfCoverValue < targetDays) return "medium";
  return "low";
}

/**
 * Detect conflict: high revenue opportunity but declining trend.
 * Used in rationale generation to flag conflicting signals.
 */
export function detectRevenueVsTrendConflict(
  revenueOpportunity: number,
  momentumTrend: string,
  daysOfCoverValue: number,
): boolean {
  // Conflict exists if revenue is significant but trend is declining
  // and cover is not critically low (which would override concern)
  const isHighRevenue = revenueOpportunity > 5000; // threshold
  const isDeclining = momentumTrend === "DECLINING";
  const isCriticalCover = daysOfCoverValue < 10;

  return isHighRevenue && isDeclining && !isCriticalCover;
}

/**
 * Analyze sell-through performance: top performers, poor performers, decliners.
 */
export function getSellThroughAnalysis(feedRows: AgentReasoningFeedRow[]): {
  readonly topPerformers: readonly {
    readonly sku: string;
    readonly m4_sales: number;
    readonly trend: string;
  }[];
  readonly poorPerformers: readonly {
    readonly sku: string;
    readonly m4_sales: number;
    readonly trend: string;
  }[];
  readonly decliners: readonly {
    readonly sku: string;
    readonly m4_sales: number;
    readonly m1_sales: number;
    readonly decline_pct: number;
  }[];
} {
  // Sort by M4 sales (current demand)
  const byDemand = [...feedRows].sort(
    (a, b) => (b.current_demand || 0) - (a.current_demand || 0)
  );

  const topPerformers = byDemand.slice(0, 5).map((row) => ({
    sku: row.sku,
    m4_sales: row.current_demand || 0,
    trend: row.momentum_trend,
  }));

  const poorPerformers = byDemand.slice(-5).map((row) => ({
    sku: row.sku,
    m4_sales: row.current_demand || 0,
    trend: row.momentum_trend,
  }));

  const decliners = feedRows
    .filter((row) => row.momentum_trend === "DECLINING")
    .map((row) => {
      const decline_pct =
        row.m1_total && row.current_demand
          ? Math.round(((row.m1_total - row.current_demand) / row.m1_total) * 100)
          : 0;
      return {
        sku: row.sku,
        m4_sales: row.current_demand || 0,
        m1_sales: row.m1_total || 0,
        decline_pct,
      };
    })
    .sort((a, b) => b.decline_pct - a.decline_pct);

  return { topPerformers, poorPerformers, decliners };
}

/**
 * Calculate reorder recommendations from reasoning feed.
 * Applies special case logic for Propolis, MGO 1700+, and Bioactive Blends.
 */
export function calculateReorderRecommendations(
  feedRows: AgentReasoningFeedRow[],
): {
  readonly recommendations: readonly ReorderRecommendation[];
  readonly flags: readonly SpecialCaseFlag[];
} {
  const recommendations: ReorderRecommendation[] = [];
  const flags: SpecialCaseFlag[] = [];

  for (const row of feedRows) {
    const days = daysOfCover(row.months_of_cover);
    const coverRisk = assessCoverRisk(days, row.target_months_cover);

    // SPECIAL CASE: Propolis Tincture (being phased out Q2 2026)
    if (isPropolis(row.product_name)) {
      flags.push({
        sku: row.sku,
        caseType: "propolis_phaseout",
        guidance: "Being phased out Q2 2026 — deprioritize unless critical",
      });

      // Only recommend if cover is critically low
      if (days >= 30) {
        continue; // Skip this recommendation if adequate cover
      }
    }

    // SPECIAL CASE: MGO 1700+ 100g (premium pricing, target 3-month cover)
    if (isMgo1700Premium(row.product_name)) {
      flags.push({
        sku: row.sku,
        caseType: "mgo_premium",
        guidance: "Premium pricing, target 3-month cover (not 2)",
      });

      // For MGO 1700+, adjust target to 3 months for risk assessment
      const adjustedCoverRisk = assessCoverRisk(days, 3);
      const adjustedRiskLevel =
        adjustedCoverRisk === "critical"
          ? "critical"
          : adjustedCoverRisk === "high"
            ? "high"
            : "medium";

      const rationale = detectRevenueVsTrendConflict(
        row.revenue_opportunity || 0,
        row.momentum_trend,
        days
      )
        ? `High revenue opportunity ($${Math.round(row.revenue_opportunity || 0)}) but declining trend (${row.momentum_trend}). Premium product requires 3-month cover; currently ${days} days.`
        : `Premium Manuka honey with strong revenue potential ($${Math.round(row.revenue_opportunity || 0)}). Currently ${days} days of cover (target 90 days).`;

      recommendations.push({
        rank: recommendations.length + 1,
        sku: row.sku,
        productName: row.product_name,
        revenueOpportunity: row.revenue_opportunity || 0,
        monthsOfCover: row.months_of_cover,
        momentumTrend: row.momentum_trend,
        daysOfCover: days,
        rationale,
        recommendedAction:
          adjustedRiskLevel === "critical"
            ? "Expedite reorder to 3-month target; premium pricing justifies higher cover."
            : `Order to maintain 3-month cover (${Math.round(3 * (row.current_demand || 0))} units); monitor premium segment demand.`,
        riskLevel: adjustedRiskLevel,
      });

      continue;
    }

    // SPECIAL CASE: Bioactive Blends (launched Jan 2026, only assess M2–M4)
    if (isBioactiveBlend(row.product_name)) {
      flags.push({
        sku: row.sku,
        caseType: "bioactive_new_launch",
        guidance: "Launched mid-January 2026 — only assess M2–M4 trend",
      });

      // For bioactive, note that M1 may include pre-launch zeros
      const rationale =
        coverRisk === "critical"
          ? `New product launch (Jan 2026) with critical stock risk (${days} days of cover). Early-stage trajectory; avoid overestimating based on launch growth.`
          : `Early-stage product (Jan 2026) with ${row.momentum_trend} trend. Current revenue opportunity: $${Math.round(row.revenue_opportunity || 0)}/month. Monitor M2–M4 trend pattern.`;

      recommendations.push({
        rank: recommendations.length + 1,
        sku: row.sku,
        productName: row.product_name,
        revenueOpportunity: row.revenue_opportunity || 0,
        monthsOfCover: row.months_of_cover,
        momentumTrend: row.momentum_trend,
        daysOfCover: days,
        rationale,
        recommendedAction:
          coverRisk === "critical"
            ? "Prioritize reorder to prevent stockout; monitor launch trajectory weekly."
            : `Routine reorder to 2-month target; reassess allocation after full quarter of sales data (Apr 2026).`,
        riskLevel: coverRisk === "critical" ? "critical" : "high",
      });

      continue;
    }

    // STANDARD CASE: All other products
    const hasConflict = detectRevenueVsTrendConflict(
      row.revenue_opportunity || 0,
      row.momentum_trend,
      days
    );

    const rationale = hasConflict
      ? `High revenue at risk ($${Math.round(row.revenue_opportunity || 0)}) but declining trend (${row.momentum_trend}). Cover: ${days} days. Monitor demand before expanding allocation.`
      : coverRisk === "critical"
        ? `Inventory critically low (${days} days of cover). Strong demand: ${row.current_demand} units/month, revenue opportunity: $${Math.round(row.revenue_opportunity || 0)}.`
        : `Revenue opportunity: $${Math.round(row.revenue_opportunity || 0)}/month. Trend: ${row.momentum_trend}. Cover: ${days} days.`;

    const recommendedAction =
      coverRisk === "critical"
        ? `Expedite reorder immediately; order ${Math.round(2 * (row.current_demand || 0))} units to restore 2-month target.`
        : hasConflict
          ? `Reorder cautiously (${Math.round(0.5 * (row.current_demand || 0))} units); monitor declining trend before committing to full allocation.`
          : row.momentum_trend === "GROWING"
            ? `Increase allocation; order ${Math.round(1.5 * (row.current_demand || 0))} units to support growth.`
            : `Routine reorder of ${Math.round(row.current_demand || 0)} units to maintain 2-month cover.`;

    recommendations.push({
      rank: recommendations.length + 1,
      sku: row.sku,
      productName: row.product_name,
      revenueOpportunity: row.revenue_opportunity || 0,
      monthsOfCover: row.months_of_cover,
      momentumTrend: row.momentum_trend,
      daysOfCover: days,
      rationale,
      recommendedAction,
      riskLevel: coverRisk === "low" ? "medium" : coverRisk,
    });
  }

  // Sort recommendations by revenue opportunity (DESC), then by days of cover (ASC)
  recommendations.sort((a, b) => {
    // Critical risk first
    if (a.riskLevel === "critical" && b.riskLevel !== "critical") return -1;
    if (a.riskLevel !== "critical" && b.riskLevel === "critical") return 1;

    // Then by revenue opportunity (descending)
    if (a.revenueOpportunity !== b.revenueOpportunity) {
      return b.revenueOpportunity - a.revenueOpportunity;
    }

    // Tie-break by days of cover (ascending — lower cover = higher priority)
    return a.daysOfCover - b.daysOfCover;
  });

  // Re-rank after sort
  const rankedRecommendations = recommendations.map((r, idx) => ({
    ...r,
    rank: idx + 1,
  })) as readonly ReorderRecommendation[];

  return { recommendations: rankedRecommendations, flags };
}
