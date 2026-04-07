/**
 * Trigger briefing workflow asynchronously.
 * Imports dynamically to avoid runtime deps on backend at Next.js build time.
 * @param reportRunId - Report run ID for finalization
 * @param factBundle - Processed fact bundle with inventory analysis
 * @param period - Analysis period (YYYY-MM)
 * @param inventoryReasoningFeed - Optional agent reasoning feed for inventory context
 */
async function triggerBriefingWorkflow(
  reportRunId: string,
  factBundle: unknown,
  period: string,
  inventoryReasoningFeed: unknown = null,
): Promise<void> {
  const { runBriefingWorkflow, finalizeBriefing, loadEnv, createSupabaseAdminClient } =
    await import("@manukora/backend");

  try {
    const env = loadEnv();
    const client = createSupabaseAdminClient(env);

    // Run the briefing workflow (sync, with 5-min timeout internally)
    // Pass inventory reasoning feed as context for agent prompts
    const state = await runBriefingWorkflow(
      factBundle as never,
      reportRunId,
      period,
      env,
      client,
      inventoryReasoningFeed,
    );

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
      extractInventoryDataWithUploadId,
      inventory,
      calculateReorderRecommendations,
      getSellThroughAnalysis,
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
    console.log("[CSV Process] Starting CSV processing with fieldMapping:", Object.entries(fieldMapping).slice(0, 5));
    const result = processCsv(csvBytes, { fieldMapping });

    console.log(`[CSV Process] Result success=${result.success}, errors=${result.errors.length}`);

    if (!result.success) {
      // Log all errors for debugging
      console.error("[CSV Process] Validation failed:", result.errors);

      // Get detailed error messages for debugging
      const errorMessages = result.errors.map(e => {
        let msg = `[${e.stage}] ${e.message}`;
        if (e.detail) {
          if (Array.isArray(e.detail)) {
            msg += `: ${e.detail.map(d => {
              if (typeof d === 'object' && d !== null) {
                return `field=${(d as any).field}, value="${(d as any).value}", reason=${(d as any).reason}`;
              }
              return JSON.stringify(d);
            }).join(' | ')}`;
          } else {
            msg += `: ${JSON.stringify(e.detail).substring(0, 200)}`;
          }
        }
        return msg;
      });

      console.error("[CSV Process] Error messages:", errorMessages);

      return Response.json(
        {
          error: "CSV validation failed",
          details: errorMessages,
          fullErrors: result.errors,
        },
        { status: 400 },
      );
    }

    console.log(`[CSV Process] CSV validated successfully, ${result.rows?.length || 0} rows`);

    // Store upload and create report
    const env = loadEnv();
    const client = createSupabaseAdminClient(env);

    const uploadRow = await uploadCsv(client, csvBytes, {
      originalFilename: file.name,
      contentType: file.type || "text/csv",
    });

    // Extract and store inventory data
    // This is optional; log warnings but don't fail the upload if inventory parsing fails
    let inventoryReasoningFeed = null;
    const inventoryWarnings: string[] = [];

    if (result.success && result.rows) {
      try {
        const inventoryData = extractInventoryDataWithUploadId(result.rows, fieldMapping, uploadRow.id);

        // Insert into database
        const catalogResult = await inventory.upsertProductCatalog(client, inventoryData.products);
        if (!catalogResult.success) {
          inventoryWarnings.push(`Product catalog insert failed: ${catalogResult.error}`);
        }

        const inventoryResult = await inventory.upsertInventoryState(
          client,
          inventoryData.inventoryState,
        );
        if (!inventoryResult.success) {
          inventoryWarnings.push(`Inventory state insert failed: ${inventoryResult.error}`);
        }

        const salesResult = await inventory.insertSalesHistory(client, inventoryData.salesHistory);
        if (!salesResult.success) {
          inventoryWarnings.push(`Sales history insert failed: ${salesResult.error}`);
        }

        // Query reasoning feed for agent use
        inventoryReasoningFeed = await inventory.queryAgentReasoningFeed(client);

        // Enrich fact bundle with inventory analysis if successful
        if (result.factBundle && inventoryReasoningFeed && inventoryReasoningFeed.length > 0) {
          const { recommendations, flags } = calculateReorderRecommendations(inventoryReasoningFeed);
          const sellThroughAnalysis = getSellThroughAnalysis(inventoryReasoningFeed);

          // Categorize cover risks by level
          const coverRisks: { critical: string[]; high: string[]; medium: string[] } = {
            critical: [],
            high: [],
            medium: [],
          };

          for (const row of inventoryReasoningFeed) {
            const daysOfCover = Math.round(row.months_of_cover * 30);
            const targetDays = row.target_months_cover * 30;

            if (daysOfCover < 10) {
              coverRisks.critical.push(row.sku);
            } else if (daysOfCover < targetDays / 2) {
              coverRisks.high.push(row.sku);
            } else if (daysOfCover < targetDays) {
              coverRisks.medium.push(row.sku);
            }
          }

          // Enrich fact bundle with inventory analysis by creating new object
          result.factBundle = {
            ...result.factBundle,
            inventoryAnalysis: {
              reorderRecommendations: recommendations,
              sellThroughAnalysis: {
                topPerformers: sellThroughAnalysis.topPerformers.map((p) => p.sku),
                poorPerformers: sellThroughAnalysis.poorPerformers.map((p) => p.sku),
                decliners: sellThroughAnalysis.decliners.map((d) => d.sku),
              },
              coverRisks,
              specialCases: flags,
            },
          };
        }
      } catch (err) {
        // Log warning but don't fail the upload
        const message = err instanceof Error ? err.message : String(err);
        console.warn("Inventory parsing failed:", message);
        inventoryWarnings.push(`Inventory parsing failed: ${message}`);
      }
    }

    const reportRun = await createReportRun(client, {
      period,
      uploadId: uploadRow.id,
      status: "completed",
      metadata: {
        rowCount: result.rows?.length || 0,
        uniqueSkus: result.factBundle?.metadata.uniqueSkus || 0,
        recommendationCount: result.factBundle?.reorderRecommendations.length || 0,
        inventoryDataInserted: inventoryReasoningFeed !== null,
      },
    });

    // Finalize with fact bundle
    if (result.factBundle) {
      await finalizeRun(client, reportRun.id, {
        factBundle: Buffer.from(JSON.stringify(result.factBundle, null, 2)),
      });
    }

    // Trigger briefing workflow asynchronously (fire-and-forget)
    // Pass inventory reasoning feed to the workflow
    if (result.factBundle) {
      triggerBriefingWorkflow(reportRun.id, result.factBundle, period, inventoryReasoningFeed)
        .catch((err) => console.error("Briefing workflow error:", err));
    }

    return Response.json(
      {
        success: true,
        reportRunId: reportRun.id,
        uploadId: uploadRow.id,
        factBundle: result.factBundle,
        warnings: [...(result.warnings || []), ...inventoryWarnings],
        inventoryDataInserted: inventoryReasoningFeed !== null,
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
