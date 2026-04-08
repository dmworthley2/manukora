/**
 * Supabase Edge Function: briefing-worker
 * Queries inventory tables directly, runs analyst -> auditor pipeline.
 * Triggered via POST from /api/briefings/generate.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { jsonrepair } from "npm:jsonrepair";

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const ANALYST_SYSTEM_PROMPT = `You are a Senior CFO-level financial analyst and supply chain strategist. Your job is to synthesize inventory positions AND sales velocity trends into a concise executive briefing that drives capital allocation decisions.

You will receive two datasets:
- **Inventory Metrics** — current stock, days of cover, pricing per SKU
- **Sales History** — units sold by SKU, channel, and month — use this to identify demand trends, seasonal patterns, and which SKUs are accelerating or declining

Generate a 5-section briefing that cross-references both datasets:

1. **Executive Summary** — What needs immediate attention? Lead with the 2-3 highest-risk SKUs by combining low cover AND sales velocity.
2. **Capital Allocation Strategy** — For the top priority SKUs: current cover, recent sales trend (accelerating/declining/flat), revenue at stake, and recommended action.
3. **Risk & Opportunity Flagging** — SKUs where sales trend conflicts with current stock position (e.g. rising demand but low cover = urgent risk; falling demand with high cover = overstocked). Flag Propolis phaseout, MGO 1700+ 90-day target, Bioactive Blends M2-M4 trend only.
4. **Reorder Recommendations** — Ranked by urgency. For each: SKU, days of cover, trend direction, recommended reorder quantity, and why now.
5. **Next Steps** — Top 3 actions for the next 72 hours. Specific, assigned, time-bound.

Rules:
- TOTAL briefing must be under 500 words across all 5 sections combined. Be ruthlessly concise.
- Do NOT invent SKUs or numbers. Use only data provided.
- Every claim about trend must cite the sales history months (e.g. "M2→M4: +40%").
- Think like a CFO: prioritize by capital impact, flag the conflicts, skip the filler.`;

const AUDITOR_SYSTEM_PROMPT = `You are a Lead in Accounting reviewing an executive briefing before it goes to the CFO. You have two jobs: verify the numbers are accurate, and validate that the overall message is clear, honest, and appropriate for a senior audience.

Check:
1. **Numerical accuracy** — Verify revenue (price × units), days of cover, and cited sales trends against the inventory and sales data. Flag if >5% off.
2. **Data integrity** — Every SKU, figure, and trend claim must be traceable to the provided data. Flag anything that cannot be verified.
3. **Messaging quality** — Is the briefing clear and direct? Flag vague language, buried urgency, or recommendations that don't follow from the data.
4. **Unstated assumptions** — Surface any assumptions the analyst made but didn't disclose (lead times, demand stability, reorder quantities).
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
// Tool schemas for structured output (guarantees valid JSON from the API)
// ---------------------------------------------------------------------------

const ANALYST_TOOL = {
  name: "generate_briefing",
  description: "Generate a structured 5-section executive briefing from inventory data.",
  input_schema: {
    type: "object" as const,
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            content: { type: "string" },
          },
          required: ["id", "title", "content"],
        },
      },
      generatedAt: { type: "string" },
    },
    required: ["sections", "generatedAt"],
  },
};

const AUDITOR_TOOL = {
  name: "audit_briefing",
  description: "Audit a briefing against inventory data and return structured findings.",
  input_schema: {
    type: "object" as const,
    properties: {
      approved: { type: "boolean" },
      hasIssues: { type: "boolean" },
      challenges: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string" },
            section: { type: "string" },
            claim: { type: "string" },
            question: { type: "string" },
            severity: { type: "string" },
            requestedAction: { type: "string" },
          },
          required: ["id", "type", "section", "claim", "question", "severity", "requestedAction"],
        },
      },
      summary: { type: "string" },
    },
    required: ["approved", "hasIssues", "challenges", "summary"],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractJson(text: string): unknown {
  // Strip markdown code fences if present
  const stripped = text.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "");
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in response");
  try {
    return JSON.parse(match[0]);
  } catch {
    // Model often produces trailing commas, unescaped chars, truncated output — repair before failing
    const repaired = jsonrepair(match[0]);
    return JSON.parse(repaired);
  }
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

  // 4. Analyst pass — use tool_use to guarantee valid structured JSON output
  let analystMessage;
  try {
    analystMessage = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      system: ANALYST_SYSTEM_PROMPT,
      tools: [ANALYST_TOOL],
      tool_choice: { type: "tool", name: "generate_briefing" },
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

  // Extract from tool_use block (always valid JSON), fall back to text extraction
  let analystSections: AnalystSection[] = [];
  const toolUseBlock = analystMessage.content.find((b) => b.type === "tool_use");
  if (toolUseBlock && toolUseBlock.type === "tool_use") {
    const input = toolUseBlock.input as { sections?: AnalystSection[] };
    analystSections = input.sections ?? [];
  } else {
    // Fallback: try text parsing
    const analystText = analystMessage.content.find((b) => b.type === "text")?.type === "text"
      ? (analystMessage.content.find((b) => b.type === "text") as { type: "text"; text: string }).text
      : "";
    try {
      const parsed = extractJson(analystText) as { sections?: AnalystSection[] };
      analystSections = parsed.sections ?? [];
    } catch (err) {
      console.error("Failed to parse analyst response:", err);
    }
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

  // 6. Auditor pass — use tool_use for guaranteed valid JSON
  const sectionsText = analystSections.map((s) => `## ${s.title}\n${s.content}`).join("\n\n");
  const auditorMessage = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: AUDITOR_SYSTEM_PROMPT,
    tools: [AUDITOR_TOOL],
    tool_choice: { type: "tool", name: "audit_briefing" },
    messages: [{
      role: "user",
      content: `Inventory Context:\n${inventoryContext}\n\nBriefing to audit:\n${sectionsText}\n\nAudit this briefing.`,
    }],
  });

  let auditorResult: AuditorResult = { approved: true, hasIssues: false, challenges: [], summary: "Approved" };
  const auditorToolBlock = auditorMessage.content.find((b) => b.type === "tool_use");
  if (auditorToolBlock && auditorToolBlock.type === "tool_use") {
    auditorResult = auditorToolBlock.input as AuditorResult;
  } else {
    // Fallback: try text parsing
    const auditorText = auditorMessage.content.find((b) => b.type === "text")?.type === "text"
      ? (auditorMessage.content.find((b) => b.type === "text") as { type: "text"; text: string }).text
      : "";
    try {
      auditorResult = extractJson(auditorText) as AuditorResult;
    } catch (err) {
      console.error("Failed to parse auditor response:", err);
    }
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
