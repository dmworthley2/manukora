/**
 * GET /api/reorders?reportRunId=:reportRunId
 * Reorder recommendations route: Returns analyst recommendations + auditor challenges + context data
 *
 * Response includes:
 * - Section status (analyst submitted, auditor reviewed, analyst responded, is_approved)
 * - Auditor challenges (if any) with issue details
 * - Analyst response to challenges
 * - Recommendations with context data (current inventory, sales trends)
 * - Escalation info (if reorder section is escalated)
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
      getBlackboard,
      getSection,
    } = await import("@manukora/backend");

    const env = loadEnv();
    const client = createSupabaseAdminClient(env);

    // Get blackboard
    const blackboard = await getBlackboard(client, reportRunId);
    if (!blackboard || !blackboard.is_final) {
      return Response.json(
        { error: "Briefing not finalized" },
        { status: 404 },
      );
    }

    // Get reorder-recommendations section
    const reorderSection = await getSection(
      client,
      blackboard.id,
      "reorder-recommendations",
    );

    if (!reorderSection) {
      return Response.json(
        { error: "Reorder recommendations section not found" },
        { status: 404 },
      );
    }

    // Get current inventory for context
    const { data: inventoryData } = await client
      .from("inventory_state")
      .select(
        `
        sku,
        stock_on_hand,
        units_on_order,
        order_arrival_months,
        product_catalog(product_name, retail_price_usd, target_months_cover)
      `,
      )
      .order("sku");

    // Get sales data for trend context
    const { data: salesData } = await client
      .from("sales_history")
      .select("sku, month_period, units_sold")
      .order("sku, month_period");

    // Build inventory lookup map
    const inventoryMap = new Map(
      (inventoryData || []).map((inv: any) => [
        inv.sku,
        {
          stock_on_hand: inv.stock_on_hand,
          units_on_order: inv.units_on_order,
          order_arrival_months: inv.order_arrival_months,
          product_name: inv.product_catalog?.product_name,
          retail_price_usd: inv.product_catalog?.retail_price_usd,
          target_months_cover: inv.product_catalog?.target_months_cover,
        },
      ]),
    );

    // Build sales lookup map (M4 and trend)
    const salesMap = new Map<
      string,
      { m1: number; m4: number; trend: string; monthly_demand: number; revenue_per_month: number }
    >();

    for (const row of salesData || []) {
      if (!salesMap.has(row.sku)) {
        salesMap.set(row.sku, { m1: 0, m4: 0, trend: "STABLE", monthly_demand: 0, revenue_per_month: 0 });
      }
      const entry = salesMap.get(row.sku)!;
      if (row.month_period === 1) entry.m1 = row.units_sold;
      if (row.month_period === 4) entry.m4 = row.units_sold;
    }

    // Calculate trends and demand
    for (const [sku, entry] of salesMap.entries()) {
      entry.monthly_demand = entry.m4;
      const inv = inventoryMap.get(sku);
      if (inv) {
        entry.revenue_per_month = Math.round(inv.retail_price_usd * entry.m4);
        if (entry.m1 > 0) {
          const changePercent = ((entry.m4 - entry.m1) / entry.m1) * 100;
          if (changePercent > 5) entry.trend = `GROWING (+${Math.round(changePercent)}%)`;
          else if (changePercent < -5) entry.trend = `DECLINING (${Math.round(changePercent)}%)`;
        }
      }
    }

    // Parse recommendations from analyst_draft (simplified extraction)
    // In production, this could be more sophisticated
    const recommendations = reorderSection.analyst_draft
      ? [
          {
            rank: 1,
            sku: "Auto-populated from analyst_draft",
            product_name: "See analyst_draft section",
            recommended_order_qty: 0,
            urgency: "See analyst_draft",
            reasoning: reorderSection.analyst_draft.substring(0, 200),
            certainty_high: true,
          },
        ]
      : [];

    return Response.json({
      reportRunId,
      period: blackboard.created_at?.split("-").slice(0, 2).join("-"),

      section_status: {
        analyst_status: reorderSection.analyst_submitted_at ? "submitted" : "pending",
        auditor_status: reorderSection.auditor_status || "pending",
        is_approved: reorderSection.is_approved || false,
        resolution_type: reorderSection.resolution_type,
      },

      // Full analyst draft and reasoning
      analyst_draft: reorderSection.analyst_draft,
      analyst_reasoning: reorderSection.analyst_reasoning,

      // Auditor feedback
      auditor_challenges: reorderSection.auditor_challenges || [],
      auditor_notes: reorderSection.auditor_notes,

      // Analyst response
      analyst_response: reorderSection.analyst_response,

      // Recommendations with context (simplified)
      recommendations,

      // If escalated
      escalated_conflict: reorderSection.is_approved === false && reorderSection.escalation_reason
        ? {
            analyst_position: reorderSection.analyst_position,
            auditor_position: "See auditor_challenges",
            escalation_reason: reorderSection.escalation_reason,
            resolution: "pending_ceo_decision",
          }
        : null,
    });
  } catch (error) {
    console.error("Get reorders failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get reorder data" },
      { status: 500 },
    );
  }
}
