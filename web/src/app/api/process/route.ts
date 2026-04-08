export async function POST(req: Request) {
  try {
    const {
      processCsv,
      inferFieldMapping,
      createSupabaseAdminClient,
      createReportRun,
      loadEnv,
      uploadCsv,
      extractInventoryDataWithUploadId,
      inventory,
    } = await import("@manukora/backend");

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const period = (formData.get("period") as string) || new Date().toISOString().slice(0, 7);

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const csvBytes = new Uint8Array(await file.arrayBuffer());
    const csvText = new TextDecoder().decode(csvBytes);
    const headers = csvText.split("\n")[0]?.split(",").map((h) => h.trim()) || [];

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

    // Parse and validate CSV
    const result = processCsv(csvBytes, { fieldMapping });
    if (!result.success) {
      const errorMessages = result.errors.map((e) => {
        let msg = `[${e.stage}] ${e.message}`;
        if (e.detail) {
          if (Array.isArray(e.detail)) {
            msg += `: ${e.detail
              .map((d) => {
                if (typeof d === "object" && d !== null) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  return `field=${(d as any).field}, value="${(d as any).value}", reason=${(d as any).reason}`;
                }
                return JSON.stringify(d);
              })
              .join(" | ")}`;
          } else {
            msg += `: ${JSON.stringify(e.detail).substring(0, 200)}`;
          }
        }
        return msg;
      });
      return Response.json({ error: "CSV validation failed", details: errorMessages }, { status: 400 });
    }

    const env = loadEnv();
    const client = createSupabaseAdminClient(env);

    // Store the raw CSV file
    const uploadRow = await uploadCsv(client, csvBytes, {
      originalFilename: file.name,
      contentType: file.type || "text/csv",
    });

    if (!result.rows) {
      return Response.json({ error: "No rows parsed from CSV" }, { status: 400 });
    }

    // Truncate existing inventory tables before loading fresh data
    await Promise.all([
      client.from("product_catalog").delete().neq("sku", ""),
      client.from("inventory_state").delete().neq("sku", ""),
      client.from("sales_history").delete().neq("sku", ""),
    ]);

    // Insert inventory data
    const inventoryData = extractInventoryDataWithUploadId(result.rows, fieldMapping, uploadRow.id);

    const catalogResult = await inventory.upsertProductCatalog(client, inventoryData.products);
    if (!catalogResult.success) {
      return Response.json({ error: `Product catalog insert failed: ${catalogResult.error}` }, { status: 400 });
    }

    const inventoryResult = await inventory.upsertInventoryState(client, inventoryData.inventoryState);
    if (!inventoryResult.success) {
      return Response.json({ error: `Inventory state insert failed: ${inventoryResult.error}` }, { status: 400 });
    }

    const salesResult = await inventory.insertSalesHistory(client, inventoryData.salesHistory);
    if (!salesResult.success) {
      return Response.json({ error: `Sales history insert failed: ${salesResult.error}` }, { status: 400 });
    }

    // Record the upload
    const reportRun = await createReportRun(client, {
      period,
      uploadId: uploadRow.id,
      status: "completed",
      metadata: {
        rowCount: result.rows.length,
        uniqueSkus: inventoryData.products.length,
      },
    });

    return Response.json(
      {
        success: true,
        reportRunId: reportRun.id,
        uploadId: uploadRow.id,
        rowCount: result.rows.length,
        skuCount: inventoryData.products.length,
        warnings: result.warnings || [],
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
