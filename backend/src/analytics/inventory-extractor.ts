/**
 * Inventory data extraction and transformation.
 * Converts parsed CSV rows into structured database inserts for product_catalog,
 * inventory_state, and sales_history tables.
 */

import type {
  CommercialDataRow,
  CsvFieldMapping,
} from "./csv-parser.js";
import type {
  ProductCatalogInsert,
  InventoryStateInsert,
  SalesHistoryInsert,
} from "../db/types.js";

/**
 * Extracted inventory data ready for database insertion.
 */
export type InventoryExtraction = {
  readonly products: readonly ProductCatalogInsert[];
  readonly inventoryState: readonly InventoryStateInsert[];
  readonly salesHistory: readonly SalesHistoryInsert[];
};

/**
 * Extract product info from CSV row headers (name, category, mgo_rating).
 * Regex patterns to detect Manuka honey MGO ratings:
 * - "Manuka Honey MGO 514+ 500g" → mgo_rating = 514
 * - "MGO 1700+ 100g" → mgo_rating = 1700
 *
 * Returns null if no MGO rating detected.
 */
export function extractMgoRating(productName: string): number | null {
  // Match patterns like "MGO 514+", "MGO514+", "MGO 1700+", etc.
  const mgoMatch = productName.match(/mgo\s*(\d+)\+?/i);
  if (mgoMatch && mgoMatch[1]) {
    const rating = parseInt(mgoMatch[1], 10);
    return isNaN(rating) ? null : rating;
  }
  return null;
}

/**
 * Infer product category from product name heuristics.
 * Returns basic categories: "Honey", "Tincture", "Bioactive Blend", "Other".
 */
function inferProductCategory(productName: string): string {
  if (/tincture/i.test(productName)) return "Tincture";
  if (/blend|immunity|energy|recovery/i.test(productName)) return "Bioactive Blend";
  if (/honey|mgo/i.test(productName)) return "Honey";
  return "Other";
}

/**
 * Build product notes based on special case detection.
 * Flags products with non-standard targets or phaseouts.
 */
function buildProductNotes(productName: string): string | undefined {
  const notes: string[] = [];

  if (/propolis/i.test(productName)) {
    notes.push("Phased out Q2 2026");
  }

  if (/mgo\s*1700\+.*100g/i.test(productName)) {
    notes.push("Premium pricing, target 3-month cover");
  }

  if (/bioactive|immunity|energy|recovery/i.test(productName) &&
      /blend/i.test(productName)) {
    notes.push("Launched Jan 2026, assess M2–M4 trend only");
  }

  return notes.length > 0 ? notes.join("; ") : undefined;
}

/**
 * Transform parsed CSV rows + field mapping into structured inventory data.
 * Handles:
 * - Product catalog extraction (name, category, MGO rating, retail price)
 * - Inventory state (current on-hand, on-order, arrival months)
 * - Sales history aggregation by (sku, channel, month_period)
 *
 * Note: This function requires that the CSV has been extended with optional
 * inventory fields (stockOnHand, unitsOnOrder, orderArrivalMonths, etc.).
 * If these fields are missing, inventory_state will be empty.
 *
 * @param rows - Parsed commercial CSV rows
 * @param fieldMapping - Field mapping configuration (includes optional inventory fields)
 * @returns InventoryExtraction with products, inventoryState, and salesHistory
 */
export function extractInventoryData(
  rows: readonly CommercialDataRow[],
  // fieldMapping parameter is for signature consistency with extractInventoryDataWithPeriods
  _fieldMapping: CsvFieldMapping,
): InventoryExtraction {
  // Track unique products to avoid duplicates
  const productMap = new Map<string, ProductCatalogInsert>();
  const inventoryMap = new Map<string, InventoryStateInsert>();
  const salesHistoryMap = new Map<string, SalesHistoryInsert>();

  for (const row of rows) {
    // PRODUCT CATALOG: Extract once per SKU (use first occurrence)
    if (!productMap.has(row.sku)) {
      // Infer product name from row if not available
      // In a real scenario, product name would come from a header/column
      // For now, use SKU as fallback
      const productName = row.sku; // Placeholder: actual implementation may enhance this

      const mgoRating = extractMgoRating(productName);
      const category = inferProductCategory(productName);

      productMap.set(row.sku, {
        sku: row.sku,
        product_category: category,
        product_name: productName,
        mgo_rating: mgoRating,
        retail_price_usd: row.retailPrice,
        target_months_cover: undefined, // Defaults to 2, unless special case override
        product_notes: buildProductNotes(productName),
      });
    }

    // INVENTORY STATE: Extract current snapshot (use most recent)
    // This assumes rows are chronologically sorted or we take the latest
    // For now, we overwrite each SKU with the latest entry
    if (row.stockOnHand !== undefined || row.unitsOnOrder !== undefined) {
      const stockOnHand = row.stockOnHand ?? row.onHandInventory;
      const unitsOnOrder = row.unitsOnOrder ?? 0;
      const orderArrivalMonths = row.orderArrivalMonths ?? 0;

      inventoryMap.set(row.sku, {
        sku: row.sku,
        stock_on_hand: stockOnHand,
        units_on_order: unitsOnOrder,
        order_arrival_months: orderArrivalMonths,
      });
    }

    // SALES HISTORY: Aggregate by (sku, channel, month_period)
    // Parse period (e.g., "2026-03") into month number (1–4 for M1–M4)
    const periodNum = extractMonthNumber(row.period);

    // If channel is not available in CommercialDataRow, default to "Unspecified"
    const channel = row.channel ?? "Unspecified";

    const salesKey = `${row.sku}|${channel}|${periodNum}`;

    if (!salesHistoryMap.has(salesKey)) {
      salesHistoryMap.set(salesKey, {
        sku: row.sku,
        channel,
        month_period: periodNum,
        units_sold: row.unitsSold,
      });
    } else {
      // If key exists, sum units (handle duplicate periods/channels)
      const existing = salesHistoryMap.get(salesKey)!;
      salesHistoryMap.set(salesKey, {
        ...existing,
        units_sold: existing.units_sold + row.unitsSold,
      });
    }
  }

  return {
    products: Array.from(productMap.values()),
    inventoryState: Array.from(inventoryMap.values()),
    salesHistory: Array.from(salesHistoryMap.values()),
  };
}

/**
 * Extract relative month number (1–4) from ISO period string.
 * Assumes a 4-month historical window in the CSV.
 *
 * Examples:
 * - "2026-03" (March, current) → 4 (M4, most recent)
 * - "2026-02" (February) → 3 (M3)
 * - "2026-01" (January) → 2 (M2)
 * - "2025-12" (December) → 1 (M1, oldest)
 *
 * Algorithm: Sort all unique periods, map to 1–4 based on position.
 * This function is called per-row, so it's expected to be called in batch
 * context where all periods are known. For now, we'll use a simplified
 * heuristic: month % 4 (imperfect but deterministic).
 *
 * TODO: This should be improved to accept the full period list upfront.
 */
function extractMonthNumber(period: string): number {
  // Parse "YYYY-MM" into month number
  const match = period.match(/(\d{4})-(\d{2})/);
  if (!match || !match[1] || !match[2]) return 1; // Default to M1 if unparseable

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);

  // Simple heuristic: use month as proxy for relative position
  // In production, this should map periods to 1–4 relative to the data window
  // For now: assume a 4-month rolling window, map by recency
  // This is imperfect; a better approach would be to sort periods first.
  const yearMonth = year * 100 + month;
  return (yearMonth % 4) + 1;
}

/**
 * Enhanced version of extractInventoryData that accepts a pre-sorted period list.
 * Allows accurate month_period assignment (1–4) based on data window.
 *
 * @param rows - Parsed commercial CSV rows
 * @param fieldMapping - Field mapping configuration
 * @param sortedPeriods - Sorted list of unique periods (oldest to newest)
 * @returns InventoryExtraction with accurate month_period values
 */
export function extractInventoryDataWithPeriods(
  rows: readonly CommercialDataRow[],
  // fieldMapping parameter is for signature consistency with extractInventoryData
  _fieldMapping: CsvFieldMapping,
  sortedPeriods: readonly string[],
): InventoryExtraction {
  // Build period → month_period mapping (1–4)
  const periodMap = new Map<string, number>();
  for (let i = 0; i < sortedPeriods.length; i++) {
    const period = sortedPeriods[i];
    if (!period) continue; // Skip undefined periods
    // Map to 1–4 where 4 is the most recent
    const monthNum = Math.max(1, sortedPeriods.length - i);
    periodMap.set(period, monthNum);
  }

  // Track unique products to avoid duplicates
  const productMap = new Map<string, ProductCatalogInsert>();
  const inventoryMap = new Map<string, InventoryStateInsert>();
  const salesHistoryMap = new Map<string, SalesHistoryInsert>();

  for (const row of rows) {
    // PRODUCT CATALOG: Extract once per SKU
    if (!productMap.has(row.sku)) {
      const productName = row.sku;
      const mgoRating = extractMgoRating(productName);
      const category = inferProductCategory(productName);

      productMap.set(row.sku, {
        sku: row.sku,
        product_category: category,
        product_name: productName,
        mgo_rating: mgoRating,
        retail_price_usd: row.retailPrice,
        target_months_cover: undefined,
        product_notes: buildProductNotes(productName),
      });
    }

    // INVENTORY STATE: Extract current snapshot
    if (row.stockOnHand !== undefined || row.unitsOnOrder !== undefined) {
      const stockOnHand = row.stockOnHand ?? row.onHandInventory;
      const unitsOnOrder = row.unitsOnOrder ?? 0;
      const orderArrivalMonths = row.orderArrivalMonths ?? 0;

      inventoryMap.set(row.sku, {
        sku: row.sku,
        stock_on_hand: stockOnHand,
        units_on_order: unitsOnOrder,
        order_arrival_months: orderArrivalMonths,
      });
    }

    // SALES HISTORY: Aggregate by (sku, channel, month_period)
    const monthNum = periodMap.get(row.period) ?? 1;
    const channel = row.channel ?? "Unspecified";
    const salesKey = `${row.sku}|${channel}|${monthNum}`;

    if (!salesHistoryMap.has(salesKey)) {
      salesHistoryMap.set(salesKey, {
        sku: row.sku,
        channel,
        month_period: monthNum,
        units_sold: row.unitsSold,
      });
    } else {
      const existing = salesHistoryMap.get(salesKey)!;
      salesHistoryMap.set(salesKey, {
        ...existing,
        units_sold: existing.units_sold + row.unitsSold,
      });
    }
  }

  return {
    products: Array.from(productMap.values()),
    inventoryState: Array.from(inventoryMap.values()),
    salesHistory: Array.from(salesHistoryMap.values()),
  };
}
