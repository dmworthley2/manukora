/**
 * CSV processing orchestration: ingests raw CSV, validates, computes metrics, builds fact bundle.
 * This is the main entry point for data processing.
 */
import { parse as parseCsv } from "csv-parse/sync";
import { parseCommercialRows, detectDuplicates, } from "../analytics/csv-parser.js";
import { buildFactBundle } from "../analytics/fact-bundle.js";
/**
 * Transform multi-channel wide format to long format.
 * Converts Shopify_M1, Amazon_M1, etc. columns into separate rows per channel/month.
 *
 * Month mapping (M4 = March 2026, most recent):
 * - M1 = December 2025 (2025-12)
 * - M2 = January 2026 (2026-01)
 * - M3 = February 2026 (2026-02)
 * - M4 = March 2026 (2026-03)
 *
 * Note: All inventory fields (Stock_On_Hand, Units_On_Order, etc.) are pooled
 * across channels and stored once per SKU.
 */
function transformMultiChannelFormat(rawRows, headers, mapping) {
    const transformed = [];
    // Month mapping: M1→12 (Dec 2025), M2→01 (Jan 2026), M3→02 (Feb 2026), M4→03 (Mar 2026)
    const monthMap = {
        1: "2025-12",
        2: "2026-01",
        3: "2026-02",
        4: "2026-03",
    };
    // Extract channel columns (e.g., Shopify_M1, Amazon_M2)
    const channelColumns = headers.filter(h => /^(shopify|amazon|direct|other)_m\d+$/i.test(h));
    for (const row of rawRows) {
        // For each channel column, create a new row
        for (const colName of channelColumns) {
            const match = colName.match(/^(\w+)_m(\d+)$/i);
            if (!match)
                continue;
            const channel = match[1].toLowerCase();
            const monthNum = parseInt(match[2], 10);
            const unitsSoldValue = row[colName];
            const unitsSold = unitsSoldValue ? parseFloat(unitsSoldValue) : 0;
            // Skip rows with 0 units (no sales for this channel/month)
            if (unitsSold === 0)
                continue;
            // Use retail price to calculate revenue
            const retailPriceValue = row[mapping.retailPrice];
            const retailPrice = retailPriceValue ? parseFloat(retailPriceValue) : 0;
            if (retailPrice <= 0) {
                // Skip if retail price is invalid
                continue;
            }
            const revenue = unitsSold * retailPrice;
            // Map month number to correct ISO period
            const period = monthMap[monthNum] || `2026-${String(monthNum).padStart(2, "0")}`;
            // Get inventory value (pooled across channels)
            const inventoryColName = mapping.stockOnHand ?? mapping.onHandInventory;
            const inventoryValue = row[inventoryColName];
            const onHandInventory = inventoryValue ? parseFloat(inventoryValue) : 0;
            // Create new row with all fields needed for CommercialDataRow
            const newRow = {
                [mapping.sku]: row[mapping.sku] || "",
                [mapping.period]: period,
                [mapping.unitsSold]: String(unitsSold),
                [mapping.revenue]: String(revenue),
                [mapping.onHandInventory]: String(onHandInventory),
                [mapping.retailPrice]: String(retailPrice),
                channel,
            };
            // Add channel field with mapped name if available, otherwise use literal key
            if (mapping.channel) {
                newRow[mapping.channel] = channel;
            }
            // Add optional inventory fields if mapping exists
            if (mapping.stockOnHand && row[mapping.stockOnHand]) {
                newRow[mapping.stockOnHand] = row[mapping.stockOnHand];
            }
            if (mapping.unitsOnOrder && row[mapping.unitsOnOrder]) {
                newRow[mapping.unitsOnOrder] = row[mapping.unitsOnOrder];
            }
            if (mapping.orderArrivalMonths && row[mapping.orderArrivalMonths]) {
                newRow[mapping.orderArrivalMonths] = row[mapping.orderArrivalMonths];
            }
            if (mapping.targetMonthsCover && row[mapping.targetMonthsCover]) {
                newRow[mapping.targetMonthsCover] = row[mapping.targetMonthsCover];
            }
            transformed.push(newRow);
        }
    }
    return transformed;
}
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
    let csvHeaders;
    try {
        const buffer = Buffer.isBuffer(csvBytes) ? csvBytes : Buffer.from(csvBytes);
        const text = buffer.toString(options.encoding ?? "utf-8");
        const parsed = parseCsv(text, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });
        rawRows = parsed;
        csvHeaders = Object.keys(parsed[0] || {});
        console.log(`[processCsv] Parsed CSV: ${rawRows.length} rows, headers: ${csvHeaders.join(", ")}`);
        if (!Array.isArray(rawRows) || rawRows.length === 0) {
            errors.push({
                stage: "parse_csv",
                message: "CSV produced no valid rows",
            });
            return { success: false, errors, warnings };
        }
        // Check if this is multi-channel format and transform if needed
        if (options.fieldMapping.channel === "multi_channel_marker") {
            console.log(`[processCsv] Detected multi-channel format, transforming...`);
            const beforeTransform = rawRows.length;
            rawRows = transformMultiChannelFormat(rawRows, csvHeaders, options.fieldMapping);
            console.log(`[processCsv] Transformation: ${beforeTransform} SKUs → ${rawRows.length} rows`);
            if (rawRows.length === 0) {
                errors.push({
                    stage: "parse_csv",
                    message: "Multi-channel transformation produced no rows",
                });
                return { success: false, errors, warnings };
            }
        }
    }
    catch (err) {
        console.error(`[processCsv] Parse stage failed:`, err);
        errors.push({
            stage: "parse_csv",
            message: `Failed to parse CSV: ${err instanceof Error ? err.message : String(err)}`,
            detail: err,
        });
        return { success: false, errors, warnings };
    }
    // Stage 2: Validate and coerce rows
    console.log(`[processCsv] Stage 2: Validating ${rawRows.length} rows with fieldMapping:`, {
        sku: options.fieldMapping.sku,
        period: options.fieldMapping.period,
        unitsSold: options.fieldMapping.unitsSold,
        revenue: options.fieldMapping.revenue,
        onHandInventory: options.fieldMapping.onHandInventory,
        retailPrice: options.fieldMapping.retailPrice,
    });
    const parseResult = parseCommercialRows(rawRows, options.fieldMapping);
    console.log(`[processCsv] Validation result: ${parseResult.rows?.length || 0} valid rows, ${parseResult.errors.length} errors`);
    if (parseResult.errors.length > 0) {
        // Fail-closed: if any row fails validation, return errors
        console.error(`[processCsv] Validation errors:`, parseResult.errors.slice(0, 3));
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
 * Supports two formats:
 * 1. Traditional: period, unitsSold, revenue columns (one row per period)
 * 2. Multi-channel wide: Shopify_M1, Amazon_M1, etc. columns with separate inventory columns
 * Throws if critical columns are missing.
 */
export function inferFieldMapping(csvHeaders) {
    const headers = new Set(csvHeaders);
    console.log(`[inferFieldMapping] Analyzing ${csvHeaders.length} headers: ${csvHeaders.join(", ")}`);
    // Check for multi-channel wide format (has Shopify_M1, Amazon_M1, etc.)
    const isMultiChannelFormat = Array.from(headers).some(h => /^(shopify|amazon|direct|other)_m\d+$/i.test(h));
    console.log(`[inferFieldMapping] Detected format: ${isMultiChannelFormat ? "multi-channel wide" : "traditional"}`);
    if (isMultiChannelFormat) {
        // Multi-channel wide format: use SKU, inventory, and price columns
        // Period and channel will be extracted from column names (Shopify_M1, Amazon_M2, etc.)
        const skuAliases = ["sku", "product_id", "sku_code", "item"];
        const inventoryAliases = ["stock_on_hand", "Stock_On_Hand", "on_hand", "stock", "inventory"];
        const priceAliases = ["retail_price_usd", "Retail_Price_USD", "retail_price", "price", "msrp"];
        const unitsOnOrderAliases = ["units_on_order", "Units_On_Order", "on_order", "pending"];
        const orderArrivalAliases = ["order_arrival_months", "Order_Arrival_Months", "arrival_months", "lead_time"];
        const targetCoverAliases = ["target_months_cover", "Target_Months_Cover", "target_cover", "target_months"];
        const sku = findField(headers, skuAliases);
        const inventoryCol = findField(headers, inventoryAliases);
        const priceCol = findField(headers, priceAliases);
        if (!sku || !inventoryCol || !priceCol) {
            throw new Error(`Multi-channel format requires: SKU, Stock_On_Hand, Retail_Price_USD. Found: ${Array.from(headers).join(", ")}`);
        }
        // Return mapping with pooled inventory fields
        return {
            sku,
            period: "month_placeholder", // Will be extracted from column names
            unitsSold: "sales_placeholder", // Will be calculated from channel columns
            revenue: "revenue_placeholder", // Will be calculated from sales × price
            onHandInventory: inventoryCol, // Pooled across all channels
            retailPrice: priceCol,
            stockOnHand: inventoryCol, // Same as onHandInventory (pooled)
            unitsOnOrder: findField(headers, unitsOnOrderAliases),
            orderArrivalMonths: findField(headers, orderArrivalAliases),
            targetMonthsCover: findField(headers, targetCoverAliases),
            channel: "multi_channel_marker", // Marks this as multi-channel format
        };
    }
    // Traditional format
    const skuAliases = ["SKU", "sku", "product_id", "sku_code", "item"];
    const periodAliases = ["period", "month", "yyyymm", "date", "Period"];
    const unitsSoldAliases = ["units_sold", "qty_sold", "sales_units", "units", "Units_Sold"];
    const revenueAliases = ["revenue", "sales", "total_sales", "gross_revenue", "Revenue"];
    const inventoryAliases = ["on_hand_inventory", "inventory", "stock", "stock_qty", "Stock_On_Hand"];
    const priceAliases = ["retail_price", "list_price", "price", "msrp", "Retail_Price_USD"];
    const cogsAliases = ["cogs", "cost", "unit_cost", "product_cost"];
    const inboundAliases = ["inbound", "on_order", "pending", "incoming", "Units_On_Order"];
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
    return undefined;
}
//# sourceMappingURL=csv-processor.js.map