import { BUCKET_OUTPUTS } from "../lib/constants.js";
import { outputPrefix } from "../lib/paths.js";
import { log } from "../lib/log.js";
function toBuffer(body) {
    return Buffer.isBuffer(body) ? body : Buffer.from(body);
}
/** Insert a `report_runs` row (typically `pending` before processing). */
export async function createReportRun(client, input) {
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
    const row = data;
    log.info("report_run created", { runId: row.id, period: row.period });
    return row;
}
const FACT_BUNDLE = "fact-bundle.json";
const BRIEFING_MD = "briefing.md";
const BRIEFING_PDF = "briefing.pdf";
/**
 * Upload all provided artifacts under `outputs/{yyyy}/{mm}/{runId}/` and mark the run `completed`.
 */
export async function finalizeRun(client, runId, artifacts) {
    const run = await getReportRun(client, runId);
    if (!run) {
        throw new Error(`report run not found: ${runId}`);
    }
    const base = outputPrefix(run.period, runId);
    let fact_bundle_path = null;
    let briefing_md_path = null;
    let briefing_pdf_path = null;
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
    const { data, error } = await client
        .from("report_runs")
        .update({
        status: "completed",
        fact_bundle_path,
        briefing_md_path,
        briefing_pdf_path,
    })
        .eq("id", runId)
        .select()
        .single();
    if (error || !data) {
        throw new Error(`finalizeRun update failed: ${error?.message ?? "no row"}`);
    }
    log.info("report_run finalized", { runId });
    return data;
}
async function uploadBlob(client, path, body, contentType) {
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
export async function saveReportArtifact(client, options) {
    const run = await getReportRun(client, options.runId);
    if (!run) {
        throw new Error(`report run not found: ${options.runId}`);
    }
    const base = outputPrefix(run.period, options.runId);
    const storagePath = `${base}/${options.fileName}`;
    await uploadBlob(client, storagePath, toBuffer(options.body), options.contentType);
    if (options.column) {
        const patch = { [options.column]: storagePath };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await client.from("report_runs").update(patch).eq("id", options.runId);
        if (error) {
            throw new Error(`saveReportArtifact patch failed: ${error.message}`);
        }
    }
    return { storagePath };
}
/**
 * Return signed URLs for all stored artifacts on a run (for private buckets).
 */
export async function listOutputsForRun(client, runId, options = {}) {
    const run = await getReportRun(client, runId);
    if (!run) {
        throw new Error(`report run not found: ${runId}`);
    }
    const expiresIn = options.expiresInSeconds ?? 3600;
    const artifacts = [];
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
/** Signed URL for downloading one object from Storage. */
export async function getReportDownloadUrl(client, input) {
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
export async function getReportRun(client, runId) {
    const { data, error } = await client.from("report_runs").select("*").eq("id", runId).maybeSingle();
    if (error) {
        throw new Error(`getReportRun failed: ${error.message}`);
    }
    return data;
}
export async function listReportRuns(client, options = {}) {
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
export async function updateReportRunStatus(client, runId, status, metadataPatch) {
    const existing = await getReportRun(client, runId);
    if (!existing) {
        throw new Error(`report run not found: ${runId}`);
    }
    let metadata = existing.metadata;
    if (metadataPatch !== undefined) {
        if (typeof existing.metadata === "object" &&
            existing.metadata !== null &&
            !Array.isArray(existing.metadata) &&
            typeof metadataPatch === "object" &&
            metadataPatch !== null &&
            !Array.isArray(metadataPatch)) {
            metadata = { ...existing.metadata, ...metadataPatch };
        }
        else {
            metadata = metadataPatch;
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await client
        .from("report_runs")
        .update({ status, metadata })
        .eq("id", runId)
        .select()
        .single();
    if (error || !data) {
        throw new Error(`updateReportRunStatus failed: ${error?.message ?? "no row"}`);
    }
    return data;
}
//# sourceMappingURL=reports.js.map