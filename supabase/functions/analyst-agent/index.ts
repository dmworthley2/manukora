/**
 * Supabase Edge Function: analyst-agent
 * Tool-use loop agent. Modes: draft (query data, write sections) | respond (read challenges, write responses).
 * Called by briefing-orchestrator with { blackboardId, reportRunId, mode }.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { z } from "npm:zod";

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const ANALYST_DRAFT_SYSTEM_PROMPT = `You are a Senior CFO-level financial analyst and supply chain strategist. Your job is to reason from inventory and sales data — not describe it.

THE STANDARD YOU MUST MEET:

Bad: "MGO 263+ 500g has 1,700 units on hand and sold 684 units last month."
Good: "MGO 263+ 500g has ~2.5 months of cover at current sell-through, no stock on order, demand up 23% (M2→M4). At $54.99 and ~684 units/month, that's ~$37K/month in revenue at risk — cover drops below target before a new order could arrive."

Never describe data. Reason from it. Every number must serve an inference.

Use markdown formatting throughout — bold key figures, use tables where specified, use bullet points for lists.

---

Generate a 5-section briefing. Each section has a DISTINCT analytical purpose — do not repeat SKU-level details across sections. If a SKU appears in Section 2, do not re-explain its cover or trend in Sections 3 or 4; reference it by name only.

---

SECTION 1 — Executive Summary (section id: executive-summary)

Write 3–4 sentences for a CFO who has 30 seconds. No bullet points. No SKU-level data. Synthesise the overall inventory health, the single most consequential risk, and the one decision that needs to be made today. End with a clear **Recommendation:** sentence.

Example tone: "Inventory is in a mixed state — two high-velocity SKUs are within weeks of stockout while several slow-movers carry excess capital. The primary risk is MGO 263+ 500g, where accelerating demand and no stock on order creates a gap that cannot be closed before cover runs out. The remaining portfolio is broadly healthy with one exception in the premium range. **Recommendation:** Prioritise an immediate reorder decision on MGO 263+ before end of week."

---

SECTION 2 — Capital Allocation Strategy (section id: capital-allocation)

Unique purpose: WHERE to deploy reorder capital and WHY, ranked by return on urgency.

For the top 3–4 SKUs that require capital deployment: state the recommended order quantity, the estimated capital required (units × cost or use retail as proxy), the revenue protected by acting now, and the cost of delay (what revenue is lost per week of inaction). One SKU per paragraph. Use **bold** for dollar figures and quantities.

Do NOT restate cover days or trend percentages already implicit in the priority ranking — focus entirely on the capital decision.

---

SECTION 3 — Risk & Opportunity Flagging (section id: risk-opportunity)

Unique purpose: surface SURPRISES — SKUs where the data tells a conflicting story that isn't obvious from cover alone.

Flag only SKUs where the sales trend materially conflicts with the stock position (e.g. declining demand but high stock, or surging demand not yet reflected in cover calculations). For each: name the conflict in one sentence, state the consequence if ignored, and give a specific response. Do not list SKUs that are simply low on stock — those belong in Section 2.

Special rules: Propolis — flag only if cover <30 days. MGO 1700+ — use 90-day cover target. Bioactive Blends — trend data is M2–M4 only (launched mid-Jan 2026).

---

SECTION 4 — Reorder Recommendations (section id: reorder-recommendations)

Unique purpose: the DECISION TABLE — a single reference a buyer can act on directly.

Render as a markdown table with columns: SKU | Days Cover | Order Qty | Lead Time | Priority. Do not include revenue figures or trend narrative (covered in Sections 2–3). Add one sentence below the table explaining the lead time assumption used.

---

SECTION 5 — Next Steps (section id: next-steps)

Unique purpose: WHO does WHAT by WHEN — not analysis, just action.

List exactly 3 actions. Each must be specific enough that the owner can act without reading the rest of the briefing. Format each as:
**[Action verb + specific task].** Owner: [role]. Deadline: [specific day/time].

---

Rules:
- Use markdown: **bold** key figures, tables in Section 4, bullets where appropriate.
- Do NOT invent SKUs or numbers. Use only data provided.
- Every trend claim must cite the months (e.g. M2→M4: +23%).
- Do not repeat SKU-level detail across sections — each section earns its place with unique analysis.
- Section IDs must be exactly: executive-summary, capital-allocation, risk-opportunity, reorder-recommendations, next-steps.

For each section, populate the reasoning field with your chain-of-thought: which data signals drove your primary conclusions, what alternatives you considered and discarded, and any assumptions underpinning your analysis. 2–4 sentences. This is an operator audit trail — it is not part of the published briefing.

Call query_inventory and query_sales first, then write your sections.

When you are satisfied with your briefing, stop calling tools. The loop ends when you return without a tool call.`;

const ANALYST_RESPOND_SYSTEM_PROMPT = `You are the analyst who wrote this briefing. The accounting lead has raised specific challenges against some of your sections.

For each challenged section:
1. Read your original analysis and the specific challenges carefully.
2. Decide: incorporate the auditor's point (revise your content) or reject it (defend your original position with evidence from the data).
3. Your reasoning is permanent — it will be shown as the audit trail. Be direct and specific. Reference the data.
4. If you incorporate: explain what you changed and why the auditor was right.
5. If you reject: explain specifically why your original analysis is correct and the challenge doesn't hold.

You have tools to read your submitted sections and the challenges against them. Call read_my_sections first to see the current state. Then submit your responses using submit_response for each challenged section.

When you have responded to all challenged sections, stop calling tools. The loop ends when you return without a tool call.`;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const ANALYST_TOOLS: Anthropic.Tool[] = [
  {
    name: "query_inventory",
    description: "Returns all rows from agent_reasoning_feed — current stock, days of cover, pricing per SKU.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "query_sales",
    description: "Returns rows from sales_history — units sold by SKU, channel, and month.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "read_my_sections",
    description: "Returns the analyst's own submitted sections for this briefing run, including any auditor challenges.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "read_past_challenges",
    description: "Returns auditor challenges from previous briefing runs — institutional memory to improve this run.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "submit_section",
    description: "Upserts a section in the briefing. Call this for each of the 5 sections. Can be called again to revise.",
    input_schema: {
      type: "object" as const,
      properties: {
        section_id: {
          type: "string",
          enum: ["executive-summary", "capital-allocation", "risk-opportunity", "reorder-recommendations", "next-steps"],
          description: "Must be one of the 5 exact section IDs.",
        },
        title: { type: "string" },
        content: { type: "string" },
        reasoning: {
          type: "string",
          description: "Your chain-of-thought for this section: which data points drove your conclusions, what you considered and discarded, and any assumptions or uncertainty. 2–4 sentences.",
        },
      },
      required: ["section_id", "title", "content", "reasoning"],
    },
  },
  {
    name: "submit_response",
    description: "Writes the analyst's response to an auditor challenge for a specific section.",
    input_schema: {
      type: "object" as const,
      properties: {
        section_id: {
          type: "string",
          enum: ["executive-summary", "capital-allocation", "risk-opportunity", "reorder-recommendations", "next-steps"],
        },
        resolution_type: {
          type: "string",
          enum: ["incorporated", "rejected"],
          description: "incorporated = you agree and have revised the content; rejected = you defend original with reasoning",
        },
        reasoning: {
          type: "string",
          description: "Why you incorporated or rejected. This is the permanent audit record — be specific.",
        },
        final_content: {
          type: "string",
          description: "The final section content — revised if incorporated, original if rejected.",
        },
      },
      required: ["section_id", "resolution_type", "reasoning", "final_content"],
    },
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToolInput = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

async function executeTool(
  toolName: string,
  toolInput: ToolInput,
  supabase: ReturnType<typeof createClient>,
  blackboardId: string,
): Promise<string> {
  if (toolName === "query_inventory") {
    const { data, error } = await supabase.from("agent_reasoning_feed").select("*");
    if (error) return `Error querying inventory: ${error.message}`;
    return JSON.stringify(data ?? []);
  }

  if (toolName === "query_sales") {
    const { data, error } = await supabase
      .from("sales_history")
      .select("sku, channel, month_period, units_sold")
      .order("sku")
      .order("month_period");
    if (error) return `Error querying sales: ${error.message}`;
    return JSON.stringify(data ?? []);
  }

  if (toolName === "read_my_sections") {
    const { data, error } = await supabase
      .from("briefing_section")
      .select("section_id, title, analyst_draft, auditor_status, auditor_challenges, auditor_notes")
      .eq("blackboard_id", blackboardId);
    if (error) return `Error reading sections: ${error.message}`;
    return JSON.stringify(data ?? []);
  }

  if (toolName === "read_past_challenges") {
    // Get challenges from previous blackboards (not the current one)
    const { data, error } = await supabase
      .from("briefing_section")
      .select("section_id, auditor_challenges, auditor_notes, briefing_blackboard!inner(created_at)")
      .neq("blackboard_id", blackboardId)
      .not("auditor_challenges", "is", null)
      .order("created_at", { ascending: false, referencedTable: "briefing_blackboard" })
      .limit(50);
    if (error) return `Error reading past challenges: ${error.message}`;
    return JSON.stringify(data ?? []);
  }

  if (toolName === "submit_section") {
    const section_id = typeof toolInput.section_id === "string" ? toolInput.section_id : null;
    const title = typeof toolInput.title === "string" ? toolInput.title : null;
    const content = typeof toolInput.content === "string" ? toolInput.content : null;
    const reasoning = typeof toolInput.reasoning === "string" ? toolInput.reasoning : null;
    if (!section_id || !title || !content || !reasoning) return `submit_section: missing required fields`;
    const now = new Date().toISOString();
    const { error } = await supabase.from("briefing_section").upsert({
      blackboard_id: blackboardId,
      section_id,
      title,
      analyst_draft: content,
      analyst_reasoning: reasoning,
      analyst_submitted_at: now,
      auditor_status: "pending",
      is_approved: false,
    }, { onConflict: "blackboard_id,section_id" });
    if (error) return `Error submitting section ${section_id}: ${error.message}`;
    return `Section ${section_id} submitted successfully.`;
  }

  if (toolName === "submit_response") {
    const section_id = typeof toolInput.section_id === "string" ? toolInput.section_id : null;
    const resolution_type = toolInput.resolution_type === "incorporated" || toolInput.resolution_type === "rejected"
      ? toolInput.resolution_type
      : null;
    const reasoning = typeof toolInput.reasoning === "string" ? toolInput.reasoning : null;
    const final_content = typeof toolInput.final_content === "string" ? toolInput.final_content : null;
    if (!section_id || !resolution_type || !reasoning || !final_content) {
      return `submit_response: missing required fields`;
    }
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      analyst_response: reasoning,
      analyst_responded_at: now,
      resolution_type,
      is_approved: true,
    };
    if (resolution_type === "incorporated") {
      updatePayload.analyst_draft = final_content;
    } else {
      updatePayload.analyst_position = final_content;
    }
    const { error } = await supabase
      .from("briefing_section")
      .update(updatePayload)
      .eq("blackboard_id", blackboardId)
      .eq("section_id", section_id);
    if (error) return `Error submitting response for ${section_id}: ${error.message}`;
    return `Response for ${section_id} submitted. Resolution: ${resolution_type}.`;
  }

  return `Unknown tool: ${toolName}`;
}

// ---------------------------------------------------------------------------
// Tool-use loop
// ---------------------------------------------------------------------------

async function runAgentLoop(
  anthropic: Anthropic,
  supabase: ReturnType<typeof createClient>,
  blackboardId: string,
  systemPrompt: string,
  taskPrompt: string,
): Promise<void> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: taskPrompt }];
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: systemPrompt,
      tools: ANALYST_TOOLS,
      messages,
    });

    console.log(`Analyst loop iteration ${iterations + 1}, stop_reason: ${response.stop_reason}`);

    if (response.stop_reason === "end_turn") {
      break;
    }

    // Collect tool calls from this response
    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      break;
    }

    // Execute all tool calls and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      console.log(`Analyst calling tool: ${toolUse.name}`);
      const result = await executeTool(toolUse.name, toolUse.input as ToolInput, supabase, blackboardId);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
    iterations++;
  }

  if (iterations >= MAX_ITERATIONS) {
    console.warn(`Analyst agent capped at max iterations (${MAX_ITERATIONS}).`);
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
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anthropicApiKey) {
    return new Response(JSON.stringify({ error: "Missing environment variables" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const RequestBodySchema = z.object({
    blackboardId: z.string().min(1),
    reportRunId: z.string().min(1),
    mode: z.enum(["draft", "respond"]),
  });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = RequestBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { blackboardId, reportRunId, mode } = parsed.data;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  const systemPrompt = mode === "draft" ? ANALYST_DRAFT_SYSTEM_PROMPT : ANALYST_RESPOND_SYSTEM_PROMPT;
  const taskPrompt = mode === "draft"
    ? `You are writing the briefing for report run ${reportRunId} (blackboard: ${blackboardId}). Start by calling query_inventory and query_sales to get the data. Then write and submit all 5 sections. When all 5 sections are submitted, stop.`
    : `You are responding to auditor challenges for report run ${reportRunId} (blackboard: ${blackboardId}). Call read_my_sections to see your sections and the challenges raised. For each challenged section, call submit_response with your decision to incorporate or reject the challenge. When done, stop.`;

  try {
    await runAgentLoop(anthropic, supabase, blackboardId, systemPrompt, taskPrompt);

    // Mark the briefing as final as soon as the analyst draft is complete.
    // The orchestrator may be killed by the edge function wall-clock timeout before
    // it can set this itself, leaving sections in the DB but is_final=false forever.
    if (mode === "draft") {
      const { error: finalErr } = await supabase
        .from("briefing_blackboard")
        .update({ is_final: true, overall_status: "analyst_complete" })
        .eq("id", blackboardId);
      if (finalErr) {
        console.error(`Failed to set is_final: ${finalErr.message}`);
      }
    }

    return new Response(JSON.stringify({ status: "done", mode, blackboardId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Analyst agent error (mode: ${mode}):`, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
