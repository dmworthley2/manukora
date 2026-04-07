/**
 * GET /api/sales?reportRunId=:reportRunId&period=:period
 * Sales data route: Returns raw sales history by SKU and channel
 *
 * Response includes:
 * - Sales data aggregated by (sku, channel) with M1-M4 columns
 * - Metadata (SKU count, record count, channels)
 * - No interpretation (strict reflection of database)
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

    const {
      createSupabaseAdminClient,
      loadEnv,
      getReportRun,
    } = await import("@manukora/backend");

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

    // Query sales_history table
    const { data, error } = await client
      .from("sales_history")
      .select("sku, channel, month_period, units_sold")
      .order("sku, channel, month_period");

    if (error) {
      console.error("Sales query error:", error);
      return Response.json(
        { error: "Failed to fetch sales data" },
        { status: 500 },
      );
    }

    if (!data || data.length === 0) {
      return Response.json(
        { error: "No sales history found for this period" },
        { status: 404 },
      );
    }

    // Aggregate into (sku, channel) buckets with M1-M4 columns
    const salesMap = new Map<
      string,
      {
        sku: string;
        channel: string;
        month_1: number;
        month_2: number;
        month_3: number;
        month_4: number;
      }
    >();

    for (const row of data) {
      const key = `${row.sku}|${row.channel}`;
      if (!salesMap.has(key)) {
        salesMap.set(key, {
          sku: row.sku,
          channel: row.channel,
          month_1: 0,
          month_2: 0,
          month_3: 0,
          month_4: 0,
        });
      }
      const entry = salesMap.get(key)!;
      if (row.month_period === 1) entry.month_1 = row.units_sold;
      else if (row.month_period === 2) entry.month_2 = row.units_sold;
      else if (row.month_period === 3) entry.month_3 = row.units_sold;
      else if (row.month_period === 4) entry.month_4 = row.units_sold;
    }

    const salesData = Array.from(salesMap.values()).map((row) => ({
      sku: row.sku,
      channel: row.channel,
      month_1: row.month_1,
      month_2: row.month_2,
      month_3: row.month_3,
      month_4: row.month_4,
      total: row.month_1 + row.month_2 + row.month_3 + row.month_4,
      average_monthly: Math.round(
        (row.month_1 + row.month_2 + row.month_3 + row.month_4) / 4,
      ),
    }));

    // Get unique channels
    const channels = Array.from(new Set(salesData.map((s) => s.channel)));

    return Response.json({
      reportRunId,
      period: reportRun.period,
      metadata: {
        total_skus: new Set(salesData.map((s) => s.sku)).size,
        total_records: salesData.length,
        months_covered: ["month_1", "month_2", "month_3", "month_4"],
        channels,
      },
      sales_data: salesData,
    });
  } catch (error) {
    console.error("Get sales failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get sales data" },
      { status: 500 },
    );
  }
}
