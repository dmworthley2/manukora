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
    readonly revenueOpportunity: number;
    readonly monthsOfCover: number;
    readonly momentumTrend: "GROWING" | "DECLINING" | "STABLE";
    readonly daysOfCover: number;
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
 * Calculate days of cover from months of cover (30-day months).
 */
export declare function daysOfCover(monthsOfCover: number): number;
/**
 * Assess cover risk level based on days of cover and target months.
 */
export declare function assessCoverRisk(daysOfCoverValue: number, targetMonthsCover: number): "critical" | "high" | "medium" | "low";
/**
 * Detect conflict: high revenue opportunity but declining trend.
 * Used in rationale generation to flag conflicting signals.
 */
export declare function detectRevenueVsTrendConflict(revenueOpportunity: number, momentumTrend: string, daysOfCoverValue: number): boolean;
/**
 * Analyze sell-through performance: top performers, poor performers, decliners.
 */
export declare function getSellThroughAnalysis(feedRows: AgentReasoningFeedRow[]): {
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
};
/**
 * Calculate reorder recommendations from reasoning feed.
 * Applies special case logic for Propolis, MGO 1700+, and Bioactive Blends.
 */
export declare function calculateReorderRecommendations(feedRows: AgentReasoningFeedRow[]): {
    readonly recommendations: readonly ReorderRecommendation[];
    readonly flags: readonly SpecialCaseFlag[];
};
//# sourceMappingURL=inventory-metrics.d.ts.map