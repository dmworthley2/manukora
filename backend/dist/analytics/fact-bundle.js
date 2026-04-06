/**
 * Fact bundle builder: constructs machine-readable JSON fact bundle for LangGraph.
 * This is the single source of numeric truth for the briefing.
 * Numbers SHALL NOT originate from unconstrained LLM generation.
 */
import { computeMonthMetrics, analyzeTrend, assessCoverRisk, computeValueAtRisk, groupBySku, rankByValueAtRisk, } from "./metrics.js";
/**
 * Build complete fact bundle from parsed CSV data.
 * This is deterministic: same input always produces same output.
 */
export function buildFactBundle(rows) {
    if (rows.length === 0) {
        throw new Error("Cannot build fact bundle from empty rows");
    }
    // Group by period for summary
    const periods = new Set(rows.map((r) => r.period));
    const currentPeriod = Array.from(periods).sort().pop();
    if (!currentPeriod) {
        throw new Error("No valid period found in data");
    }
    const currentRows = rows.filter((r) => r.period === currentPeriod);
    // Compute metrics for all rows
    const skuMetrics = currentRows.map((row) => computeMonthMetrics(row));
    // Group by SKU for trend analysis
    const skuGroups = groupBySku(rows);
    const trends = [];
    for (const [, skuRows] of skuGroups) {
        try {
            const trend = analyzeTrend(skuRows);
            trends.push(trend);
        }
        catch {
            // Insufficient history for this SKU; skip trend analysis
        }
    }
    // Assess cover risk
    const coverRisks = skuMetrics.map((m) => assessCoverRisk(m));
    // Compute value at risk
    const valueAtRisk = currentRows.map((row) => computeValueAtRisk(row));
    // Rank by value at risk (descending)
    const rankedValues = rankByValueAtRisk(valueAtRisk);
    // Generate reorder recommendations (top 3+)
    const recommendations = generateRecommendations(rankedValues, coverRisks, trends, skuMetrics);
    // Identify proactive risks
    const proactiveRisks = identifyProactiveRisks(coverRisks, trends);
    // Compute summary
    const summary = {
        totalRevenue: currentRows.reduce((sum, r) => sum + r.revenue, 0),
        totalUnitssSold: currentRows.reduce((sum, r) => sum + r.unitsSold, 0),
        highRiskSkus: coverRisks.filter((r) => r.riskLevel === "high").length,
        decliningSku: trends.filter((t) => t.isDecline).length,
    };
    return {
        metadata: {
            period: currentPeriod,
            generatedAt: new Date().toISOString(),
            inputRowCount: rows.length,
            uniqueSkus: new Set(rows.map((r) => r.sku)).size,
        },
        skuMetrics,
        trends,
        coverRisks,
        valueAtRisk: rankedValues,
        reorderRecommendations: recommendations,
        proactiveRisks,
        summary,
    };
}
function generateRecommendations(valueAtRisk, coverRisks, trends, metrics) {
    const recommendations = [];
    const seen = new Set();
    let rank = 1;
    // Create lookup maps
    const riskMap = new Map(coverRisks.map((r) => [r.sku, r]));
    const trendMap = new Map(trends.map((t) => [t.sku, t]));
    const metricsMap = new Map(metrics.map((m) => [m.sku, m]));
    const valueMap = new Map(valueAtRisk.map((v) => [v.sku, v]));
    // Top value-at-risk SKUs
    for (const val of valueAtRisk) {
        if (recommendations.length >= 3)
            break;
        if (seen.has(val.sku))
            continue;
        const risk = riskMap.get(val.sku);
        const trend = trendMap.get(val.sku);
        const metric = metricsMap.get(val.sku);
        if (!risk || !metric)
            continue;
        const reason = risk.riskLevel === "high" ? "critical_cover" : "high_value_at_risk";
        const rationale = risk.riskLevel === "high"
            ? `Inventory position is critical (${risk.daysOfCover} days of cover). Current value at risk: $${Math.round(val.valueAtRisk)}.`
            : `High commercial value at risk ($${Math.round(val.valueAtRisk)}) with moderate inventory position (${risk.daysOfCover} days of cover).`;
        const suggestedAction = risk.riskLevel === "high"
            ? "Prioritize immediate reorder to restore inventory health."
            : trend?.isDecline
                ? "Reorder cautiously; monitor demand trend before committing to large volumes."
                : "Routine reorder to maintain coverage and capitalize on strong sell-through.";
        recommendations.push({
            rank,
            sku: val.sku,
            reason,
            rationale,
            suggestedAction,
            metrics: {
                valueAtRisk: Math.round(val.valueAtRisk),
                daysOfCover: risk.daysOfCover,
                unitsTrend: trend?.unitsTrend || [metric.unitsSold],
            },
        });
        seen.add(val.sku);
        rank++;
    }
    // Add declining SKUs if not already recommended
    for (const trend of trends) {
        if (recommendations.length >= 3)
            break;
        if (seen.has(trend.sku))
            continue;
        if (!trend.isDecline)
            continue;
        const metric = metricsMap.get(trend.sku);
        const risk = riskMap.get(trend.sku);
        const val = valueMap.get(trend.sku);
        if (!metric || !risk || !val) {
            continue;
        }
        recommendations.push({
            rank,
            sku: trend.sku,
            reason: "declining_trend",
            rationale: `Demand is declining (3-month pattern: ${trend.unitsTrend.join(" → ")} units). Current value at risk: $${Math.round(val.valueAtRisk)}.`,
            suggestedAction: "De-prioritize reorder; monitor demand before committing. Consider promotional clearance.",
            metrics: {
                valueAtRisk: Math.round(val.valueAtRisk),
                daysOfCover: risk.daysOfCover,
                unitsTrend: trend.unitsTrend,
            },
        });
        seen.add(trend.sku);
        rank++;
    }
    return recommendations;
}
function identifyProactiveRisks(coverRisks, trends) {
    const risks = [];
    const trendMap = new Map(trends.map((t) => [t.sku, t]));
    for (const coverRisk of coverRisks) {
        const trend = trendMap.get(coverRisk.sku);
        // Overstocked + declining demand
        if (coverRisk.daysOfCover > 60 && trend?.isDecline) {
            risks.push({
                sku: coverRisk.sku,
                type: "demand_decline",
                severity: "high",
                description: `High inventory (${coverRisk.daysOfCover} days of cover) with declining demand (${trend.unitsTrend.slice(-3).join(" → ")} units).`,
                suggestedMitigation: "Consider promotional clearance or slower reorder cadence to avoid obsolescence.",
            });
        }
        // Critical stock-out risk (overstocked suffix to match type)
        if (coverRisk.riskLevel === "high") {
            const lastUnitsSold = trend?.unitsTrend[trend.unitsTrend.length - 1];
            if (!lastUnitsSold || lastUnitsSold > 0) {
                risks.push({
                    sku: coverRisk.sku,
                    type: "overstocked",
                    severity: "high",
                    description: `Inventory critically low (${coverRisk.daysOfCover} days of cover) with ongoing demand.`,
                    suggestedMitigation: "Expedite reorder; consider temporary supplier acceleration or air freight.",
                });
            }
        }
        // Slow-moving SKU (high inventory, no recent sales)
        if (coverRisk.daysOfCover > 90) {
            risks.push({
                sku: coverRisk.sku,
                type: "slow_moving",
                severity: "medium",
                description: `Excess inventory (${coverRisk.daysOfCover} days of cover) suggests slow sell-through or demand variability.`,
                suggestedMitigation: "Analyze seasonal patterns. Defer routine reorder until demand pattern clarifies.",
            });
        }
    }
    // Remove duplicates by (sku, type) key
    const seen = new Set();
    return risks.filter((r) => {
        const key = `${r.sku}|${r.type}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
//# sourceMappingURL=fact-bundle.js.map