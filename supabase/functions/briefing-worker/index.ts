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

const ANALYST_SYSTEM_PROMPT = `You are a Senior CFO-level financial analyst and supply chain strategist. Your job is to reason from inventory and sales data — not describe it. Every SKU you mention must include inference, business impact in dollars, and a clear recommendation.

You will receive two datasets:
- **Inventory Metrics** — current stock, days of cover, pricing per SKU
- **Sales History** — units sold by SKU, channel, and month

THE STANDARD YOU MUST MEET:

Bad output: "MGO 263+ 500g has 1,700 units on hand and sold 684 units last month."

Good output: "MGO 263+ 500g has ~2.5 months of cover at current combined sell-through, no stock on order, and demand has grown 23% over 4 months. At $54.99 retail and ~684 units/month combined, this is ~$37K/month in revenue at risk. Cover will drop below target before a new order could arrive — recommend ordering immediately. Priority 1."

The distinction: inference, business impact, and a clear recommendation. Never describe data. Reason from it.

Generate a 5-section briefing using EXACTLY this structure:

---

SECTION 1 — Executive Summary (section id: executive-summary)
Required format:

SITUATION: [One sentence — the overall inventory risk state right now.]

[SKU Name] — [X days/months cover], demand [trend direction, cite months e.g. M2→M4: +23%]. At $[price] and ~[units]/month, ~$[revenue] at risk over [timeframe]. [What happens if no action taken]. [Recommendation]. Priority [1/2/3].

[Repeat for 2-3 highest-risk SKUs only. Rank by: (1) low cover + growing demand, (2) revenue at stake.]

DECISION: [Specific action required — what, by whom, by when.]

---

SECTION 2 — Capital Allocation Strategy (section id: capital-allocation)
For the top 3-4 priority SKUs: current cover, trend (cite months), revenue at stake in dollars, recommended reorder quantity, and the trade-off if capital is not deployed now. One SKU per paragraph.

---

SECTION 3 — Risk & Opportunity Flagging (section id: risk-opportunity)
Flag SKUs where the sales trend conflicts with the stock position. For each: state the conflict, the consequence, and the recommended response.
Special rules: Propolis — deprioritize unless cover <30 days. MGO 1700+ — use 90-day cover target. Bioactive Blends — trend data is M2–M4 only (launched mid-Jan 2026).

---

SECTION 4 — Reorder Recommendations (section id: reorder-recommendations)
Ranked table by urgency. For each SKU: days of cover, trend direction, recommended order quantity, estimated lead time assumption, and one-sentence justification.

---

SECTION 5 — Next Steps (section id: next-steps)
Top 3 actions for the next 72 hours. Format: [Action]. Owner: [role]. Deadline: [specific time].

---

Rules:
- Total briefing must be under 800 words across all 5 sections.
- Do NOT invent SKUs or numbers. Use only data provided.
- Every trend claim must cite the months (e.g. M2→M4: +23%).
- Section IDs must be exactly: executive-summary, capital-allocation, risk-opportunity, reorder-recommendations, next-steps.`;

const AUDITOR_SYSTEM_PROMPT = `You are a Lead in Accounting reviewing an executive briefing before it goes to the CFO. You have two jobs: verify the numbers are accurate, and validate that the overall message is clear, honest, and appropriate for a senior audience.

For each section, raise specific challenges where you find issues. A challenge is a concrete, written point — not a vague concern. The analyst will read your challenge alongside their original analysis and decide whether to incorporate your point or defend their original position. Your challenges must be precise enough that the analyst can make that decision.

Check each section for:
1. **Numerical accuracy** — Verify revenue (price × units), days of cover, cited sales trends. Flag if >5% off.
2. **Data integrity** — Every SKU, figure, and trend claim must be traceable to the provided data.
3. **Messaging quality** — Flag vague language, buried urgency, or recommendations that don't follow from the data.
4. **Unstated assumptions** — Surface lead times, demand stability, or reorder quantities the analyst assumed but didn't disclose.
5. **Policy compliance** — Propolis: deprioritize unless cover <30 days. MGO 1700+: use 3-month (90 day) target. Bioactive Blends: trend is M2–M4 only (launched mid-Jan 2026).

If a section has no issues, leave its challenges array empty and set approved: true.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnalystSection = {
  id: string;
  title: string;
  content: string;
};

type AuditorChallenge = {
  id: string;
  type: string;
  claim: string;
  question: string;
  severity: string;
  requestedAction: string;
};

type AuditorSectionReview = {
  section_id: string;
  approved: boolean;
  challenges: AuditorChallenge[];
  notes: string;
};

type AuditorResult = {
  section_reviews: AuditorSectionReview[];
  overall_approved: boolean;
  summary: string;
};

type AnalystSectionResponse = {
  section_id: string;
  resolution_type: "incorporated" | "rejected";
  reasoning: string;
  final_content: string;
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
            id: { type: "string", enum: ["executive-summary", "capital-allocation", "risk-opportunity", "reorder-recommendations", "next-steps"] },
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
  description: "Audit each section of a briefing and return per-section challenges.",
  input_schema: {
    type: "object" as const,
    properties: {
      section_reviews: {
        type: "array",
        items: {
          type: "object",
          properties: {
            section_id: { type: "string" },
            approved: { type: "boolean" },
            notes: { type: "string", description: "Overall notes for this section" },
            challenges: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  type: { type: "string", enum: ["numerical", "data-integrity", "messaging", "assumption", "policy"] },
                  claim: { type: "string", description: "The exact claim from the briefing being challenged" },
                  question: { type: "string", description: "The specific question or concern raised" },
                  severity: { type: "string", enum: ["error", "concern", "assumption"] },
                  requestedAction: { type: "string", description: "What the analyst should specifically do" },
                },
                required: ["id", "type", "claim", "question", "severity", "requestedAction"],
              },
            },
          },
          required: ["section_id", "approved", "challenges", "notes"],
        },
      },
      overall_approved: { type: "boolean" },
      summary: { type: "string" },
    },
    required: ["section_reviews", "overall_approved", "summary"],
  },
};

const ANALYST_RESPONSE_TOOL = {
  name: "respond_to_challenges",
  description: "For each section with challenges, decide whether to incorporate the auditor's point or defend the original analysis. This reasoning is the audit trail.",
  input_schema: {
    type: "object" as const,
    properties: {
      section_responses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            section_id: { type: "string" },
            resolution_type: {
              type: "string",
              enum: ["incorporated", "rejected"],
              description: "incorporated = you agree and have revised; rejected = you defend original with reasoning",
            },
            reasoning: {
              type: "string",
              description: "Why you incorporated or rejected the challenge. This is the permanent audit record — be specific.",
            },
            final_content: {
              type: "string",
              description: "The final section content — revised if incorporated, original if rejected.",
            },
          },
          required: ["section_id", "resolution_type", "reasoning", "final_content"],
        },
      },
    },
    required: ["section_responses"],
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

  // 6. Auditor pass — per-section challenges
  const sectionsText = analystSections.map((s) => `## ${s.title} [section_id: ${s.id}]\n${s.content}`).join("\n\n");
  const auditorMessage = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: AUDITOR_SYSTEM_PROMPT,
    tools: [AUDITOR_TOOL],
    tool_choice: { type: "tool", name: "audit_briefing" },
    messages: [{
      role: "user",
      content: `Inventory Context:\n${inventoryContext}\n\nSales History:\n${salesContext}\n\nBriefing to audit:\n${sectionsText}\n\nAudit each section. For each section provide specific challenges where you find issues — or an empty challenges array if the section is sound.`,
    }],
  });

  let auditorResult: AuditorResult = {
    section_reviews: [],
    overall_approved: true,
    summary: "Approved",
  };
  const auditorToolBlock = auditorMessage.content.find((b) => b.type === "tool_use");
  if (auditorToolBlock && auditorToolBlock.type === "tool_use") {
    auditorResult = auditorToolBlock.input as AuditorResult;
  } else {
    console.error("Auditor tool_use block not found — using default approval");
  }

  // 7. Save per-section auditor challenges
  const auditedAt = new Date().toISOString();
  const sectionReviewMap = new Map(
    (auditorResult.section_reviews ?? []).map((r) => [r.section_id, r]),
  );
  for (const section of analystSections) {
    const review = sectionReviewMap.get(section.id);
    await supabase.from("briefing_section").update({
      auditor_status: review?.approved === false ? "challenged" : "approved",
      is_approved: review?.approved === true,
      auditor_notes: review?.notes ?? null,
      auditor_reviewed_at: auditedAt,
      auditor_challenges: review?.challenges?.length ? review.challenges : null,
    }).eq("blackboard_id", blackboardId).eq("section_id", section.id);
  }

  // 8. Analyst response — only for challenged sections
  const challengedSections = analystSections.filter((s) => {
    const review = sectionReviewMap.get(s.id);
    return review && !review.approved && review.challenges?.length > 0;
  });

  const analystResponses: AnalystSectionResponse[] = [];

  if (challengedSections.length > 0) {
    const challengeContext = challengedSections.map((s) => {
      const review = sectionReviewMap.get(s.id)!;
      return [
        `## ${s.title} [section_id: ${s.id}]`,
        `**Original analysis:**`,
        s.content,
        `**Auditor challenges:**`,
        review.challenges.map((c, i) =>
          `${i + 1}. [${c.severity.toUpperCase()}] ${c.claim}\n   Question: ${c.question}\n   Requested action: ${c.requestedAction}`
        ).join("\n"),
      ].join("\n");
    }).join("\n\n---\n\n");

    const analystResponseMessage = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: `You are the analyst who wrote this briefing. The accounting lead has raised specific challenges. For each challenged section you must:
1. Read your original analysis and the specific challenges carefully.
2. Decide for each section: incorporate the auditor's point (revise your content) or reject it (defend your original position with evidence from the data).
3. Your reasoning is permanent — it will be shown as the audit trail. Be direct and specific. Reference the data.
4. If you incorporate: explain what you changed and why the auditor was right.
5. If you reject: explain specifically why your original analysis is correct and the challenge doesn't hold.`,
      tools: [ANALYST_RESPONSE_TOOL],
      tool_choice: { type: "tool", name: "respond_to_challenges" },
      messages: [{
        role: "user",
        content: `Inventory Context:\n${inventoryContext}\n\nSales History:\n${salesContext}\n\nChallenged sections:\n\n${challengeContext}\n\nRespond to each challenged section.`,
      }],
    });

    const responseToolBlock = analystResponseMessage.content.find((b) => b.type === "tool_use");
    if (responseToolBlock && responseToolBlock.type === "tool_use") {
      const input = responseToolBlock.input as { section_responses: AnalystSectionResponse[] };
      analystResponses.push(...(input.section_responses ?? []));
    } else {
      console.error("Analyst response tool_use block not found");
    }
  }

  // 9. Save analyst responses and mark final section content
  const responseMap = new Map(analystResponses.map((r) => [r.section_id, r]));
  const respondedAt = new Date().toISOString();
  for (const section of analystSections) {
    const response = responseMap.get(section.id);
    if (!response) continue;
    await supabase.from("briefing_section").update({
      analyst_response: response.reasoning,
      analyst_responded_at: respondedAt,
      resolution_type: response.resolution_type,
      analyst_position: response.resolution_type === "rejected" ? response.final_content : null,
      // If incorporated, overwrite analyst_draft with revised content
      ...(response.resolution_type === "incorporated"
        ? { analyst_draft: response.final_content }
        : {}),
      is_approved: true,
    }).eq("blackboard_id", blackboardId).eq("section_id", section.id);
  }

  // 10. Finalize blackboard
  const allChallenges = (auditorResult.section_reviews ?? []).flatMap((r) => r.challenges ?? []);
  const { error: finalizeError } = await supabase.from("briefing_blackboard").update({
    overall_status: "final",
    conflicts: allChallenges,
    approval_summary: {
      total: analystSections.length,
      challenged: challengedSections.length,
      incorporated: analystResponses.filter((r) => r.resolution_type === "incorporated").length,
      rejected: analystResponses.filter((r) => r.resolution_type === "rejected").length,
      approved: analystSections.length - challengedSections.length,
    },
    is_final: true,
    auditor_completed_review_at: auditedAt,
  }).eq("id", blackboardId);

  if (finalizeError) console.error("Blackboard finalize failed:", finalizeError.message);
  console.log(`Briefing complete for report run ${reportRunId}, blackboard ${blackboardId}. Challenges: ${allChallenges.length}, Analyst responses: ${analystResponses.length}`);
}
