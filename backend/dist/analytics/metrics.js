/**
 * Deterministic analytics metrics computation.
 * All metrics are computed directly from source data; no LLM invention.
 */
/**
 * Compute month metrics for a single row.
 */
export function computeMonthMetrics(row) {
    const avgSellingPrice = row.unitsSold > 0 ? row.revenue / row.unitsSold : row.retailPrice;
    const velocity = row.unitsSold / 30; // approximate daily velocity
    const daysOfCover = velocity > 0 ? row.onHandInventory / velocity : 999; // cap at 999 for ~3 years
    return {
        sku: row.sku,
        period: row.period,
        unitsSold: row.unitsSold,
        revenue: row.revenue,
        avgSellingPrice: Math.round(avgSellingPrice * 100) / 100,
        onHandInventory: row.onHandInventory,
        estimatedVelocity: Math.round(velocity * 100) / 100,
        daysOfCover: Math.min(Math.round(daysOfCover), 999),
    };
}
/**
 * Analyze trend for a SKU across periods (sorted chronologically).
 */
export function analyzeTrend(rows) {
    if (rows.length === 0) {
        throw new Error("Cannot analyze trend for empty row set");
    }
    const sorted = [...rows].sort((a, b) => a.period.localeCompare(b.period));
    const unitsTrend = sorted.map((r) => r.unitsSold);
    const revenueTrend = sorted.map((r) => r.revenue);
    // Detect 3-month declining pattern
    let isDecline = false;
    if (sorted.length >= 3) {
        const recent3 = unitsTrend.slice(-3);
        const first = recent3[0];
        const second = recent3[1];
        const third = recent3[2];
        if (first !== undefined && second !== undefined && third !== undefined) {
            isDecline = first > second && second > third;
        }
    }
    const first = unitsTrend[0];
    const last = unitsTrend[unitsTrend.length - 1];
    const trend = sorted.length < 2
        ? "insufficient"
        : isDecline
            ? "decline"
            : first !== undefined && last !== undefined && last > first
                ? "growth"
                : "stable";
    const firstRow = rows[0];
    if (!firstRow) {
        throw new Error("Cannot analyze trend: no rows available");
    }
    return {
        sku: firstRow.sku,
        periods: sorted.map((r) => r.period),
        unitsTrend,
        revenueTrend,
        isDecline,
        trend,
    };
}
/**
 * Assess cover risk based on days of cover.
 * Low: >60 days, Medium: 20-60 days, High: <20 days.
 */
export function assessCoverRisk(metrics) {
    let riskLevel;
    let reason;
    if (metrics.daysOfCover > 60) {
        riskLevel = "low";
        reason = `Strong inventory position (${metrics.daysOfCover} days of cover)`;
    }
    else if (metrics.daysOfCover >= 20) {
        riskLevel = "medium";
        reason = `Moderate inventory risk (${metrics.daysOfCover} days of cover)`;
    }
    else {
        riskLevel = "high";
        reason = `Critical inventory risk (${metrics.daysOfCover} days of cover); reorder urgency`;
    }
    return {
        sku: metrics.sku,
        riskLevel,
        daysOfCover: metrics.daysOfCover,
        reason,
    };
}
/**
 * Compute commercial value at risk (inventory value exposed to slow-move or decline).
 */
export function computeValueAtRisk(row) {
    const costPerUnit = row.cogs || null;
    const unitPrice = row.retailPrice;
    const valueAtRisk = row.onHandInventory * unitPrice;
    return {
        sku: row.sku,
        period: row.period,
        onHandInventory: row.onHandInventory,
        unitPrice,
        costPerUnit,
        valueAtRisk,
    };
}
/**
 * Rank SKUs by value at risk, descending (highest risk first).
 * Note: filterRisk parameter reserved for future use; currently returns all values ranked.
 */
export function rankByValueAtRisk(values, _filterRisk) {
    const filtered = [...values];
    return filtered.sort((a, b) => b.valueAtRisk - a.valueAtRisk);
}
/**
 * Group rows by SKU for trend analysis.
 */
export function groupBySku(rows) {
    const groups = new Map();
    for (const row of rows) {
        if (!groups.has(row.sku)) {
            groups.set(row.sku, []);
        }
        groups.get(row.sku).push(row);
    }
    return groups;
}
//# sourceMappingURL=metrics.js.map