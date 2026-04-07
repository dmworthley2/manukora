/**
 * Inventory data extraction and transformation.
 * Converts parsed CSV rows into structured database inserts for product_catalog,
 * inventory_state, and sales_history tables.
 */
import type { CommercialDataRow, CsvFieldMapping } from "./csv-parser.js";
import type { ProductCatalogInsert, InventoryStateInsert, SalesHistoryInsert } from "../db/types.js";
/**
 * Extracted inventory data ready for database insertion.
 */
export type InventoryExtraction = {
    readonly products: readonly ProductCatalogInsert[];
    readonly inventoryState: readonly InventoryStateInsert[];
    readonly salesHistory: readonly SalesHistoryInsert[];
};
/**
 * Extended inventory data with upload tracking.
 * Includes upload_id in composite keys to support multiple uploads of same SKU.
 */
export type InventoryExtractionWithUploadId = {
    readonly products: readonly (ProductCatalogInsert & {
        readonly upload_id: string;
    })[];
    readonly inventoryState: readonly (InventoryStateInsert & {
        readonly upload_id: string;
    })[];
    readonly salesHistory: readonly (SalesHistoryInsert & {
        readonly upload_id: string;
    })[];
};
/**
 * Extract product info from CSV row headers (name, category, mgo_rating).
 * Regex patterns to detect Manuka honey MGO ratings:
 * - "Manuka Honey MGO 514+ 500g" → mgo_rating = 514
 * - "MGO 1700+ 100g" → mgo_rating = 1700
 *
 * Returns null if no MGO rating detected.
 */
export declare function extractMgoRating(productName: string): number | null;
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
export declare function extractInventoryData(rows: readonly CommercialDataRow[], _fieldMapping: CsvFieldMapping): InventoryExtraction;
/**
 * Extract inventory data with upload ID tracking.
 * Adds upload_id to all records to support multiple uploads of the same SKU.
 *
 * @param rows - Parsed commercial CSV rows
 * @param fieldMapping - Field mapping configuration
 * @param uploadId - Unique upload identifier
 * @returns InventoryExtraction with upload_id added to all records
 */
export declare function extractInventoryDataWithUploadId(rows: readonly CommercialDataRow[], fieldMapping: CsvFieldMapping, uploadId: string): InventoryExtractionWithUploadId;
/**
 * Enhanced version of extractInventoryData that accepts a pre-sorted period list.
 * Allows accurate month_period assignment (1–4) based on data window.
 *
 * @param rows - Parsed commercial CSV rows
 * @param fieldMapping - Field mapping configuration
 * @param sortedPeriods - Sorted list of unique periods (oldest to newest)
 * @returns InventoryExtraction with accurate month_period values
 */
export declare function extractInventoryDataWithPeriods(rows: readonly CommercialDataRow[], _fieldMapping: CsvFieldMapping, sortedPeriods: readonly string[]): InventoryExtraction;
//# sourceMappingURL=inventory-extractor.d.ts.map