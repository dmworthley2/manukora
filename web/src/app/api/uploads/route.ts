export async function POST(req: Request) {
  try {
    const { uploadCsv, createSupabaseAdminClient, loadEnv } = await import(
      "@manukora/backend"
    );

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return Response.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    const csvBytes = new Uint8Array(await file.arrayBuffer());

    console.log("DEBUG: process.env keys =", Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('ANTHROPIC')));
    console.log("DEBUG: SUPABASE_URL =", process.env.SUPABASE_URL);
    console.log("DEBUG: SUPABASE_SERVICE_ROLE_KEY length =", process.env.SUPABASE_SERVICE_ROLE_KEY?.length);

    const env = loadEnv();
    console.log("DEBUG: After loadEnv - env.SUPABASE_URL =", env.SUPABASE_URL);
    const client = createSupabaseAdminClient(env);

    const uploadRow = await uploadCsv(client, csvBytes, {
      originalFilename: file.name,
      contentType: file.type || "text/csv",
    });

    return Response.json(uploadRow, { status: 201 });
  } catch (error) {
    console.error("Upload failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const { listUploads, createSupabaseAdminClient, loadEnv } = await import(
      "@manukora/backend"
    );
    const env = loadEnv();
    const client = createSupabaseAdminClient(env);
    const uploads = await listUploads(client, { limit: 50 });

    return Response.json(uploads);
  } catch (error) {
    console.error("List uploads failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to list uploads" },
      { status: 500 },
    );
  }
}
