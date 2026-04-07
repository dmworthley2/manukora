/**
 * CSV parsing and validation module.
 * Handles structured commercial CSV data ingestion with comprehensive validation.
 */
import { z } from "zod";
const CommercialRowSchema = z.object({
    sku: z.string().trim().min(1, "SKU required"),
    period: z.string().trim().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM"),
    unitsSold: z.number().nonnegative("Units sold must be non-negative"),
    revenue: z.number().nonnegative("Revenue must be non-negative"),
    onHandInventory: z.number().nonnegative("Inventory must be non-negative"),
    retailPrice: z.number().positive("Retail price must be positive"),
    cogs: z.number().nonnegative("COGS must be non-negative").nullable(),
    inbound: z.number().nonnegative("Inbound must be non-negative").nullable(),
    stockOnHand: z.number().nonnegative("Stock on hand must be non-negative").nullable().optional(),
    unitsOnOrder: z.number().nonnegative("Units on order must be non-negative").nullable().optional(),
    orderArrivalMonths: z.number().nonnegative("Order arrival months must be non-negative").nullable().optional(),
    targetMonthsCover: z.number().nonnegative("Target months cover must be non-negative").nullable().optional(),
    productCategory: z.string().optional(),
    channel: z.string().optional(),
});
/**
 * Parse raw CSV rows into typed CommercialDataRow array.
 * Returns errors for any row that fails validation; rows are collected separately.
 * This is fail-closed: if errors exist, the rows array is undefined.
 */
export function parseCommercialRows(rawRows, mapping) {
    const rows = [];
    const errors = [];
    for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i];
        if (!raw)
            continue;
        const parsed = parseRow(raw, mapping);
        if (!parsed.ok) {
            errors.push({
                rowIndex: i + 1, // 1-indexed for user-facing error messages
                ...parsed.error,
            });
            continue;
        }
        rows.push(parsed.data);
    }
    if (errors.length > 0) {
        return { errors };
    }
    return { rows, errors };
}
function parseRow(raw, mapping) {
    const coerced = {
        sku: raw[mapping.sku],
        period: raw[mapping.period],
        unitsSold: coerceNumber(raw[mapping.unitsSold]),
        revenue: coerceNumber(raw[mapping.revenue]),
        onHandInventory: coerceNumber(raw[mapping.onHandInventory]),
        retailPrice: coerceNumber(raw[mapping.retailPrice]),
        cogs: mapping.cogs ? coerceNumber(raw[mapping.cogs]) : null,
        inbound: mapping.inbound ? coerceNumber(raw[mapping.inbound]) : null,
        stockOnHand: mapping.stockOnHand ? coerceNumber(raw[mapping.stockOnHand]) : undefined,
        unitsOnOrder: mapping.unitsOnOrder ? coerceNumber(raw[mapping.unitsOnOrder]) : undefined,
        orderArrivalMonths: mapping.orderArrivalMonths ? coerceNumber(raw[mapping.orderArrivalMonths]) : undefined,
        targetMonthsCover: mapping.targetMonthsCover ? coerceNumber(raw[mapping.targetMonthsCover]) : undefined,
        productCategory: mapping.productCategory ? raw[mapping.productCategory] : undefined,
        channel: mapping.channel ? raw[mapping.channel] : undefined,
    };
    const result = CommercialRowSchema.safeParse(coerced);
    if (!result.success) {
        const firstIssue = result.error.issues[0];
        if (!firstIssue) {
            return {
                ok: false,
                error: {
                    field: "unknown",
                    value: "",
                    reason: "Validation failed with no details",
                },
            };
        }
        const fieldKey = firstIssue.path[0];
        return {
            ok: false,
            error: {
                field: firstIssue.path.join("."),
                value: raw[mapping[fieldKey] || ""],
                reason: firstIssue.message,
            },
        };
    }
    return { ok: true, data: result.data };
}
function coerceNumber(value) {
    if (value === undefined || value === "")
        return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}
/**
 * Infer field mapping from CSV headers.
 * Uses case-insensitive matching against known aliases.
 */
export function inferFieldMapping(headers) {
    const findField = (aliases) => {
        const lower = aliases.map(a => a.toLowerCase());
        return headers.find(h => lower.includes(h.toLowerCase()));
    };
    // Required fields
    const sku = findField(["sku", "product_sku"]);
    const period = findField(["period", "month", "date"]);
    const unitsSold = findField(["units_sold", "units_ordered", "qty_sold"]);
    const revenue = findField(["revenue", "sales", "total_sales"]);
    const onHandInventory = findField(["on_hand_inventory", "inventory", "stock"]);
    const retailPrice = findField(["retail_price", "price", "unit_price"]);
    if (!sku || !period || !unitsSold || !revenue || !onHandInventory || !retailPrice) {
        return null;
    }
    // Optional fields
    const stockOnHandAliases = ["stock_on_hand", "stock_on_hand", "warehouse_qty"];
    const unitsOnOrderAliases = ["units_on_order", "on_order", "pending_order"];
    const orderArrivalMonthsAliases = ["order_arrival_months", "arrival_months", "lead_time_months"];
    const targetMonthsCoverAliases = ["target_months_cover", "target_cover", "cover_target"];
    const productCategoryAliases = ["product_category", "category", "product_line"];
    const channelAliases = ["channel", "sales_channel", "platform"];
    return {
        sku,
        period,
        unitsSold,
        revenue,
        onHandInventory,
        retailPrice,
        cogs: findField(["cogs", "cost_of_goods_sold"]),
        inbound: findField(["inbound", "on_order_qty"]),
        stockOnHand: findField(stockOnHandAliases),
        unitsOnOrder: findField(unitsOnOrderAliases),
        orderArrivalMonths: findField(orderArrivalMonthsAliases),
        targetMonthsCover: findField(targetMonthsCoverAliases),
        productCategory: findField(productCategoryAliases),
        channel: findField(channelAliases),
    };
}
/**
 * Detect duplicate (SKU, period) keys in parsed rows.
 * Returns array of (SKU, period, rowIndices) for duplicates.
 */
export function detectDuplicates(rows) {
    const seen = new Map();
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row)
            continue;
        // Include channel in key if present (for multi-channel data)
        // Same SKU in same period but different channels is NOT a duplicate
        const channel = row.channel ? `|${row.channel}` : "";
        const key = `${row.sku}|${row.period}${channel}`;
        if (!seen.has(key)) {
            seen.set(key, []);
        }
        seen.get(key).push(i);
    }
    const duplicates = Array.from(seen.entries())
        .filter(([, indices]) => indices.length > 1)
        .map(([key, indices]) => {
        const parts = key.split("|");
        const sku = parts[0] || "";
        const period = parts[1] || "";
        return { sku, period, rowIndices: indices };
    });
    return duplicates;
}
//# sourceMappingURL=csv-parser.js.map