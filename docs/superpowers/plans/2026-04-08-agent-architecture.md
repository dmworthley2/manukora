# Agent Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `briefing-worker` edge function with three edge functions — `analyst-agent`, `auditor-agent`, and `briefing-orchestrator` — where the analyst and auditor are true tool-use loop agents that decide what data to query and when they are done.

**Architecture:** Blackboard pattern — agents communicate exclusively through the database. The orchestrator sequences invocations and enforces the 2-pass ceiling per agent. Each agent runs a tool-use loop: it calls tools to read/write the DB, and signals completion by returning without tool calls (`stop_reason === "end_turn"`).

**Tech Stack:** Deno (Supabase Edge Functions), Anthropic SDK (`npm:@anthropic-ai/sdk`), Supabase client (`npm:@supabase/supabase-js@2`), TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/functions/analyst-agent/index.ts` | Create | Tool-use loop agent, draft + respond modes |
| `supabase/functions/auditor-agent/index.ts` | Create | Tool-use loop agent, review mode |
| `supabase/functions/briefing-orchestrator/index.ts` | Create | Coordinator — no LLM calls, sequences agents |
| `web/src/app/api/briefings/generate/route.ts` | Modify | Change invocation target to `briefing-orchestrator` |
| `supabase/functions/briefing-worker/index.ts` | Delete | Replaced by the three new functions |

---

## Task 1: analyst-agent edge function

**Files:**
- Create: `supabase/functions/analyst-agent/index.ts`

The analyst agent receives a `blackboardId`, `reportRunId`, and `mode` (`draft` | `respond`). It runs a tool-use loop (max 2 iterations). In `draft` mode it queries inventory and sales, reasons, and submits 5 sections. In `respond` mode it reads its own sections plus auditor challenges and submits responses.

- [ ] **Step 1: Create the file with types and tool definitions**

Create `supabase/functions/analyst-agent/index.ts`:

```typescript
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
```

- [ ] **Step 2: Verify the file was created**

```bash
ls supabase/functions/analyst-agent/
```
Expected: `index.ts`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/analyst-agent/index.ts
git commit -m "feat: add analyst-agent edge function with tool-use loop"
```

---

## Task 2: auditor-agent edge function

**Files:**
- Create: `supabase/functions/auditor-agent/index.ts`

The auditor agent receives `blackboardId` and `reportRunId`. It runs a tool-use loop (max 2 iterations). It queries data, reads analyst sections, and submits challenges or approvals per section.

- [ ] **Step 1: Create the file**

Create `supabase/functions/auditor-agent/index.ts`:

```typescript
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

You have tools to read the analyst sections and query the raw inventory and sales data for fact-checking. Start by calling read_analyst_sections to see the briefing. Then call query_inventory and query_sales to verify claims. Submit your review using submit_challenge or approve_section for each section.

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
    const { section_id, notes, challenges } = toolInput as {
      section_id: string;
      notes: string;
      challenges: AuditorChallenge[];
    };
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
    const { section_id } = toolInput as { section_id: string };
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
  const MAX_ITERATIONS = 2;

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
```

- [ ] **Step 2: Verify the file was created**

```bash
ls supabase/functions/auditor-agent/
```
Expected: `index.ts`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/auditor-agent/index.ts
git commit -m "feat: add auditor-agent edge function with tool-use loop"
```

---

## Task 3: briefing-orchestrator edge function

**Files:**
- Create: `supabase/functions/briefing-orchestrator/index.ts`

The orchestrator has no LLM calls. It creates the blackboard, invokes the three agent steps sequentially, handles failures, and guarantees `is_final: true` in a try/finally block.

- [ ] **Step 1: Create the file**

Create `supabase/functions/briefing-orchestrator/index.ts`:

```typescript
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
  const workPromise = runPipeline(reportRunId, supabase);
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

  // Invoke a child edge function and wait for completion
  const invoke = async (fnName: string, payload: Record<string, unknown>): Promise<void> => {
    console.log(`Orchestrator: invoking ${fnName}`, payload);
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
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
    await supabase.from("briefing_blackboard").update({ overall_status: "analyst_drafting" }).eq("id", blackboardId);
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
```

- [ ] **Step 2: Verify the file was created**

```bash
ls supabase/functions/briefing-orchestrator/
```
Expected: `index.ts`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/briefing-orchestrator/index.ts
git commit -m "feat: add briefing-orchestrator edge function"
```

---

## Task 4: Update generate route and retire briefing-worker

**Files:**
- Modify: `web/src/app/api/briefings/generate/route.ts:28-30`
- Delete: `supabase/functions/briefing-worker/index.ts`

- [ ] **Step 1: Update the generate route**

In `web/src/app/api/briefings/generate/route.ts`, change the function name from `"briefing-worker"` to `"briefing-orchestrator"`.

Find this block (around line 28):
```typescript
console.log(`[Generate] Invoking briefing-worker for report run ${reportRunId}`);
const { error: invokeError } = await client.functions.invoke("briefing-worker", {
```

Replace with:
```typescript
console.log(`[Generate] Invoking briefing-orchestrator for report run ${reportRunId}`);
const { error: invokeError } = await client.functions.invoke("briefing-orchestrator", {
```

- [ ] **Step 2: Delete the old briefing-worker function**

```bash
rm supabase/functions/briefing-worker/index.ts
rmdir supabase/functions/briefing-worker
```

- [ ] **Step 3: Verify generate route change**

```bash
grep -n "briefing-orchestrator\|briefing-worker" web/src/app/api/briefings/generate/route.ts
```
Expected: only `briefing-orchestrator` appears, no `briefing-worker`.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/api/briefings/generate/route.ts
git rm supabase/functions/briefing-worker/index.ts
git commit -m "feat: route briefing generation through briefing-orchestrator, retire briefing-worker"
```

---

## Task 5: Deploy and verify

- [ ] **Step 1: Deploy all three new edge functions**

```bash
supabase functions deploy analyst-agent
supabase functions deploy auditor-agent
supabase functions deploy briefing-orchestrator
```

Each should output: `Deployed Function analyst-agent` (and similarly for the other two).

- [ ] **Step 2: Trigger a test briefing**

Navigate to the app and generate a new briefing. Then watch the Supabase edge function logs:

```bash
supabase functions logs analyst-agent --tail
supabase functions logs auditor-agent --tail
supabase functions logs briefing-orchestrator --tail
```

Expected log sequence:
```
Orchestrator: blackboard created <id>
Orchestrator: invoking analyst-agent { mode: "draft", ... }
Analyst loop iteration 1, stop_reason: tool_use
Analyst calling tool: query_inventory
Analyst calling tool: query_sales
Analyst calling tool: submit_section  (x5)
Analyst loop iteration 2, stop_reason: end_turn   (or tool_use + read_my_sections)
Orchestrator: analyst-agent completed
Orchestrator: invoking auditor-agent
Auditor loop iteration 1, stop_reason: tool_use
Auditor calling tool: read_analyst_sections
Auditor calling tool: query_inventory
...
Orchestrator: auditor-agent completed
Orchestrator: invoking analyst-agent { mode: "respond", ... }  (if sections challenged)
Orchestrator: pipeline complete for <reportRunId>
```

- [ ] **Step 3: Verify DB state**

In Supabase table editor, check `briefing_blackboard`:
- `overall_status = "final"`
- `is_final = true`

Check `briefing_section`:
- 5 rows with `blackboard_id` matching the blackboard
- Each row has `analyst_draft` populated
- `auditor_status` is either `"approved"` or `"challenged"` (not `"pending"`)
- Challenged sections have `analyst_response` populated

- [ ] **Step 4: Verify frontend displays the briefing**

Navigate to the briefing page. The Executive Summary section should render. If it loads — done.

- [ ] **Step 5: Commit deploy confirmation**

No code change needed. Mark this task complete once verified.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| briefing-orchestrator — coordinator, no LLM calls | Task 3 |
| Orchestrator creates blackboard | Task 3, runPipeline step 1 |
| Orchestrator invokes analyst (draft) → auditor → analyst (respond) | Task 3, runPipeline |
| Orchestrator sets is_final in try/finally | Task 3, finally block |
| Analyst — tool-use loop, max 2 iterations | Task 1, runAgentLoop |
| Analyst draft mode: query_inventory, query_sales, read_past_challenges, submit_section | Task 1, ANALYST_TOOLS |
| Analyst respond mode: read_my_sections, submit_response | Task 1, ANALYST_TOOLS |
| Auditor — tool-use loop, max 2 iterations | Task 2, runAgentLoop |
| Auditor tools: query_inventory, query_sales, read_analyst_sections, submit_challenge, approve_section | Task 2, AUDITOR_TOOLS |
| Section IDs enforced via enum | Tasks 1 & 2, tool schemas |
| Agent signals done via end_turn | Tasks 1 & 2, runAgentLoop break condition |
| 0 sections → mark failed, skip auditor | Task 3, sectionCount check |
| Auditor failure → auto-approve all | Task 3, auditor try/catch |
| read_past_challenges returns prior run challenges | Task 1, executeTool |
| Update generate route | Task 4 |
| Retire briefing-worker | Task 4 |

All spec requirements covered.
