/**
 * Supabase Edge Function: auditor-agent
 * Tool-use loop agent. Reviews analyst sections, writes per-section challenges or approvals.
 * Called by briefing-orchestrator with { blackboardId, reportRunId }.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const AUDITOR_SYSTEM_PROMPT = `You are a Lead in Accounting reviewing an executive briefing before it goes to the CFO. You have two jobs: verify the numbers are accurate, and validate that the overall message is clear, honest, and appropriate for a senior audience.

For each section, raise specific challenges where you find issues. A challenge is a concrete, written point — not a vague concern. The analyst will read your challenge alongside their original analysis and decide whether to incorporate your point or defend their original position. Your challenges must be precise enough that the analyst can make that decision.

Check each section for:
1. **Numerical accuracy** — Verify revenue (price × units), days of cover, cited sales trends. Flag if >5% off.
2. **Data integrity** — Every SKU, figure, and trend claim must be traceable to the provided data.
3. **Messaging quality** — Flag vague language, buried urgency, or recommendations that don't follow from the data.
4. **Unstated assumptions** — Surface lead times, demand stability, or reorder quantities the analyst assumed but didn't disclose.
5. **Policy compliance** — Propolis: deprioritize unless cover <30 days. MGO 1700+: use 3-month (90 day) target. Bioactive Blends: trend is M2–M4 only (launched mid-Jan 2026).

You have tools to read the analyst sections and query the raw inventory and sales data for fact-checking. Start by calling read_analyst_sections. Then call query_inventory and query_sales to verify claims. Submit your review using submit_challenge or approve_section for each section.

If a section has no issues, call approve_section. If it has issues, call submit_challenge with specific challenges.

When you have reviewed all sections, stop calling tools. The loop ends when you return without a tool call.`;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

type AuditorChallenge = {
  id: string;
  type: "numerical" | "data-integrity" | "messaging" | "assumption" | "policy";
  claim: string;
  question: string;
  severity: "error" | "concern" | "assumption";
  requestedAction: string;
};

const AUDITOR_TOOLS: Anthropic.Tool[] = [
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
    name: "read_analyst_sections",
    description: "Returns the analyst's submitted sections for this briefing run.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "submit_challenge",
    description: "Raises specific challenges against a section. Call this when you find issues.",
    input_schema: {
      type: "object" as const,
      properties: {
        section_id: {
          type: "string",
          enum: ["executive-summary", "capital-allocation", "risk-opportunity", "reorder-recommendations", "next-steps"],
        },
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
      required: ["section_id", "notes", "challenges"],
    },
  },
  {
    name: "approve_section",
    description: "Marks a section as approved — no challenges needed.",
    input_schema: {
      type: "object" as const,
      properties: {
        section_id: {
          type: "string",
          enum: ["executive-summary", "capital-allocation", "risk-opportunity", "reorder-recommendations", "next-steps"],
        },
      },
      required: ["section_id"],
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

  if (toolName === "read_analyst_sections") {
    const { data, error } = await supabase
      .from("briefing_section")
      .select("section_id, title, analyst_draft, auditor_status")
      .eq("blackboard_id", blackboardId);
    if (error) return `Error reading analyst sections: ${error.message}`;
    return JSON.stringify(data ?? []);
  }

  if (toolName === "submit_challenge") {
    const section_id = typeof toolInput.section_id === "string" ? toolInput.section_id : null;
    const notes = typeof toolInput.notes === "string" ? toolInput.notes : "";
    const challenges = Array.isArray(toolInput.challenges) ? toolInput.challenges as AuditorChallenge[] : [];
    if (!section_id) return `submit_challenge: missing section_id`;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("briefing_section")
      .update({
        auditor_status: "challenged",
        is_approved: false,
        auditor_notes: notes,
        auditor_reviewed_at: now,
        auditor_challenges: challenges,
      })
      .eq("blackboard_id", blackboardId)
      .eq("section_id", section_id);
    if (error) return `Error submitting challenge for ${section_id}: ${error.message}`;
    return `Challenges submitted for section ${section_id}.`;
  }

  if (toolName === "approve_section") {
    const section_id = typeof toolInput.section_id === "string" ? toolInput.section_id : null;
    if (!section_id) return `approve_section: missing section_id`;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("briefing_section")
      .update({
        auditor_status: "approved",
        is_approved: true,
        auditor_reviewed_at: now,
      })
      .eq("blackboard_id", blackboardId)
      .eq("section_id", section_id);
    if (error) return `Error approving section ${section_id}: ${error.message}`;
    return `Section ${section_id} approved.`;
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
  taskPrompt: string,
): Promise<void> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: taskPrompt }];
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: AUDITOR_SYSTEM_PROMPT,
      tools: AUDITOR_TOOLS,
      messages,
    });

    console.log(`Auditor loop iteration ${iterations + 1}, stop_reason: ${response.stop_reason}`);

    if (response.stop_reason === "end_turn") {
      break;
    }

    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      console.log(`Auditor calling tool: ${toolUse.name}`);
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
    console.warn(`Auditor agent capped at max iterations (${MAX_ITERATIONS}).`);
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

  let body: { blackboardId: string; reportRunId: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { blackboardId, reportRunId } = body;

  if (!blackboardId || !reportRunId) {
    return new Response(JSON.stringify({ error: "Missing required fields: blackboardId, reportRunId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  const taskPrompt = `You are auditing the briefing for report run ${reportRunId} (blackboard: ${blackboardId}). Start by calling read_analyst_sections. Then call query_inventory and query_sales to verify the claims. For each section: call submit_challenge with specific challenges if you find issues, or approve_section if the section is sound. When done with all sections, stop.`;

  try {
    await runAgentLoop(anthropic, supabase, blackboardId, taskPrompt);
    return new Response(JSON.stringify({ status: "done", blackboardId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Auditor agent error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
