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

    // Two separate queries to avoid PostgREST schema cache join issues
    const [{ data: sales, error: salesError }, { data: catalog, error: catalogError }] =
      await Promise.all([
        client.from("sales_history").select("sku, units_sold"),
        client.from("product_catalog").select("sku, retail_price_usd"),
      ]);

    if (salesError) throw new Error(`Query failed: ${salesError.message}`);
    if (catalogError) throw new Error(`Query failed: ${catalogError.message}`);

    const priceMap = new Map<string, number>(
      (catalog ?? []).map((r) => [r.sku as string, (r.retail_price_usd as number) ?? 0]),
    );

    // Calculate metrics
    let totalRevenue = 0;
    let totalUnitsSold = 0;
    const uniqueSkus = new Set<string>();

    for (const sale of sales ?? []) {
      const unitsSold = (sale.units_sold as number) || 0;
      const price = priceMap.get(sale.sku as string) ?? 0;
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
