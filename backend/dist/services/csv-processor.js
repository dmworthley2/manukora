/**
 * CSV processing orchestration: ingests raw CSV, validates, computes metrics, builds fact bundle.
 * This is the main entry point for data processing.
 */
import { parse as parseCsv } from "csv-parse/sync";
import { parseCommercialRows, detectDuplicates, } from "../analytics/csv-parser.js";
import { buildFactBundle } from "../analytics/fact-bundle.js";
/**
 * Process raw CSV bytes through full pipeline:
 * 1. Parse CSV
 * 2. Coerce and validate rows
 * 3. Detect duplicates
 * 4. Build fact bundle
 */
export function processCsv(csvBytes, options) {
    const errors = [];
    const warnings = [];
    // Stage 1: Parse CSV
    let rawRows;
    try {
        const buffer = Buffer.isBuffer(csvBytes) ? csvBytes : Buffer.from(csvBytes);
        const text = buffer.toString(options.encoding ?? "utf-8");
        rawRows = parseCsv(text, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });
        if (!Array.isArray(rawRows) || rawRows.length === 0) {
            errors.push({
                stage: "parse_csv",
                message: "CSV produced no valid rows",
            });
            return { success: false, errors, warnings };
        }
    }
    catch (err) {
        errors.push({
            stage: "parse_csv",
            message: `Failed to parse CSV: ${err instanceof Error ? err.message : String(err)}`,
            detail: err,
        });
        return { success: false, errors, warnings };
    }
    // Stage 2: Validate and coerce rows
    const parseResult = parseCommercialRows(rawRows, options.fieldMapping);
    if (parseResult.errors.length > 0) {
        // Fail-closed: if any row fails validation, return errors
        errors.push({
            stage: "validate_rows",
            message: `${parseResult.errors.length} row(s) failed validation`,
            detail: parseResult.errors.slice(0, 5), // Show first 5 errors
        });
        return { success: false, errors, warnings };
    }
    const rows = parseResult.rows;
    if (!rows || rows.length === 0) {
        errors.push({
            stage: "validate_rows",
            message: "No valid rows after validation",
        });
        return { success: false, errors, warnings };
    }
    // Stage 3: Detect duplicates
    const duplicates = detectDuplicates(rows);
    if (duplicates.length > 0) {
        const policy = options.onDuplicatePolicy ?? "fail";
        if (policy === "fail") {
            errors.push({
                stage: "detect_duplicates",
                message: `Found ${duplicates.length} duplicate (SKU, period) key(s)`,
                detail: duplicates.slice(0, 5),
            });
            return { success: false, errors, warnings };
        }
        else if (policy === "last-wins") {
            warnings.push(`Keeping last row for ${duplicates.length} duplicate (SKU, period) key(s)`);
            // De-duplicate by keeping last occurrence
            const deduped = deduplicateLastWins(rows);
            return processCsv(Buffer.from(JSON.stringify(deduped)), {
                ...options,
                onDuplicatePolicy: "fail", // prevent infinite recursion
            });
        }
    }
    // Stage 4: Build fact bundle
    let factBundle;
    try {
        factBundle = buildFactBundle(rows);
    }
    catch (err) {
        errors.push({
            stage: "build_bundle",
            message: `Failed to build fact bundle: ${err instanceof Error ? err.message : String(err)}`,
            detail: err,
        });
        return { success: false, errors, warnings };
    }
    return { success: true, factBundle, rows, errors, warnings };
}
function deduplicateLastWins(rows) {
    const keyed = new Map();
    for (const row of rows) {
        const key = `${row.sku}|${row.period}`;
        keyed.set(key, row);
    }
    return Array.from(keyed.values());
}
/**
 * Create default field mapping from common column names.
 * Throws if critical columns are missing.
 */
export function inferFieldMapping(csvHeaders) {
    const headers = new Set(csvHeaders);
    // Define aliases for each required field
    const skuAliases = ["sku", "product_id", "sku_code", "item"];
    const periodAliases = ["period", "month", "yyyymm", "date"];
    const unitsSoldAliases = ["units_sold", "qty_sold", "sales_units", "units"];
    const revenueAliases = ["revenue", "sales", "total_sales", "gross_revenue"];
    const inventoryAliases = ["on_hand_inventory", "inventory", "stock", "stock_qty"];
    const priceAliases = ["retail_price", "list_price", "price", "msrp"];
    const cogsAliases = ["cogs", "cost", "unit_cost", "product_cost"];
    const inboundAliases = ["inbound", "on_order", "pending", "incoming"];
    const sku = findField(headers, skuAliases);
    const period = findField(headers, periodAliases);
    const unitsSold = findField(headers, unitsSoldAliases);
    const revenue = findField(headers, revenueAliases);
    const onHandInventory = findField(headers, inventoryAliases);
    const retailPrice = findField(headers, priceAliases);
    if (!sku || !period || !unitsSold || !revenue || !onHandInventory || !retailPrice) {
        throw new Error(`Missing required CSV columns. Found: ${Array.from(headers).join(", ")}`);
    }
    return {
        sku,
        period,
        unitsSold,
        revenue,
        onHandInventory,
        retailPrice,
        cogs: findField(headers, cogsAliases) ?? undefined,
        inbound: findField(headers, inboundAliases) ?? undefined,
    };
}
function findField(headers, aliases) {
    for (const alias of aliases) {
        const normalized = alias.toLowerCase().trim();
        for (const header of headers) {
            if (header.toLowerCase().trim() === normalized) {
                return header;
            }
        }
    }
    return null;
}
//# sourceMappingURL=csv-processor.js.map