/**
 * Supabase Edge Function: briefing-worker
 * Queries inventory tables directly, runs analyst -> auditor pipeline.
 * Triggered via POST from /api/briefings/generate.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const ANALYST_SYSTEM_PROMPT = `You are a Senior CFO-level financial analyst and supply chain strategist. Your job is to transform inventory data into a compelling executive briefing that REASONS through trade-offs and drives capital allocation decisions.

Generate a 5-section briefing based on the inventory data provided:

1. **Executive Summary** — Headline: what needs immediate attention? Rank by revenue exposure and urgency.
2. **Capital Allocation Strategy** — For each priority SKU: show data, inference, revenue impact, and action. Explain trade-offs.
3. **Risk & Opportunity Flagging** — Flag high-revenue declining SKUs (manual review), growing SKUs with adequate cover (reserve capital), and special cases (Propolis phaseout, MGO 1700+ premium 3-month target, Bioactive Blends M2–M4 only).
4. **Reorder Recommendations** — Ranked by: (1) urgency (cover <15 days), (2) revenue opportunity, (3) trend. Include SKU, quantity, urgency level, revenue at stake, and reasoning.
5. **Next Steps** — Top 3 reorders for next 72 hours: what, from whom, by when. Assign decision owners.

Rules:
- Do NOT invent SKUs or numbers. Use only data provided.
- Include certainty factors for material claims: [CERTAINTY: HIGH (95%) | MEDIUM (75%) | LOW (40%)]
- State assumptions explicitly (lead times, demand stability, capital availability).
- Think like a CFO: prioritize by capital impact, flag conflicts, explain trade-offs.

Return a JSON object with this exact structure:
{
  "sections": [
    { "id": "executive-summary", "title": "Executive Summary", "content": "..." },
    { "id": "capital-allocation", "title": "Capital Allocation Strategy", "content": "..." },
    { "id": "risk-opportunity", "title": "Risk & Opportunity Flagging", "content": "..." },
    { "id": "reorder-recommendations", "title": "Reorder Recommendations", "content": "..." },
    { "id": "next-steps", "title": "Next Steps", "content": "..." }
  ],
  "generatedAt": "ISO-8601 timestamp"
}`;

const AUDITOR_SYSTEM_PROMPT = `You are a Senior CFO auditor. Fact-check the briefing against the Inventory Context provided.

Check:
1. **Numerical accuracy** — Verify revenue (price × units), days of cover, trends. Reject if >5% off.
2. **Hallucinations** — Every SKU and fact must exist in Inventory Context.
3. **Assumptions** — Surface unstated assumptions (lead times, demand stability, order quantities).
4. **Trade-offs** — Challenge unexplained priority choices.
5. **Policy compliance** — Propolis: deprioritize unless cover <30 days. MGO 1700+: use 3-month (90 day) target. Bioactive Blends: trend is M2–M4 only (launched mid-Jan 2026).

Return a JSON object:
{
  "approved": true | false,
  "hasIssues": true | false,
  "challenges": [
    {
      "id": "challenge-1",
      "type": "numerical" | "hallucination" | "assumption" | "tradeoff" | "policy",
      "section": "capital-allocation",
      "claim": "exact claim from briefing",
      "question": "specific question",
      "severity": "error" | "assumption" | "concern",
      "requestedAction": "what analyst should do"
    }
  ],
  "summary": "brief summary"
}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnalystSection = {
  id: string;
  title: string;
  content: string;
};

type AuditorResult = {
  approved: boolean;
  hasIssues: boolean;
  challenges: unknown[];
  summary: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in response");
  return JSON.parse(match[0]);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "content-type",
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
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anthropicApiKey) {
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

  // Respond 202 immediately — all work runs in EdgeRuntime.waitUntil background
  const workPromise = runBriefing(body.reportRunId, supabaseUrl, serviceRoleKey, anthropicApiKey);
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil(workPromise.catch((err: unknown) => {
    console.error("Unhandled briefing error:", err instanceof Error ? err.message : String(err));
  }));

  return new Response(
    JSON.stringify({ status: "accepted", reportRunId: body.reportRunId }),
    { status: 202, headers: { "Content-Type": "application/json" } },
  );
});

async function runBriefing(
  reportRunId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  anthropicApiKey: string,
): Promise<void> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  // 1. Query inventory data directly from tables
  const [feedResult, salesResult] = await Promise.all([
    supabase.from("agent_reasoning_feed").select("*"),
    supabase.from("sales_history").select("sku, channel, month_period, units_sold").order("sku").order("month_period"),
  ]);

  if (feedResult.error) {
    throw new Error(`Failed to query agent_reasoning_feed: ${feedResult.error.message}`);
  }
  if (salesResult.error) {
    console.error("Failed to query sales_history:", salesResult.error.message);
  }

  const inventoryRows = feedResult.data ?? [];
  const salesRows = salesResult.data ?? [];

  console.log(`Loaded ${inventoryRows.length} SKUs from agent_reasoning_feed, ${salesRows.length} sales records`);

  if (inventoryRows.length === 0) {
    throw new Error("No inventory data found — upload a CSV first");
  }

  // 2. Build context strings
  const inventoryContext = JSON.stringify(inventoryRows).slice(0, 40_000);
  const salesContext = JSON.stringify(salesRows).slice(0, 20_000);

  // 3. Create blackboard
  const { data: blackboard, error: bbError } = await supabase
    .from("briefing_blackboard")
    .insert({ report_run_id: reportRunId, iteration: 1, overall_status: "analyst_drafting" })
    .select()
    .single();

  if (bbError) throw new Error(`Blackboard insert failed: ${bbError.message}`);
  const blackboardId = blackboard.id as string;

  console.log(`Analyst call for blackboard ${blackboardId}`);

  // 4. Analyst pass
  let analystMessage;
  try {
    analystMessage = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      system: ANALYST_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `Inventory Metrics (per SKU):\n${inventoryContext}\n\nSales History:\n${salesContext}\n\nGenerate the 5-section briefing.`,
      }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Anthropic analyst call failed: ${msg}`);
    await supabase.from("briefing_blackboard").update({ overall_status: "failed", is_final: true }).eq("id", blackboardId);
    throw err;
  }

  const analystText = analystMessage.content[0]?.type === "text" ? analystMessage.content[0].text : "";
  let analystSections: AnalystSection[] = [];
  try {
    const parsed = extractJson(analystText) as { sections?: AnalystSection[] };
    analystSections = parsed.sections ?? [];
  } catch (err) {
    console.error("Failed to parse analyst response:", err);
  }

  // 5. Insert sections
  if (analystSections.length > 0) {
    const now = new Date().toISOString();
    const { error: sectionsError } = await supabase.from("briefing_section").insert(
      analystSections.map((s) => ({
        blackboard_id: blackboardId,
        section_id: s.id,
        title: s.title,
        analyst_draft: s.content,
        analyst_submitted_at: now,
        auditor_status: "pending",
        is_approved: false,
      })),
    );
    if (sectionsError) console.error("Sections insert failed:", sectionsError.message);
  }

  // 6. Auditor pass
  const sectionsText = analystSections.map((s) => `## ${s.title}\n${s.content}`).join("\n\n");
  const auditorMessage = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: AUDITOR_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `Inventory Context:\n${inventoryContext}\n\nBriefing to audit:\n${sectionsText}\n\nAudit this briefing.`,
    }],
  });

  const auditorText = auditorMessage.content[0]?.type === "text" ? auditorMessage.content[0].text : "";
  let auditorResult: AuditorResult = { approved: true, hasIssues: false, challenges: [], summary: "Approved" };
  try {
    auditorResult = extractJson(auditorText) as AuditorResult;
  } catch (err) {
    console.error("Failed to parse auditor response:", err);
  }

  // 7. Update sections with auditor verdict
  const auditorStatus = auditorResult.approved ? "approved" : "challenged";
  const auditedAt = new Date().toISOString();
  for (const section of analystSections) {
    await supabase.from("briefing_section").update({
      auditor_status: auditorStatus,
      auditor_notes: auditorResult.summary,
      auditor_reviewed_at: auditedAt,
      is_approved: auditorResult.approved,
      auditor_challenges: auditorResult.challenges?.length ? auditorResult.challenges : null,
    }).eq("blackboard_id", blackboardId).eq("section_id", section.id);
  }

  // 8. Finalize
  const { error: finalizeError } = await supabase.from("briefing_blackboard").update({
    overall_status: "final",
    sections: analystSections,
    conflicts: auditorResult.challenges ?? [],
    approval_summary: auditorResult,
    is_final: true,
    auditor_completed_review_at: new Date().toISOString(),
  }).eq("id", blackboardId);

  if (finalizeError) console.error("Blackboard finalize failed:", finalizeError.message);
  console.log(`Briefing complete for report run ${reportRunId}, blackboard ${blackboardId}`);
}
