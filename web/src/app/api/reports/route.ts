import type { CreateReportRunInput } from "@manukora/backend";

export async function POST(req: Request) {
  try {
    const { createReportRun, createSupabaseAdminClient, loadEnv } = await import(
      "@manukora/backend"
    );
    const body = (await req.json()) as CreateReportRunInput;
    const env = loadEnv();
    const client = createSupabaseAdminClient(env);

    const run = await createReportRun(client, {
      period: body.period,
      uploadId: body.uploadId,
      status: body.status ?? "pending",
      metadata: body.metadata,
    });

    return Response.json(run, { status: 201 });
  } catch (error) {
    console.error("Create report run failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create report" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const { listReportRuns, createSupabaseAdminClient, loadEnv } = await import(
      "@manukora/backend"
    );
    const env = loadEnv();
    const client = createSupabaseAdminClient(env);
    const runs = await listReportRuns(client, { limit: 50 });

    return Response.json(runs);
  } catch (error) {
    console.error("List report runs failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to list reports" },
      { status: 500 },
    );
  }
}
