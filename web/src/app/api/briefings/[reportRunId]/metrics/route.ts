import type { NextRequest } from "next/server";

interface MetricsResponse {
  totalRevenue: number;
  avgOrderValue: number;
  totalUnitsSold: number;
  periodMonth: string;
}

/**
 * GET /api/briefings/:reportRunId/metrics
 * Calculate KPI metrics (Total Revenue, AOV) from sales data for the briefing period
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reportRunId: string }> },
) {
  const { reportRunId } = await params;

  try {
    const { getReportRun, createSupabaseAdminClient, loadEnv } = await import(
      "@manukora/backend"
    );

    const env = loadEnv();
    const client = createSupabaseAdminClient(env);

    // Get the report run to know the period
    const reportRun = await getReportRun(client, reportRunId);
    if (!reportRun) {
      return Response.json(
        { error: "Report run not found" },
        { status: 404 },
      );
    }

    const period = reportRun.period; // "2026-04"

    // Join in Postgres via the FK relationship (product_catalog.sku -> sales_history.sku)
    const { data: sales, error: salesError } = await client
      .from("sales_history")
      .select(`
        sku,
        units_sold,
        product_catalog!inner(retail_price_usd)
      `);

    if (salesError) throw new Error(`Query failed: ${salesError.message}`);

    // Calculate metrics
    let totalRevenue = 0;
    let totalUnitsSold = 0;
    const uniqueSkus = new Set<string>();

    for (const sale of sales ?? []) {
      const unitsSold = (sale.units_sold as number) || 0;
      const catalog = Array.isArray(sale.product_catalog)
        ? sale.product_catalog[0]
        : sale.product_catalog;
      const price = (catalog?.retail_price_usd as number) ?? 0;
      totalRevenue += unitsSold * price;
      totalUnitsSold += unitsSold;
      uniqueSkus.add(sale.sku as string);
    }

    // Average Order Value: revenue per unique SKU
    const avgOrderValue =
      uniqueSkus.size > 0 ? totalRevenue / uniqueSkus.size : 0;

    return Response.json(
      {
        totalRevenue: Math.round(totalRevenue),
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        totalUnitsSold,
        periodMonth: period,
      } as MetricsResponse,
      {
        headers: {
          "Cache-Control": "max-age=60, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("Get metrics failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get metrics" },
      { status: 500 },
    );
  }
}
