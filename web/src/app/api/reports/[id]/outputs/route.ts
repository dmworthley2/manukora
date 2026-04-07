export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { listOutputsForRun, createSupabaseAdminClient, loadEnv } = await import(
      "@manukora/backend"
    );
    const { id } = await params;
    const env = loadEnv();
    const client = createSupabaseAdminClient(env);
    const result = await listOutputsForRun(client, id, {
      expiresInSeconds: 3600, // 1 hour
    });

    return Response.json(result);
  } catch (error) {
    console.error("List outputs failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to list outputs" },
      { status: 500 },
    );
  }
}
