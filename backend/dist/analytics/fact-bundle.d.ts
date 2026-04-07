/**
 * Fact bundle builder: constructs machine-readable JSON fact bundle for LangGraph.
 * This is the single source of numeric truth for the briefing.
 * Numbers SHALL NOT originate from unconstrained LLM generation.
 */
import type { CommercialDataRow } from "./csv-parser.js";
import { type SkuMonthMetrics, type SkuTrend, type SkuCoverRisk, type SkuValueAtRisk } from "./metrics.js";
import type { ReorderRecommendation as InventoryReorderRecommendation, SpecialCaseFlag } from "./inventory-metrics.js";
/**
 * Reorder recommendation with structured rationale.
 */
export type ReorderRecommendation = {
    readonly rank: number;
    readonly sku: string;
    readonly reason: "high_value_at_risk" | "declining_trend" | "critical_cover";
    readonly rationale: string;
    readonly suggestedAction: string;
    readonly metrics: {
        readonly valueAtRisk: number;
        readonly daysOfCover: number;
        readonly unitsTrend: readonly number[];
    };
};
/**
 * Proactive risk flag (e.g., declining demand conflict with high stock).
 */
export type ProactiveRisk = {
    readonly sku: string;
    readonly type: "demand_decline" | "overstocked" | "slow_moving";
    readonly severity: "low" | "medium" | "high";
    readonly description: string;
    readonly suggestedMitigation: string;
};
/**
 * Complete fact bundle: machine-readable JSON for LangGraph consumption.
 * All numbers are deterministically computed; Auditor verifies alignment before finalization.
 */
export type FactBundle = {
    readonly metadata: {
        readonly period: string;
        readonly generatedAt: string;
        readonly inputRowCount: number;
        readonly uniqueSkus: number;
    };
    readonly skuMetrics: readonly SkuMonthMetrics[];
    readonly trends: readonly SkuTrend[];
    readonly coverRisks: readonly SkuCoverRisk[];
    readonly valueAtRisk: readonly SkuValueAtRisk[];
    readonly reorderRecommendations: readonly ReorderRecommendation[];
    readonly proactiveRisks: readonly ProactiveRisk[];
    readonly summary: {
        readonly totalRevenue: number;
        readonly totalUnitssSold: number;
        readonly highRiskSkus: number;
        readonly decliningSku: number;
    };
    readonly inventoryAnalysis?: {
        readonly reorderRecommendations: readonly InventoryReorderRecommendation[];
        readonly sellThroughAnalysis: {
            readonly topPerformers: readonly string[];
            readonly poorPerformers: readonly string[];
            readonly decliners: readonly string[];
        };
        readonly coverRisks: {
            readonly critical: readonly string[];
            readonly high: readonly string[];
            readonly medium: readonly string[];
        };
        readonly specialCases: readonly SpecialCaseFlag[];
    };
};
/**
 * Build complete fact bundle from parsed CSV data.
 * This is deterministic: same input always produces same output.
 */
export declare function buildFactBundle(rows: readonly CommercialDataRow[]): FactBundle;
//# sourceMappingURL=fact-bundle.d.ts.map