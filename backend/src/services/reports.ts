import type { SupabaseAdminClient } from "../supabase/admin-client.js";
import type { Json, ReportRunRow, ReportRunStatus } from "../db/types.js";
import { BUCKET_OUTPUTS } from "../lib/constants.js";
import { outputPrefix } from "../lib/paths.js";
import { log } from "../lib/log.js";

function toBuffer(body: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(body) ? body : Buffer.from(body);
}

export type CreateReportRunInput = {
  readonly period: string;
  readonly uploadId?: string | null;
  readonly status?: ReportRunStatus;
  readonly metadata?: Json;
};

/** Insert a `report_runs` row (typically `pending` before processing). */
export async function createReportRun(
  client: SupabaseAdminClient,
  input: CreateReportRunInput,
): Promise<ReportRunRow> {
  const { data, error } = await client
    .from("report_runs")
    .insert({
      period: input.period,
      upload_id: input.uploadId ?? null,
      status: input.status ?? "pending",
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`createReportRun failed: ${error?.message ?? "no row"}`);
  }
  const row = data as unknown as ReportRunRow;
  log.info("report_run created", { runId: row.id, period: row.period });
  return row;
}

export type FinalizeRunArtifacts = {
  factBundle?: Buffer | Uint8Array;
  briefingMd?: Buffer | Uint8Array;
  briefingPdf?: Buffer | Uint8Array;
};

const FACT_BUNDLE = "fact-bundle.json";
const BRIEFING_MD = "briefing.md";
const BRIEFING_PDF = "briefing.pdf";

/**
 * Upload all provided artifacts under `outputs/{yyyy}/{mm}/{runId}/` and mark the run `completed`.
 */
export async function finalizeRun(
  client: SupabaseAdminClient,
  runId: string,
  artifacts: FinalizeRunArtifacts,
): Promise<ReportRunRow> {
  const run = await getReportRun(client, runId);
  if (!run) {
    throw new Error(`report run not found: ${runId}`);
  }

  const base = outputPrefix(run.period, runId);
  let fact_bundle_path: string | null = null;
  let briefing_md_path: string | null = null;
  let briefing_pdf_path: string | null = null;

  if (artifacts.factBundle) {
    const path = `${base}/${FACT_BUNDLE}`;
    await uploadBlob(client, path, toBuffer(artifacts.factBundle), "application/json");
    fact_bundle_path = path;
  }
  if (artifacts.briefingMd) {
    const path = `${base}/${BRIEFING_MD}`;
    await uploadBlob(client, path, toBuffer(artifacts.briefingMd), "text/markdown; charset=utf-8");
    briefing_md_path = path;
  }
  if (artifacts.briefingPdf) {
    const path = `${base}/${BRIEFING_PDF}`;
    await uploadBlob(client, path, toBuffer(artifacts.briefingPdf), "application/pdf");
    briefing_pdf_path = path;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client
    .from("report_runs")
    .update({
      status: "completed",
      fact_bundle_path,
      briefing_md_path,
      briefing_pdf_path,
    }) as any)
    .eq("id", runId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`finalizeRun update failed: ${error?.message ?? "no row"}`);
  }
  log.info("report_run finalized", { runId });
  return data as ReportRunRow;
}

async function uploadBlob(
  client: SupabaseAdminClient,
  path: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await client.storage.from(BUCKET_OUTPUTS).upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) {
    log.error("outputs.upload failed", { path });
    throw new Error(`Storage upload failed (${path}): ${error.message}`);
  }
}

/**
 * Upload a single artifact and optionally set the matching column on `report_runs`.
 * Useful for incremental saves before a final status flip.
 */
export async function saveReportArtifact(
  client: SupabaseAdminClient,
  options: {
    runId: string;
    fileName: string;
    body: Buffer | Uint8Array;
    contentType: string;
    /** When set, updates the corresponding path column after upload. */
    column?: "fact_bundle_path" | "briefing_md_path" | "briefing_pdf_path";
  },
): Promise<{ storagePath: string }> {
  const run = await getReportRun(client, options.runId);
  if (!run) {
    throw new Error(`report run not found: ${options.runId}`);
  }
  const base = outputPrefix(run.period, options.runId);
  const storagePath = `${base}/${options.fileName}`;
  await uploadBlob(client, storagePath, toBuffer(options.body), options.contentType);

  if (options.column) {
    const patch: Record<string, string> = { [options.column]: storagePath };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client.from("report_runs").update(patch) as any).eq("id", options.runId);
    if (error) {
      throw new Error(`saveReportArtifact patch failed: ${error.message}`);
    }
  }

  return { storagePath };
}

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
export async function listOutputsForRun(
  client: SupabaseAdminClient,
  runId: string,
  options: { expiresInSeconds?: number } = {},
): Promise<ListOutputsResult> {
  const run = await getReportRun(client, runId);
  if (!run) {
    throw new Error(`report run not found: ${runId}`);
  }
  const expiresIn = options.expiresInSeconds ?? 3600;
  const artifacts: ArtifactUrl[] = [];

  if (run.fact_bundle_path) {
    artifacts.push({
      kind: "fact_bundle",
      path: run.fact_bundle_path,
      signedUrl: await getReportDownloadUrl(client, {
        bucket: BUCKET_OUTPUTS,
        path: run.fact_bundle_path,
        expiresIn,
      }),
    });
  }
  if (run.briefing_md_path) {
    artifacts.push({
      kind: "briefing_md",
      path: run.briefing_md_path,
      signedUrl: await getReportDownloadUrl(client, {
        bucket: BUCKET_OUTPUTS,
        path: run.briefing_md_path,
        expiresIn,
      }),
    });
  }
  if (run.briefing_pdf_path) {
    artifacts.push({
      kind: "briefing_pdf",
      path: run.briefing_pdf_path,
      signedUrl: await getReportDownloadUrl(client, {
        bucket: BUCKET_OUTPUTS,
        path: run.briefing_pdf_path,
        expiresIn,
      }),
    });
  }

  return { run, artifacts };
}

export type GetReportDownloadUrlInput = {
  bucket: string;
  path: string;
  expiresIn?: number;
};

/** Signed URL for downloading one object from Storage. */
export async function getReportDownloadUrl(
  client: SupabaseAdminClient,
  input: GetReportDownloadUrlInput,
): Promise<string> {
  const expiresIn = input.expiresIn ?? 3600;
  const { data, error } = await client.storage
    .from(input.bucket)
    .createSignedUrl(input.path, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(`createSignedUrl failed: ${error?.message ?? "no url"}`);
  }
  return data.signedUrl;
}

/** Fetch a single report run by id. */
export async function getReportRun(
  client: SupabaseAdminClient,
  runId: string,
): Promise<ReportRunRow | null> {
  const { data, error } = await client.from("report_runs").select("*").eq("id", runId).maybeSingle();
  if (error) {
    throw new Error(`getReportRun failed: ${error.message}`);
  }
  return data;
}

export type ListReportRunsOptions = {
  limit?: number;
};

export async function listReportRuns(
  client: SupabaseAdminClient,
  options: ListReportRunsOptions = {},
): Promise<ReportRunRow[]> {
  const limit = options.limit ?? 100;
  const { data, error } = await client
    .from("report_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`listReportRuns failed: ${error.message}`);
  }
  return data ?? [];
}

export async function updateReportRunStatus(
  client: SupabaseAdminClient,
  runId: string,
  status: ReportRunStatus,
  metadataPatch?: Json,
): Promise<ReportRunRow> {
  const existing = await getReportRun(client, runId);
  if (!existing) {
    throw new Error(`report run not found: ${runId}`);
  }
  let metadata: Json = existing.metadata;
  if (metadataPatch !== undefined) {
    if (
      typeof existing.metadata === "object" &&
      existing.metadata !== null &&
      !Array.isArray(existing.metadata) &&
      typeof metadataPatch === "object" &&
      metadataPatch !== null &&
      !Array.isArray(metadataPatch)
    ) {
      metadata = { ...existing.metadata, ...metadataPatch } as Json;
    } else {
      metadata = metadataPatch;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client
    .from("report_runs")
    .update({ status, metadata }) as any)
    .eq("id", runId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`updateReportRunStatus failed: ${error?.message ?? "no row"}`);
  }
  return data as ReportRunRow;
}
