/**
 * GET /api/inventory?reportRunId=:reportRunId
 * Inventory data route: Returns current inventory snapshot with product details
 *
 * Response includes:
 * - Inventory state (stock on hand, units on order, arrival months)
 * - Product catalog data (name, price, category, MGO rating, target cover)
 * - No derived metrics (strict data from tables)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const reportRunId = searchParams.get("reportRunId");

    if (!reportRunId) {
      return Response.json(
        { error: "reportRunId query parameter is required" },
        { status: 400 },
      );
    }

    const { createSupabaseAdminClient, loadEnv, getReportRun } = await import(
      "@manukora/backend"
    );

    const env = loadEnv();
    const client = createSupabaseAdminClient(env);

    // Get report run to verify it exists and get period
    const reportRun = await getReportRun(client, reportRunId);
    if (!reportRun) {
      return Response.json(
        { error: "Report run not found" },
        { status: 404 },
      );
    }

    // Query inventory_state with product_catalog lookup
    const { data, error } = await client
      .from("inventory_state")
      .select(
        `
        sku,
        stock_on_hand,
        units_on_order,
        order_arrival_months,
        updated_at,
        product_catalog(
          product_name,
          retail_price_usd,
          target_months_cover,
          product_category,
          mgo_rating
        )
      `,
      )
      .order("sku");

    if (error) {
      console.error("Inventory query error:", error);
      return Response.json(
        { error: "Failed to fetch inventory data" },
        { status: 500 },
      );
    }

    if (!data || data.length === 0) {
      return Response.json(
        { error: "No inventory data found" },
        { status: 404 },
      );
    }

    // Transform response
    const inventoryData = (data as unknown as Array<{
      sku: string;
      stock_on_hand: number;
      units_on_order: number;
      order_arrival_months: number;
      updated_at: string;
      product_catalog: {
        product_name: string;
        retail_price_usd: number;
        target_months_cover: number;
        product_category: string;
        mgo_rating: number | null;
      };
    }>).map((row) => ({
      sku: row.sku,
      product_name: row.product_catalog?.product_name || row.sku,
      category: row.product_catalog?.product_category,
      mgo_rating: row.product_catalog?.mgo_rating,
      stock_on_hand: row.stock_on_hand,
      units_on_order: row.units_on_order,
      order_arrival_months: row.order_arrival_months,
      retail_price_usd: row.product_catalog?.retail_price_usd,
      target_months_cover: row.product_catalog?.target_months_cover,
      total_available: row.stock_on_hand + row.units_on_order,
    }));

    return Response.json({
      reportRunId,
      period: reportRun.period,
      snapshot_time: new Date().toISOString(),
      metadata: {
        total_skus: inventoryData.length,
        updated_at: data[0]?.updated_at || new Date().toISOString(),
        warehouse_location: "global",
      },
      inventory_data: inventoryData,
    });
  } catch (error) {
    console.error("Get inventory failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get inventory data" },
      { status: 500 },
    );
  }
}
