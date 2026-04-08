# Manukora — Technical Architecture

> Read this at the start of each session to understand the codebase before making changes.

---

## Overview

Manukora is a **commercial briefing tool** for honey/inventory businesses. It ingests CSV data, runs deterministic analytics, then generates a 5-section executive briefing via a multi-agent AI pipeline (Analyst → Auditor). Output is a structured markdown briefing surfaced in a Next.js dashboard.

---

## Monorepo Structure

```
manukora/
├── backend/          # TypeScript library — analytics, agents, Supabase services
├── web/              # Next.js 15 frontend — dashboard UI and API routes
├── supabase/
│   ├── functions/    # Deno edge functions — briefing pipeline
│   └── migrations/   # PostgreSQL schema
└── docs/             # Architecture and specs
```

**Workspaces:** `backend` is published as `@manukora/backend` and imported by `web`.

---

## Languages & Runtimes

| Layer | Language | Runtime |
|-------|----------|---------|
| Frontend | TypeScript 5 (strict) | Node.js / Browser |
| Backend library | TypeScript 5 (strict, ESM) | Node.js 20+ |
| Edge functions | TypeScript | Deno (Supabase) |
| Database | SQL | PostgreSQL (Supabase) |

---

## Frontend (`web/`)

**Framework:** Next.js 16.2 with App Router  
**Styling:** TailwindCSS 4 + Shadcn/UI (all components must use shadcn primitives)  
**Icons:** lucide-react  
**Markdown rendering:** react-markdown + remark-gfm  
**Validation:** Zod at API boundaries

### Routes

```
/                         → redirect to /dashboard/executive-summary
/dashboard/executive-summary  → briefing sections, KPIs, polling
/dashboard/inventory          → product catalog & SKU analysis
/dashboard/sales              → sales performance
/dashboard/reorders           → reorder recommendations
/data-sources                 → CSV upload interface
```

### API Routes (`web/src/app/api/`)

| Route | Purpose |
|-------|---------|
| `POST /api/uploads` | Upload CSV to Supabase Storage |
| `POST /api/process` | Parse CSV, build FactBundle, trigger briefing |
| `GET /api/reports` | List report runs |
| `GET /api/briefings/[id]` | Poll briefing status |
| `GET /api/briefings/latest` | Timeout fallback — fetch most recent briefing |
| `GET /api/briefings/[id]/metrics` | Approval summary (approved/escalated counts) |

### Patterns

- **DataSourceContext** — React Context gates navigation until a CSV is uploaded
- **Polling** — executive-summary page polls `/api/briefings/[id]` with exponential backoff
- **Hooks** — `useReportRuns()`, `useUploads()`, `useDatasets()`, `useDatasetUpload()`
- **Client/Server split** — `"use client"` for interactive pages; server components for static

---

## Backend Library (`backend/src/`)

### Analytics Layer

| File | Purpose |
|------|---------|
| `analytics/csv-parser.ts` | Parse CSV with flexible field mapping; Zod validation |
| `analytics/metrics.ts` | Deterministic SKU-level metrics — velocity, cover risk, value-at-risk |
| `analytics/fact-bundle.ts` | Orchestrates analytics into immutable JSON (source of truth) |
| `analytics/inventory-metrics.ts` | Reorder recommendations, sell-through, cover risk per SKU |
| `analytics/reorder-ranker.ts` | Ranks reorders by conflict type |

**FactBundle** is the immutable, deterministic numeric output of Phase 1. All agent claims must cite it.

### Agent Layer

| File | Purpose |
|------|---------|
| `agents/graph.ts` | Blackboard pattern executor — routes phases, enforces iteration limits |
| `agents/analyst-node.ts` | FactBundle → 5 narrative sections with citations |
| `agents/auditor-node.ts` | Verifies claims, issues typed challenges |
| `agents/analyst-response-node.ts` | Analyst responds to auditor challenges |
| `agents/auditor-finalizer-node.ts` | Final approval or CEO escalation |
| `agents/prompts.ts` | System prompts (strict citation rules, verification constraints) |
| `agents/orchestration.ts` | Entry point: `runBriefingWorkflow()` with 5-min hard timeout |

### Services Layer

| File | Purpose |
|------|---------|
| `services/uploads.ts` | Upload CSV to Supabase Storage, register metadata |
| `services/reports.ts` | Report run CRUD (create, update status, list) |
| `services/briefing-blackboard.ts` | Blackboard state CRUD (create, submit drafts, challenges, responses) |
| `services/briefing-section.ts` | Denormalized section queries for frontend polling |
| `services/inventory.ts` | Product catalog, inventory state, sales history CRUD |

### Infrastructure

| File | Purpose |
|------|---------|
| `env.ts` | Zod-based env validation at startup |
| `lib/log.ts` | Structured logging (not console.log) |
| `lib/timeout.ts` | Promise timeout wrapper |
| `lib/hash.ts` | SHA256 file integrity |
| `supabase/admin-client.ts` | Supabase service-role client factory |

**Build note:** After any change to `backend/src/`, run `cd backend && npm run build` and commit `dist/`.

---

## Database Schema (Supabase PostgreSQL)

### Core Tables

| Table | Purpose |
|-------|---------|
| `uploads` | CSV file metadata — path, size, SHA256 hash |
| `report_runs` | Agentic run tracking — status, period, output paths, metadata JSONB |
| `product_catalog` | Master SKU data — name, category, MGO, price, target cover |
| `inventory_state` | Current snapshot per SKU — SOH, on-order, arrival months |
| `sales_history` | Historical sales by SKU × channel × month |
| `briefing_blackboard` | Analyst-Auditor collaboration state (JSONB sections, conflicts, is_final) |
| `briefing_section` | Denormalized per-section rows for efficient polling |

### Key View

**`agent_reasoning_feed`** — Pre-calculated read-only view combining product + inventory + sales. Used by agents for reorder decisions. Includes: velocity metrics (m1/m2/m3 totals), months_of_cover, momentum_trend (DECLINING|GROWING|STABLE), reorder_required flag.

### Storage Buckets

| Bucket | Contents |
|--------|---------|
| `uploads` | Raw CSV files (private, immutable per upload ID) |
| `outputs` | `yyyy/mm/{reportRunId}/fact-bundle.json`, `briefing.md` |

---

## Agent Pipeline Architecture

### Pattern: Blackboard (not LangGraph)

State is persisted in Supabase (`briefing_blackboard`) at each step. Agents are stateless edge functions that read and write to the blackboard.

### State Machine

```
initializing
  → analyst-drafting        (Analyst writes 5 sections, cites FactBundle)
  → auditor-reviewing       (Auditor verifies, issues typed challenges)
  → analyst-responding?     (if challenges exist AND iteration < 1)
  → auditor-finalizing      (Final approve or CEO-escalate per section)
  → complete
```

**Iteration limit:** Max 2 full cycles. Unresolved challenges on iteration 1 → escalated-to-ceo.

### Agent Timeouts

| Agent | Per-call | Total workflow |
|-------|----------|---------------|
| Analyst | 2 min | — |
| Auditor | 1 min | — |
| Full pipeline | — | 5 min |

### LLM Configuration

- **Model:** `claude-3-5-haiku-20241022` (env: `LLM_MODEL`)
- **Temperature:** 0.3 (env: `LLM_TEMPERATURE`)
- **Tool-use pattern:** Each agent calls typed tools (`draft_section`, `verify_section`, `respond_to_challenge`, `finalize_section`)

### Challenge Types

`numerical` | `hallucination` | `assumption` | `tradeoff` | `policy`  
Severity: `error` | `assumption` | `concern`

---

## Supabase Edge Functions (`supabase/functions/`)

| Function | Role |
|----------|------|
| `briefing-orchestrator` | Coordinator — creates blackboard, responds 202, runs pipeline async via `waitUntil` |
| `analyst-agent` | LLM agent — drafts sections and responds to challenges |
| `auditor-agent` | LLM agent — reviews sections and finalizes decisions |

Edge functions are deployed via Supabase CLI. They share secrets via the Supabase dashboard (not `.env`).

---

## Data Flow Summary

### Phase 1 — Fast (< 100ms)
```
CSV upload → validate + parse → upload to Storage → create report_run → build FactBundle → return to UI
```

### Phase 2 — Async (up to 5 min)
```
POST /api/briefings/generate
  → orchestrator edge function (202 immediate)
  → analyst drafts 5 sections
  → auditor reviews + challenges
  → [analyst responds → auditor finalizes] (if challenged)
  → briefing.md saved to Storage
  → is_final = true on blackboard
Frontend polls /api/briefings/[id] → display when is_final
```

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `SUPABASE_URL` | PostgreSQL & Storage endpoint | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin credentials (server-side only) | Yes |
| `ANTHROPIC_API_KEY` | Claude API auth | Phase 2 |
| `LLM_MODEL` | Claude model selector | No (default: haiku) |
| `LLM_TEMPERATURE` | Output randomness | No (default: 0.3) |
| `NODE_ENV` | Environment mode | No |

**Security:** Service role key never exposed to browser. All Supabase calls go through API routes.

---

## Key Invariants

1. **FactBundle is immutable** — computed once from CSV, never modified by agents.
2. **Agents cite only FactBundle** — no LLM invention; auditor flags violations.
3. **Max 2 iterations** — prevents runaway loops.
4. **All state in Supabase** — full audit trail; edge functions are stateless.
5. **Build dist/ on every backend change** — `@manukora/backend` is imported from compiled output.
6. **Shadcn/UI for all components** — no custom Tailwind-only components.
7. **No `any` types** — strict TypeScript throughout.
8. **No `console.log`** — use `src/lib/log.ts` structured logger.
