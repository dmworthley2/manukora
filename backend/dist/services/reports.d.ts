import type { SupabaseAdminClient } from "../supabase/admin-client.js";
import type { Json, ReportRunRow, ReportRunStatus } from "../db/types.js";
export type CreateReportRunInput = {
    readonly period: string;
    readonly uploadId?: string | null;
    readonly status?: ReportRunStatus;
    readonly metadata?: Json;
};
/** Insert a `report_runs` row (typically `pending` before processing). */
export declare function createReportRun(client: SupabaseAdminClient, input: CreateReportRunInput): Promise<ReportRunRow>;
export type FinalizeRunArtifacts = {
    factBundle?: Buffer | Uint8Array;
    briefingMd?: Buffer | Uint8Array;
    briefingPdf?: Buffer | Uint8Array;
};
/**
 * Upload all provided artifacts under `outputs/{yyyy}/{mm}/{runId}/` and mark the run `completed`.
 */
export declare function finalizeRun(client: SupabaseAdminClient, runId: string, artifacts: FinalizeRunArtifacts): Promise<ReportRunRow>;
/**
 * Upload a single artifact and optionally set the matching column on `report_runs`.
 * Useful for incremental saves before a final status flip.
 */
export declare function saveReportArtifact(client: SupabaseAdminClient, options: {
    runId: string;
    fileName: string;
    body: Buffer | Uint8Array;
    contentType: string;
    /** When set, updates the corresponding path column after upload. */
    column?: "fact_bundle_path" | "briefing_md_path" | "briefing_pdf_path";
}): Promise<{
    storagePath: string;
}>;
export type ArtifactUrl = {
    kind: "fact_bundle" | "briefing_md" | "briefing_pdf";
    path: string;
    signedUrl: string;
};
export type ListOutputsResult = {
    run: ReportRunRow;
    artifacts: ArtifactUrl[];
};
/**
 * Return signed URLs for all stored artifacts on a run (for private buckets).
 */
export declare function listOutputsForRun(client: SupabaseAdminClient, runId: string, options?: {
    expiresInSeconds?: number;
}): Promise<ListOutputsResult>;
export type GetReportDownloadUrlInput = {
    bucket: string;
    path: string;
    expiresIn?: number;
};
/** Signed URL for downloading one object from Storage. */
export declare function getReportDownloadUrl(client: SupabaseAdminClient, input: GetReportDownloadUrlInput): Promise<string>;
/** Fetch a single report run by id. */
export declare function getReportRun(client: SupabaseAdminClient, runId: string): Promise<ReportRunRow | null>;
export type ListReportRunsOptions = {
    limit?: number;
};
export declare function listReportRuns(client: SupabaseAdminClient, options?: ListReportRunsOptions): Promise<ReportRunRow[]>;
export declare function updateReportRunStatus(client: SupabaseAdminClient, runId: string, status: ReportRunStatus, metadataPatch?: Json): Promise<ReportRunRow>;
//# sourceMappingURL=reports.d.ts.map