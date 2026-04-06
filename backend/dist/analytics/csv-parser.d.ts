/**
 * CSV parsing and validation module.
 * Handles structured commercial CSV data ingestion with comprehensive validation.
 */
/** Raw CSV row as read from file, before type coercion. */
export type RawCsvRow = Record<string, string | undefined>;
/**
 * CSV field mapping configuration.
 * Allows flexible column naming while enforcing required logical fields.
 */
export type CsvFieldMapping = {
    readonly sku: string;
    readonly period: string;
    readonly unitsSold: string;
    readonly revenue: string;
    readonly onHandInventory: string;
    readonly retailPrice: string;
    readonly cogs?: string;
    readonly inbound?: string;
};
/**
 * Parsed and coerced commercial data row.
 * All numeric fields are validated and typed as numbers.
 */
export type CommercialDataRow = {
    readonly sku: string;
    readonly period: string;
    readonly unitsSold: number;
    readonly revenue: number;
    readonly onHandInventory: number;
    readonly retailPrice: number;
    readonly cogs: number | null;
    readonly inbound: number | null;
};
/** CSV parsing error with row context. */
export type CsvParseError = {
    readonly rowIndex: number;
    readonly field: string;
    readonly value: string | undefined;
    readonly reason: string;
};
/** Parsing result: either rows or errors (fail-closed on validation). */
export type ParseResult = {
    readonly rows?: readonly CommercialDataRow[];
    readonly errors: readonly CsvParseError[];
};
/**
 * Parse raw CSV rows into typed CommercialDataRow array.
 * Returns errors for any row that fails validation; rows are collected separately.
 * This is fail-closed: if errors exist, the rows array is undefined.
 */
export declare function parseCommercialRows(rawRows: readonly RawCsvRow[], mapping: CsvFieldMapping): ParseResult;
/**
 * Detect duplicate (SKU, period) keys in parsed rows.
 * Returns array of (SKU, period, rowIndices) for duplicates.
 */
export declare function detectDuplicates(rows: readonly CommercialDataRow[]): Array<{
    readonly sku: string;
    readonly period: string;
    readonly rowIndices: readonly number[];
}>;
//# sourceMappingURL=csv-parser.d.ts.map