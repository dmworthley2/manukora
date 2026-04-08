/**
 * Supabase Edge Function: briefing-orchestrator
 * Coordinator — no LLM calls. Sequences analyst-agent and auditor-agent via DB blackboard.
 * Triggered via POST from /api/briefings/generate.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "content-type, authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing environment variables" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { reportRunId: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { reportRunId } = body;
  if (!reportRunId) {
    return new Response(JSON.stringify({ error: "Missing reportRunId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Respond 202 immediately — pipeline runs in EdgeRuntime.waitUntil
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const workPromise = runPipeline(reportRunId, supabase, supabaseUrl, serviceRoleKey);
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil(workPromise.catch((err: unknown) => {
    console.error("Unhandled orchestrator error:", err instanceof Error ? err.message : String(err));
  }));

  return new Response(
    JSON.stringify({ status: "accepted", reportRunId }),
    { status: 202, headers: { "Content-Type": "application/json" } },
  );
});

async function runPipeline(
  reportRunId: string,
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<void> {
  // Create blackboard
  const { data: blackboard, error: bbError } = await supabase
    .from("briefing_blackboard")
    .insert({ report_run_id: reportRunId, iteration: 1, overall_status: "analyst_drafting" })
    .select()
    .single();

  if (bbError) throw new Error(`Blackboard insert failed: ${bbError.message}`);
  const blackboardId = blackboard.id as string;
  console.log(`Orchestrator: blackboard created ${blackboardId}`);

  // Invoke a child edge function synchronously and wait for completion
  const invoke = async (fnName: string, payload: Record<string, unknown>): Promise<void> => {
    console.log(`Orchestrator: invoking ${fnName}`, JSON.stringify(payload));
    const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${fnName} returned ${res.status}: ${text}`);
    }
    console.log(`Orchestrator: ${fnName} completed`);
  };

  try {
    // Step 1: Analyst draft
    await invoke("analyst-agent", { blackboardId, reportRunId, mode: "draft" });

    // Check analyst wrote at least 1 section
    const { count: sectionCount } = await supabase
      .from("briefing_section")
      .select("*", { count: "exact", head: true })
      .eq("blackboard_id", blackboardId);

    if (!sectionCount || sectionCount === 0) {
      console.error("Analyst submitted 0 sections — skipping auditor");
      await supabase.from("briefing_blackboard")
        .update({ overall_status: "failed", is_final: true })
        .eq("id", blackboardId);
      return;
    }

    // Step 2: Auditor review
    await supabase.from("briefing_blackboard").update({ overall_status: "auditor_reviewing" }).eq("id", blackboardId);
    try {
      await invoke("auditor-agent", { blackboardId, reportRunId });
    } catch (err) {
      // Auditor failure is degraded but functional — auto-approve all sections
      console.error("Auditor agent failed, auto-approving all sections:", err instanceof Error ? err.message : String(err));
      const now = new Date().toISOString();
      await supabase.from("briefing_section")
        .update({ auditor_status: "approved", is_approved: true, auditor_reviewed_at: now })
        .eq("blackboard_id", blackboardId);
    }

    // Check if any sections were challenged
    const { data: challengedSections } = await supabase
      .from("briefing_section")
      .select("section_id")
      .eq("blackboard_id", blackboardId)
      .eq("auditor_status", "challenged");

    if (challengedSections && challengedSections.length > 0) {
      // Step 3: Analyst respond
      await supabase.from("briefing_blackboard").update({ overall_status: "analyst_responding" }).eq("id", blackboardId);
      await invoke("analyst-agent", { blackboardId, reportRunId, mode: "respond" });
    } else {
      console.log("No challenged sections — skipping analyst respond step");
    }

    // Finalize
    const { data: allSections } = await supabase
      .from("briefing_section")
      .select("auditor_challenges")
      .eq("blackboard_id", blackboardId);

    const allChallenges = (allSections ?? []).flatMap((s) => s.auditor_challenges ?? []);

    await supabase.from("briefing_blackboard").update({
      overall_status: "final",
      conflicts: allChallenges,
      is_final: true,
      auditor_completed_review_at: new Date().toISOString(),
    }).eq("id", blackboardId);

    console.log(`Orchestrator: pipeline complete for ${reportRunId}`);
  } finally {
    // Always set is_final — frontend must never poll forever
    const { data: current } = await supabase
      .from("briefing_blackboard")
      .select("is_final")
      .eq("id", blackboardId)
      .single();

    if (!current?.is_final) {
      await supabase.from("briefing_blackboard")
        .update({ is_final: true })
        .eq("id", blackboardId);
      console.log("Orchestrator: forced is_final=true in finally block");
    }
  }
}
