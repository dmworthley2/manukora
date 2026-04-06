/**
 * Supabase Database Types
 * Manually defined to match the Postgres schema.
 * When adding tables, update this file and regenerate types via codegen if possible.
 *
 * To regenerate from live Supabase instance:
 * npx supabase gen types typescript --project-id <id> > src/db/types-generated.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ============================================================================
// UPLOADS TABLE: CSV file metadata
// ============================================================================

/**
 * Upload row as it exists in the database.
 * Represents a single uploaded CSV file with metadata for audit/lineage.
 */
export interface UploadRow {
  readonly id: string; // UUID
  readonly storage_path: string; // uploads/{id}
  readonly bucket: string; // "uploads"
  readonly original_filename: string;
  readonly byte_size: number;
  readonly content_type: string;
  readonly content_sha256: string | null; // SHA256 hex digest for integrity check
  readonly created_at: string; // ISO timestamp, auto-set by DB
}

/**
 * Insert record for uploads table.
 * All fields required except SHA256 (for flexibility).
 */
export interface UploadInsert {
  readonly id?: string; // Optional; UUID generated if omitted
  readonly storage_path: string;
  readonly bucket: string;
  readonly original_filename: string;
  readonly byte_size: number;
  readonly content_type: string;
  readonly content_sha256?: string | null;
}

/**
 * Update record for uploads table.
 * All fields optional (PATCH semantics).
 */
export interface UploadUpdate {
  readonly storage_path?: string;
  readonly original_filename?: string;
  readonly byte_size?: number;
  readonly content_type?: string;
  readonly content_sha256?: string | null;
}

// ============================================================================
// REPORT_RUNS TABLE: Agentic briefing runs
// ============================================================================

/**
 * ReportRunStatus: Workflow states for agentic runs.
 *
 * - pending: Created, awaiting processing
 * - processing: Currently running through LangGraph
 * - completed: Finalized with all artifacts stored
 * - failed: Error occurred; check metadata for details
 */
export type ReportRunStatus = "pending" | "processing" | "completed" | "failed";

/**
 * ReportRunRow: One agentic run from upload → briefing.
 *
 * Links:
 * - upload_id FK to uploads.id (nullable; runs may be triggered without prior upload)
 * - fact_bundle_path, briefing_md_path, briefing_pdf_path: Output artifacts in Storage
 *
 * Metadata:
 * - Custom JSON for workflow state, LangGraph thread IDs, HiTL state, etc.
 * - Extensible; schema governed by application code
 */
export interface ReportRunRow {
  readonly id: string; // UUID
  readonly upload_id: string | null; // FK to uploads.id
  readonly status: ReportRunStatus;
  readonly period: string; // ISO month (e.g., "2026-04")
  readonly fact_bundle_path: string | null; // outputs/{yyyy}/{mm}/{runId}/fact-bundle.json
  readonly briefing_md_path: string | null; // outputs/{yyyy}/{mm}/{runId}/briefing.md
  readonly briefing_pdf_path: string | null; // outputs/{yyyy}/{mm}/{runId}/briefing.pdf
  readonly metadata: Json; // Custom workflow state (LangGraph thread ID, HiTL dispositions, etc.)
  readonly created_at: string; // ISO timestamp, auto-set by DB
  readonly updated_at: string; // ISO timestamp, auto-updated by DB trigger
}

/**
 * Insert record for report_runs table.
 * Period required; status defaults to "pending".
 */
export interface ReportRunInsert {
  readonly id?: string; // Optional; UUID generated if omitted
  readonly upload_id?: string | null;
  readonly status?: ReportRunStatus; // Defaults to "pending"
  readonly period: string; // REQUIRED
  readonly fact_bundle_path?: string | null;
  readonly briefing_md_path?: string | null;
  readonly briefing_pdf_path?: string | null;
  readonly metadata?: Json; // Defaults to {}
}

/**
 * Update record for report_runs table.
 * All fields optional (PATCH semantics).
 * updated_at is auto-managed by DB trigger.
 */
export interface ReportRunUpdate {
  readonly status?: ReportRunStatus;
  readonly period?: string;
  readonly fact_bundle_path?: string | null;
  readonly briefing_md_path?: string | null;
  readonly briefing_pdf_path?: string | null;
  readonly metadata?: Json;
}

// ============================================================================
// DATABASE TYPE (for Supabase client)
// ============================================================================

/**
 * Supabase Database schema.
 * Used to type the SupabaseClient<Database> for type-safe queries.
 *
 * Note: Supabase client doesn't fully use these types for Insert/Update.
 * Cast results as needed, or update method to be typed correctly.
 */
export interface Database {
  public: {
    Tables: {
      uploads: {
        Row: UploadRow;
        Insert: UploadInsert;
        Update: UploadUpdate;
      };
      report_runs: {
        Row: ReportRunRow;
        Insert: ReportRunInsert;
        Update: ReportRunUpdate;
      };
    };
  };
}
