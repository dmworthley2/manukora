/**
 * POST /api/briefings/generate
 * Triggers the briefing-worker edge function to analyse all inventory data.
 * Returns the reportRunId to poll against.
 */
export async function POST() {
  try {
    const { createSupabaseAdminClient, loadEnv } = await import("@manukora/backend");

    const env = loadEnv();
    const client = createSupabaseAdminClient(env);

    // Get the latest report run (most recent upload)
    const { data: latestRun, error } = await client
      .from("report_runs")
      .select("id, period")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !latestRun) {
      return Response.json({ error: "No data uploaded yet. Upload a CSV first." }, { status: 400 });
    }

    const reportRunId = latestRun.id as string;

    // Invoke edge function — responds 202 immediately, processes in background
    console.log(`[Generate] Invoking briefing-worker for report run ${reportRunId}`);
    const { error: invokeError } = await client.functions.invoke("briefing-worker", {
      body: { reportRunId },
    });

    if (invokeError) {
      console.error(`[Generate] Edge function error:`, invokeError);
      return Response.json({ error: "Failed to start analysis" }, { status: 500 });
    }

    console.log(`[Generate] Edge function accepted for ${reportRunId}`);
    return Response.json({ reportRunId, status: "generating" }, { status: 202 });
  } catch (error) {
    console.error("Generate briefing failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate briefing" },
      { status: 500 },
    );
  }
}
