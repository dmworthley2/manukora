/**
 * CSV parsing and validation module.
 * Handles structured commercial CSV data ingestion with comprehensive validation.
 */

import { z } from "zod";

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

const CommercialRowSchema = z.object({
  sku: z.string().trim().min(1, "SKU required"),
  period: z.string().trim().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM"),
  unitsSold: z.number().nonnegative("Units sold must be non-negative"),
  revenue: z.number().nonnegative("Revenue must be non-negative"),
  onHandInventory: z.number().nonnegative("Inventory must be non-negative"),
  retailPrice: z.number().positive("Retail price must be positive"),
  cogs: z.number().nonnegative("COGS must be non-negative").nullable(),
  inbound: z.number().nonnegative("Inbound must be non-negative").nullable(),
});

/**
 * Parse raw CSV rows into typed CommercialDataRow array.
 * Returns errors for any row that fails validation; rows are collected separately.
 * This is fail-closed: if errors exist, the rows array is undefined.
 */
export function parseCommercialRows(
  rawRows: readonly RawCsvRow[],
  mapping: CsvFieldMapping,
): ParseResult {
  const rows: CommercialDataRow[] = [];
  const errors: CsvParseError[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    if (!raw) continue;
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

function parseRow(
  raw: RawCsvRow,
  mapping: CsvFieldMapping,
): { ok: true; data: CommercialDataRow } | { ok: false; error: Omit<CsvParseError, "rowIndex"> } {
  const coerced = {
    sku: raw[mapping.sku],
    period: raw[mapping.period],
    unitsSold: coerceNumber(raw[mapping.unitsSold]),
    revenue: coerceNumber(raw[mapping.revenue]),
    onHandInventory: coerceNumber(raw[mapping.onHandInventory]),
    retailPrice: coerceNumber(raw[mapping.retailPrice]),
    cogs: mapping.cogs ? coerceNumber(raw[mapping.cogs]) : null,
    inbound: mapping.inbound ? coerceNumber(raw[mapping.inbound]) : null,
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
    const fieldKey = firstIssue.path[0] as keyof typeof mapping;
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

function coerceNumber(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Detect duplicate (SKU, period) keys in parsed rows.
 * Returns array of (SKU, period, rowIndices) for duplicates.
 */
export function detectDuplicates(rows: readonly CommercialDataRow[]): Array<{
  readonly sku: string;
  readonly period: string;
  readonly rowIndices: readonly number[];
}> {
  const seen = new Map<string, number[]>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const key = `${row.sku}|${row.period}`;
    if (!seen.has(key)) {
      seen.set(key, []);
    }
    seen.get(key)!.push(i);
  }

  const duplicates = Array.from(seen.entries())
    .filter(([, indices]) => indices.length > 1)
    .map(([key, indices]) => {
      const [sku, period] = key.split("|");
      return { sku: sku || "", period: period || "", rowIndices: indices as readonly number[] };
    });

  return duplicates;
}
