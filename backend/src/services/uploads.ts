import { randomUUID } from "node:crypto";
import type { SupabaseAdminClient } from "../supabase/admin-client.js";
import type { UploadRow } from "../db/types.js";
import { BUCKET_UPLOADS, DEFAULT_CSV_CONTENT_TYPE } from "../lib/constants.js";
import { sha256Hex } from "../lib/hash.js";
import { uploadObjectKey } from "../lib/paths.js";
import { log } from "../lib/log.js";

export type UploadCsvMeta = {
  originalFilename: string;
  /** Defaults to `text/csv`. */
  contentType?: string;
};

function toBuffer(body: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(body) ? body : Buffer.from(body);
}

/**
 * Upload a CSV to Storage and insert a metadata row in `public.uploads`.
 */
export async function uploadCsv(
  client: SupabaseAdminClient,
  body: Buffer | Uint8Array,
  meta: UploadCsvMeta,
): Promise<UploadRow> {
  const buffer = toBuffer(body);
  const id = randomUUID();
  const storagePath = uploadObjectKey(id);
  const contentType = meta.contentType ?? DEFAULT_CSV_CONTENT_TYPE;
  const digest = sha256Hex(buffer);

  const { error: upErr } = await client.storage.from(BUCKET_UPLOADS).upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });
  if (upErr) {
    log.error("storage.upload failed", { bucket: BUCKET_UPLOADS, storagePath });
    throw new Error(`Storage upload failed: ${upErr.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client
    .from("uploads")
    .insert({
      id,
      storage_path: storagePath,
      bucket: BUCKET_UPLOADS,
      original_filename: meta.originalFilename,
      byte_size: buffer.length,
      content_type: contentType,
      content_sha256: digest,
    }) as any)
    .select()
    .single();

  if (error || !data) {
    log.error("uploads.insert failed", { uploadId: id });
    throw new Error(`uploads insert failed: ${error?.message ?? "no row"}`);
  }

  log.info("upload registered", { uploadId: id, byte_size: buffer.length });
  return data as UploadRow;
}

/** Fetch a single upload row by primary key. */
export async function getUploadRecord(
  client: SupabaseAdminClient,
  uploadId: string,
): Promise<UploadRow | null> {
  const { data, error } = await client.from("uploads").select("*").eq("id", uploadId).maybeSingle();
  if (error) {
    throw new Error(`getUploadRecord failed: ${error.message}`);
  }
  return data;
}

export type ListUploadsOptions = {
  limit?: number;
};

/** List recent uploads (newest first). */
export async function listUploads(
  client: SupabaseAdminClient,
  options: ListUploadsOptions = {},
): Promise<UploadRow[]> {
  const limit = options.limit ?? 100;
  const { data, error } = await client
    .from("uploads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`listUploads failed: ${error.message}`);
  }
  return data ?? [];
}

/**
 * Download the CSV bytes for an upload (private bucket — uses service role).
 */
export async function downloadCsv(
  client: SupabaseAdminClient,
  uploadId: string,
): Promise<{ row: UploadRow; data: Blob }> {
  const row = await getUploadRecord(client, uploadId);
  if (!row) {
    throw new Error(`upload not found: ${uploadId}`);
  }
  const { data, error } = await client.storage.from(row.bucket).download(row.storage_path);
  if (error || !data) {
    throw new Error(`downloadCsv failed: ${error?.message ?? "no blob"}`);
  }
  return { row, data };
}
