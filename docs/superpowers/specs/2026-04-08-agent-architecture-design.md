# Agent Architecture Design

**Date:** 2026-04-08
**Status:** Approved

## Problem

The analyst and auditor in `briefing-worker` are LLM calls in a sequential pipeline — not goal-oriented agents. They make one pass each, cannot query data themselves, cannot iterate on their output, and have no institutional memory. This caps the quality of the briefing regardless of how good the prompts are.

## Solution

Replace the single `briefing-worker` edge function with three edge functions: a lightweight orchestrator and two true tool-use loop agents. Agents communicate through the database (blackboard pattern). Each agent decides which tools to call and when it is done — the orchestrator only enforces the 2-pass ceiling and sequences the invocations.

---

## Architecture

### Edge Functions

**`briefing-orchestrator`** — Coordinator. Lightweight. No LLM calls.
1. Receives POST from `/api/briefings/generate`
2. Creates `briefing_blackboard` row
3. Invokes `analyst-agent` (mode: `draft`) — waits for completion
4. Invokes `auditor-agent` — waits for completion
5. Invokes `analyst-agent` (mode: `respond`) — waits for completion
6. Finalizes blackboard (`is_final: true`)
7. Wrapped in try/finally — always sets `is_final: true` even on failure

**`analyst-agent`** — Tool-use loop agent. Max 2 iterations.

Modes:
- `draft` — queries data, reasons, submits 5 sections
- `respond` — reads its own sections + auditor challenges, decides per section to incorporate or reject, writes response and final content

Tools available:
| Tool | Description |
|------|-------------|
| `query_inventory()` | Returns all rows from `agent_reasoning_feed` |
| `query_sales()` | Returns rows from `sales_history` |
| `read_my_sections()` | Returns analyst's own submitted sections for this run |
| `read_past_challenges()` | Returns auditor challenges from previous briefing runs (institutional memory) |
| `submit_section(section_id, title, content)` | Upserts a row in `briefing_section` |
| `submit_response(section_id, resolution_type, reasoning, final_content)` | Writes analyst response to auditor challenge |

**`auditor-agent`** — Tool-use loop agent. Max 2 iterations.

Tools available:
| Tool | Description |
|------|-------------|
| `query_inventory()` | Returns all rows from `agent_reasoning_feed` |
| `query_sales()` | Returns rows from `sales_history` |
| `read_analyst_sections()` | Returns analyst's submitted sections for this run |
| `submit_challenge(section_id, challenges[])` | Writes per-section challenges to `briefing_section` |
| `approve_section(section_id)` | Sets `auditor_status: "approved"`, `is_approved: true` |

### Tool-Use Loop Pattern

Both agents share this loop structure:

```
iterations = 0
messages = [{ role: "user", content: task_prompt }]

while iterations < 2:
  response = anthropic.messages.create(model, system_prompt, tools, messages)

  if response.stop_reason == "end_turn":
    break  // agent is satisfied

  tool_results = executeTools(response.content)  // DB reads/writes
  messages += [assistant turn, tool results]
  iterations++
```

The agent signals completion by returning without calling tools (`end_turn`). The 2-pass cap is the ceiling — an agent can finish in 1 pass if satisfied.

### Agent Behaviour

**Analyst — draft mode (up to 2 passes):**
- Pass 1: Calls `query_inventory` + `query_sales` + `read_past_challenges`. Reasons over data. Calls `submit_section` for each of the 5 sections.
- Pass 2 (optional): Calls `read_my_sections`. Reviews what it wrote. Revises any section by calling `submit_section` again (upsert). Stops when satisfied.

**Auditor — review mode (up to 2 passes):**
- Pass 1: Calls `read_analyst_sections` + `query_inventory` + `query_sales`. Cross-references claims against data. Calls `submit_challenge` or `approve_section` per section.
- Pass 2 (optional): Calls `read_analyst_sections` again to verify nothing was missed. Revises if needed. Stops when satisfied.

**Analyst — respond mode (up to 2 passes):**
- Pass 1: Calls `read_my_sections` + reads challenges embedded in sections. For each challenged section: decides incorporate or reject. Calls `submit_response`.
- Pass 2 (optional): Reviews responses, refines if needed. Stops.

### Data Flow

Agents communicate exclusively through the database — they never call each other directly.

```
briefing_blackboard   ← orchestrator manages status and is_final
briefing_section      ← analyst writes drafts; auditor writes challenges; analyst writes responses
briefing_audit_trail  ← read by analyst via read_past_challenges() for institutional memory
```

---

## Error Handling

| Failure | Response |
|---------|----------|
| Analyst submits 0 sections | Orchestrator marks blackboard `failed`, skips auditor, finalizes |
| Auditor produces no output | Auto-approve all sections, finalize — degraded but functional |
| Agent hits 2-pass cap | Loop exits, uses whatever agent wrote to DB at that point |
| Anthropic API error mid-loop | Agent returns partial DB state; orchestrator continues with what exists |
| Edge function timeout (150s limit) | Orchestrator catches, proceeds with partial data |
| Any unhandled error | `try/finally` in orchestrator always sets `is_final: true` |

---

## What Doesn't Change

- **DB schema** — `briefing_blackboard` and `briefing_section` are unchanged. No migration needed.
- **Frontend** — `/api/briefings/generate` route calls `briefing-orchestrator` instead of `briefing-worker`. Everything else is identical.
- **Section IDs** — `executive-summary`, `capital-allocation`, `risk-opportunity`, `reorder-recommendations`, `next-steps` — enforced via tool schema enum.

---

## What Changes

| Component | Change |
|-----------|--------|
| `supabase/functions/briefing-worker/` | Replaced by three new functions |
| `supabase/functions/briefing-orchestrator/` | New — coordinator |
| `supabase/functions/analyst-agent/` | New — tool-loop agent |
| `supabase/functions/auditor-agent/` | New — tool-loop agent |
| `web/src/app/api/briefings/generate/route.ts` | Update function name from `briefing-worker` to `briefing-orchestrator` |

---

## Success Criteria

- Analyst queries its own data — it is not fed a pre-built context string by the orchestrator
- Analyst self-reviews its draft on pass 2 before finalising
- Auditor verifies claims against raw data, not just what the analyst said
- Analyst response reflects genuine reasoning about each specific challenge
- `read_past_challenges()` returns challenges from prior runs, giving the analyst institutional memory
- `is_final` is always set, even on failure — frontend never polls indefinitely
