import type { SupabaseAdminClient } from "../supabase/admin-client.js";
import type { UploadRow } from "../db/types.js";
export type UploadCsvMeta = {
    originalFilename: string;
    /** Defaults to `text/csv`. */
    contentType?: string;
};
/**
 * Upload a CSV to Storage and insert a metadata row in `public.uploads`.
 */
export declare function uploadCsv(client: SupabaseAdminClient, body: Buffer | Uint8Array, meta: UploadCsvMeta): Promise<UploadRow>;
/** Fetch a single upload row by primary key. */
export declare function getUploadRecord(client: SupabaseAdminClient, uploadId: string): Promise<UploadRow | null>;
export type ListUploadsOptions = {
    limit?: number;
};
/** List recent uploads (newest first). */
export declare function listUploads(client: SupabaseAdminClient, options?: ListUploadsOptions): Promise<UploadRow[]>;
/**
 * Download the CSV bytes for an upload (private bucket — uses service role).
 */
export declare function downloadCsv(client: SupabaseAdminClient, uploadId: string): Promise<{
    row: UploadRow;
    data: Blob;
}>;
//# sourceMappingURL=uploads.d.ts.map