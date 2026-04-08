/**
 * Supabase Edge Function: analyst-agent
 * Tool-use loop agent. Modes: draft (query data, write sections) | respond (read challenges, write responses).
 * Called by briefing-orchestrator with { blackboardId, reportRunId, mode }.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const ANALYST_DRAFT_SYSTEM_PROMPT = `You are a Senior CFO-level financial analyst and supply chain strategist. Your job is to reason from inventory and sales data — not describe it. Every SKU you mention must include inference, business impact in dollars, and a clear recommendation.

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
- Section IDs must be exactly: executive-summary, capital-allocation, risk-opportunity, reorder-recommendations, next-steps.

You have tools to query inventory and sales data, read your past sections, and read past challenges from prior briefing runs. Use them — do not ask for data to be provided to you. Call query_inventory and query_sales first, then write your sections.

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
      },
      required: ["section_id", "title", "content"],
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
    const { section_id, title, content } = toolInput as { section_id: string; title: string; content: string };
    const now = new Date().toISOString();
    const { error } = await supabase.from("briefing_section").upsert({
      blackboard_id: blackboardId,
      section_id,
      title,
      analyst_draft: content,
      analyst_submitted_at: now,
      auditor_status: "pending",
      is_approved: false,
    }, { onConflict: "blackboard_id,section_id" });
    if (error) return `Error submitting section ${section_id}: ${error.message}`;
    return `Section ${section_id} submitted successfully.`;
  }

  if (toolName === "submit_response") {
    const { section_id, resolution_type, reasoning, final_content } = toolInput as {
      section_id: string;
      resolution_type: "incorporated" | "rejected";
      reasoning: string;
      final_content: string;
    };
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
  const MAX_ITERATIONS = 2;

  while (iterations < MAX_ITERATIONS) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
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

  let body: { blackboardId: string; reportRunId: string; mode: "draft" | "respond" };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { blackboardId, reportRunId, mode } = body;

  if (!blackboardId || !reportRunId || !mode) {
    return new Response(JSON.stringify({ error: "Missing required fields: blackboardId, reportRunId, mode" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  const systemPrompt = mode === "draft" ? ANALYST_DRAFT_SYSTEM_PROMPT : ANALYST_RESPOND_SYSTEM_PROMPT;
  const taskPrompt = mode === "draft"
    ? `You are writing the briefing for report run ${reportRunId} (blackboard: ${blackboardId}). Start by calling query_inventory and query_sales to get the data. Then write and submit all 5 sections. On your second pass, call read_my_sections and read_past_challenges to review your work — revise anything that needs improvement, then stop.`
    : `You are responding to auditor challenges for report run ${reportRunId} (blackboard: ${blackboardId}). Call read_my_sections to see your sections and the challenges raised. For each challenged section, call submit_response with your decision to incorporate or reject the challenge. When done, stop.`;

  try {
    await runAgentLoop(anthropic, supabase, blackboardId, systemPrompt, taskPrompt);
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
