/**
 * Trigger briefing workflow asynchronously.
 * Imports dynamically to avoid runtime deps on backend at Next.js build time.
 */
async function triggerBriefingWorkflow(
  reportRunId: string,
  factBundle: unknown,
  period: string,
): Promise<void> {
  const { runBriefingWorkflow, finalizeBriefing, loadEnv, createSupabaseAdminClient } =
    await import("@manukora/backend");

  try {
    const env = loadEnv();
    const client = createSupabaseAdminClient(env);

    // Run the briefing workflow (sync, with 5-min timeout internally)
    const state = await runBriefingWorkflow(factBundle as never, reportRunId, period, env);

    // Save artifacts and update report_runs
    await finalizeBriefing(client, reportRunId, state);
  } catch (err) {
    // Log error but don't rethrow (fire-and-forget pattern)
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Briefing workflow failed for ${reportRunId}: ${message}`);
  }
}

export async function POST(req: Request) {
  try {
    const {
      processCsv,
      inferFieldMapping,
      createSupabaseAdminClient,
      createReportRun,
      finalizeRun,
      loadEnv,
      uploadCsv,
    } = await import("@manukora/backend");

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const period = (formData.get("period") as string) || new Date().toISOString().slice(0, 7); // YYYY-MM

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const csvBytes = new Uint8Array(await file.arrayBuffer());
    const csvText = new TextDecoder().decode(csvBytes);
    const lines = csvText.split("\n");
    const headers = lines[0]?.split(",").map((h) => h.trim()) || [];

    // Auto-detect field mapping
    let fieldMapping;
    try {
      fieldMapping = inferFieldMapping(headers);
    } catch (err) {
      return Response.json(
        { error: `Failed to infer field mapping: ${err instanceof Error ? err.message : "Unknown error"}` },
        { status: 400 },
      );
    }

    // Process CSV
    const result = processCsv(csvBytes, { fieldMapping });

    if (!result.success) {
      return Response.json(
        {
          error: "CSV validation failed",
          details: result.errors.slice(0, 5),
        },
        { status: 400 },
      );
    }

    // Store upload and create report
    const env = loadEnv();
    const client = createSupabaseAdminClient(env);

    const uploadRow = await uploadCsv(client, csvBytes, {
      originalFilename: file.name,
      contentType: file.type || "text/csv",
    });

    const reportRun = await createReportRun(client, {
      period,
      uploadId: uploadRow.id,
      status: "completed",
      metadata: {
        rowCount: result.rows?.length || 0,
        uniqueSkus: result.factBundle?.metadata.uniqueSkus || 0,
        recommendationCount: result.factBundle?.reorderRecommendations.length || 0,
      },
    });

    // Finalize with fact bundle
    if (result.factBundle) {
      await finalizeRun(client, reportRun.id, {
        factBundle: Buffer.from(JSON.stringify(result.factBundle, null, 2)),
      });
    }

    // Trigger briefing workflow asynchronously (fire-and-forget)
    if (result.factBundle) {
      triggerBriefingWorkflow(reportRun.id, result.factBundle, period)
        .catch(err => console.error("Briefing workflow error:", err));
    }

    return Response.json(
      {
        success: true,
        reportRunId: reportRun.id,
        uploadId: uploadRow.id,
        factBundle: result.factBundle,
        warnings: result.warnings,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Process CSV failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 },
    );
  }
}
