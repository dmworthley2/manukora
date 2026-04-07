/**
 * CSV processing orchestration: ingests raw CSV, validates, computes metrics, builds fact bundle.
 * This is the main entry point for data processing.
 */
import type { CommercialDataRow } from "../analytics/csv-parser.js";
import { type CsvFieldMapping } from "../analytics/csv-parser.js";
import { type FactBundle } from "../analytics/fact-bundle.js";
/**
 * CSV processing options.
 */
export type CsvProcessorOptions = {
    readonly fieldMapping: CsvFieldMapping;
    readonly onDuplicatePolicy?: "fail" | "last-wins";
    readonly encoding?: BufferEncoding;
};
/**
 * Processing result: either successful (bundle + warnings) or failed (errors).
 */
export type CsvProcessingResult = {
    success: boolean;
    factBundle?: FactBundle;
    rows?: readonly CommercialDataRow[];
    errors: readonly CsvProcessingError[];
    warnings: readonly string[];
};
export type CsvProcessingError = {
    readonly stage: "parse_csv" | "validate_rows" | "detect_duplicates" | "build_bundle";
    readonly message: string;
    readonly detail?: unknown;
};
/**
 * Process raw CSV bytes through full pipeline:
 * 1. Parse CSV
 * 2. Coerce and validate rows
 * 3. Detect duplicates
 * 4. Build fact bundle
 */
export declare function processCsv(csvBytes: Buffer | Uint8Array, options: CsvProcessorOptions): CsvProcessingResult;
/**
 * Create default field mapping from common column names.
 * Supports two formats:
 * 1. Traditional: period, unitsSold, revenue columns (one row per period)
 * 2. Multi-channel wide: Shopify_M1, Amazon_M1, etc. columns with separate inventory columns
 * Throws if critical columns are missing.
 */
export declare function inferFieldMapping(csvHeaders: readonly string[]): CsvFieldMapping;
//# sourceMappingURL=csv-processor.d.ts.map