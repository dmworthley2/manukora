/**
 * Deterministic analytics metrics computation.
 * All metrics are computed directly from source data; no LLM invention.
 */
import type { CommercialDataRow } from "./csv-parser.js";
/**
 * Monthly performance metrics for a single SKU.
 */
export type SkuMonthMetrics = {
    readonly sku: string;
    readonly period: string;
    readonly unitsSold: number;
    readonly revenue: number;
    readonly avgSellingPrice: number;
    readonly onHandInventory: number;
    readonly estimatedVelocity: number;
    readonly daysOfCover: number;
};
/**
 * Trend analysis for a SKU across multiple months.
 */
export type SkuTrend = {
    readonly sku: string;
    readonly periods: readonly string[];
    readonly unitsTrend: readonly number[];
    readonly revenueTrend: readonly number[];
    readonly isDecline: boolean;
    readonly trend: "stable" | "growth" | "decline" | "insufficient";
};
/**
 * Cover risk assessment (low/medium/high).
 */
export type CoverRiskLevel = "low" | "medium" | "high";
export type SkuCoverRisk = {
    readonly sku: string;
    readonly riskLevel: CoverRiskLevel;
    readonly daysOfCover: number;
    readonly reason: string;
};
/**
 * Commercial value at risk: inventory × (retail price - cogs if available).
 */
export type SkuValueAtRisk = {
    readonly sku: string;
    readonly period: string;
    readonly onHandInventory: number;
    readonly unitPrice: number;
    readonly costPerUnit: number | null;
    readonly valueAtRisk: number;
};
/**
 * Compute month metrics for a single row.
 */
export declare function computeMonthMetrics(row: CommercialDataRow): SkuMonthMetrics;
/**
 * Analyze trend for a SKU across periods (sorted chronologically).
 */
export declare function analyzeTrend(rows: readonly CommercialDataRow[]): SkuTrend;
/**
 * Assess cover risk based on days of cover.
 * Low: >60 days, Medium: 20-60 days, High: <20 days.
 */
export declare function assessCoverRisk(metrics: SkuMonthMetrics): SkuCoverRisk;
/**
 * Compute commercial value at risk (inventory value exposed to slow-move or decline).
 */
export declare function computeValueAtRisk(row: CommercialDataRow): SkuValueAtRisk;
/**
 * Rank SKUs by value at risk, descending (highest risk first).
 * Note: filterRisk parameter reserved for future use; currently returns all values ranked.
 */
export declare function rankByValueAtRisk(values: readonly SkuValueAtRisk[], _filterRisk?: CoverRiskLevel): readonly SkuValueAtRisk[];
/**
 * Group rows by SKU for trend analysis.
 */
export declare function groupBySku(rows: readonly CommercialDataRow[]): Map<string, CommercialDataRow[]>;
//# sourceMappingURL=metrics.d.ts.map