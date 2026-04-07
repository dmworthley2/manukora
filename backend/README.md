# Manukora Backend

TypeScript analytics library for commercial inventory and demand analysis. Ingests structured CSV data, computes deterministic metrics, and generates machine-readable fact bundles for LangGraph-orchestrated briefing generation.

## Architecture

### Layers

1. **CSV Parsing & Validation** (`analytics/csv-parser.ts`)
   - Parses raw CSV files with flexible field mapping
   - Validates data types and ranges per Zod schemas
   - Detects duplicate (SKU, period) keys
   - Fail-closed: returns errors for any invalid row

2. **Deterministic Analytics** (`analytics/metrics.ts`)
   - Computes SKU-level monthly metrics (velocity, cover risk, value-at-risk)
   - Analyzes trends across months (growth, decline, stable)
   - Assesses inventory cover risk (low/medium/high)
   - All numeric computations are deterministic; no LLM invention

3. **Fact Bundle Builder** (`analytics/fact-bundle.ts`)
   - Orchestrates analytics into machine-readable JSON bundle
   - Generates structured reorder recommendations with ranked SKUs
   - Identifies proactive risks (overstocking, demand decline, slow-moving)
   - Single source of numeric truth for LangGraph consumption

4. **LangGraph Agent Orchestration** (`agents/`)
   - **Analyst Node** (`analyst-node.ts`): Transforms FactBundle into narrative briefing with embedded citations (2-min timeout)
   - **Auditor Node** (`auditor-node.ts`): Verifies all claims against FactBundle; detects hallucinations (1-min timeout)
   - **Graph Executor** (`graph.ts`): Routes Analyst → Auditor with max 2 iterations; conditional routing on audit approval
   - **Workflow Runner** (`orchestration.ts`): Orchestrates end-to-end workflow with 5-minute hard timeout
   - **Prompts** (`prompts.ts`): System prompts for Analyst (citation rules) and Auditor (strict verification)

5. **Supabase Integration** (`supabase/` + `services/`)
   - Stores CSV uploads in Supabase Storage (immutable per version)
   - Tracks upload metadata and report runs in PostgreSQL
   - Manages output artifacts (fact bundles, briefing markdown)
   - Provides signed URLs for private storage access
   - Saves approved briefings to outputs bucket with versioned paths

### Data Flow

```
Raw CSV (bytes)
    ↓
[parseCommercialRows] → CommercialDataRow[]
    ↓
[groupBySku, analyzeTrend, assessCoverRisk] → Metrics[]
    ↓
[buildFactBundle] → FactBundle (JSON) [IMMEDIATE RETURN]
    ↓ [Async, background]
[Analyst Node] → BriefingDraft (with citations)
    ↓
[Auditor Node] → Approved? {approved=true | approved=false + corrections}
    ↓
If approved → [Save to Storage] → briefing.md
If rejected + iterations<2 → [Back to Analyst with feedback]
If rejected + iterations=2 → [Store error metadata]
    ↓
[Update report_runs status] → Permanent record
```

**Key Design:** FactBundle is returned immediately to the caller; briefing generation runs asynchronously to avoid blocking HTTP requests.

## Usage

### 1. Process CSV

```typescript
import { processCsv } from "@manukora/backend";

const csvBytes = fs.readFileSync("sales.csv");
const result = processCsv(csvBytes, {
  fieldMapping: {
    sku: "sku",
    period: "period",
    unitsSold: "units_sold",
    revenue: "revenue",
    onHandInventory: "inventory",
    retailPrice: "price",
    cogs: "cost",
  },
});

if (!result.success) {
  console.error("Validation failed:", result.errors);
  return;
}

const factBundle = result.factBundle;
console.log(`Generated recommendations:`, factBundle.reorderRecommendations);
```

### 2. Infer Field Mapping

If CSV headers match common names, auto-detect:

```typescript
import { inferFieldMapping } from "@manukora/backend";

const headers = ["sku", "month", "qty_sold", "sales", "inventory", "list_price"];
const mapping = inferFieldMapping(headers);
// mapping = { sku: "sku", period: "month", unitsSold: "qty_sold", ... }
```

### 3. Upload & Track

```typescript
import { uploadCsv, createReportRun, finalizeRun } from "@manukora/backend";

const client = createSupabaseAdminClient();

// Store CSV
const uploadRow = await uploadCsv(client, csvBytes, {
  originalFilename: "2024-03-sales.csv",
  contentType: "text/csv",
});

// Create report run
const run = await createReportRun(client, {
  period: "2024-03",
  uploadId: uploadRow.id,
  status: "pending",
});

// Process & finalize
const factBundle = await processAndAnalyze(csvBytes);
await finalizeRun(client, run.id, {
  factBundle: Buffer.from(JSON.stringify(factBundle)),
});
```

### 4. Generate Briefing (Phase 2 — Async LangGraph Workflow)

```typescript
import { runBriefingWorkflow, finalizeBriefing, loadEnv, createSupabaseAdminClient } from "@manukora/backend";

const env = loadEnv(); // Requires ANTHROPIC_API_KEY + LLM_MODEL
const client = createSupabaseAdminClient(env);

// Run workflow (synchronous with 5-minute timeout)
const state = await runBriefingWorkflow(
  factBundle,
  reportRunId,
  "2026-04",
  env
);

if (state.approved) {
  // Save briefing markdown to Supabase Storage
  await finalizeBriefing(client, reportRunId, state);
  console.log(`Briefing saved at: outputs/2026/04/${reportRunId}/briefing.md`);
} else {
  console.error(`Briefing generation failed after ${state.iterationCount - 1} iterations:`, state.error);
}
```

**Workflow Details:**
- **Analyst Node** (2-min timeout): Transforms FactBundle → narrative sections with embedded citations
- **Auditor Node** (1-min timeout): Verifies all numerical claims; detects hallucinated SKUs/metrics
- **Max iterations**: 2 (initial + 1 revision based on auditor feedback)
- **Total timeout**: 5 minutes hard limit
- **Fallback**: If agents fail or timeout, error logged to report_runs metadata; FactBundle remains valid

## Fact Bundle Structure

```typescript
{
  metadata: {
    period: "2024-03",
    generatedAt: "2024-04-01T12:00:00Z",
    inputRowCount: 450,
    uniqueSkus: 42,
  },
  skuMetrics: [
    {
      sku: "SKU001",
      period: "2024-03",
      unitsSold: 100,
      revenue: 5000,
      avgSellingPrice: 50,
      onHandInventory: 500,
      estimatedVelocity: 3.33, // units/day
      daysOfCover: 150,
    },
    // ...
  ],
  trends: [
    {
      sku: "SKU001",
      periods: ["2024-01", "2024-02", "2024-03"],
      unitsTrend: [80, 110, 100],
      isDecline: false,
      trend: "stable",
    },
    // ...
  ],
  coverRisks: [
    {
      sku: "SKU001",
      riskLevel: "low",
      daysOfCover: 150,
      reason: "Strong inventory position (150 days of cover)",
    },
    // ...
  ],
  reorderRecommendations: [
    {
      rank: 1,
      sku: "SKU042",
      reason: "high_value_at_risk",
      rationale: "High commercial value at risk ($28,000)...",
      suggestedAction: "Routine reorder...",
      metrics: { valueAtRisk: 28000, daysOfCover: 45, unitsTrend: [200, 210, 205] },
    },
    // ... (up to 3+)
  ],
  proactiveRisks: [
    {
      sku: "SKU015",
      type: "demand_decline",
      severity: "high",
      description: "High inventory (92 days of cover) with declining demand...",
      suggestedMitigation: "Consider promotional clearance...",
    },
    // ...
  ],
  summary: {
    totalRevenue: 45230,
    totalUnitssSold: 892,
    highRiskSkus: 3,
    decliningSku: 7,
  },
}
```

## Key Guarantees

### Numbers are Deterministic

Every metric in the fact bundle is computed from source data with no LLM-invented numbers:

- **Velocity** = units sold / 30 (calendar approximation)
- **Days of Cover** = inventory / velocity (capped at 999 for >~3 years)
- **Value at Risk** = inventory × retail price (optional COGS discount)
- **Trends** = detected from 3+ consecutive periods of declining units

### Auditor Verifies Claims

The LangGraph `Auditor` node:
- Confirms every quantitative statement maps to a fact-bundle field
- Rejects hallucination (SKU invention, unsupported numbers, internal contradictions)
- Enforces ~3 iteration bounds to avoid infinite loops

### Fail-Closed Validation

Missing required columns, type mismatches, or duplicates block the pipeline:

```typescript
if (parseResult.errors.length > 0) {
  // Return error report; do NOT invent data
  return { success: false, errors: parseResult.errors };
}
```

## CSV Field Mapping

### Required

| Logical Field | Purpose |
|---------------|---------|
| `sku` | Unique product identifier (string) |
| `period` | Reporting month in YYYY-MM format |
| `units_sold` | Net units sold (after returns) |
| `revenue` | Net revenue in currency units |
| `on_hand_inventory` | Current stock at hand (units) |
| `retail_price` | List/MSRP per unit |

### Optional

| Logical Field | Purpose |
|---------------|---------|
| `cogs` | Cost of goods sold per unit; enables contribution ranking |
| `inbound` | On-order inventory; used for coverage reserve |

### Aliasing

The system recognizes common column names:

```typescript
// SKU variants: "sku", "product_id", "sku_code", "item"
// Period variants: "period", "month", "yyyymm", "date"
// Revenue variants: "revenue", "sales", "total_sales", "gross_revenue"
// Price variants: "retail_price", "list_price", "price", "msrp"
```

Use `inferFieldMapping(headers)` to auto-detect; provide explicit mapping if non-standard.

## Error Handling

### Parsing Errors

```typescript
{
  stage: "parse_csv",
  message: "Failed to parse CSV: [reason]",
  detail: Error,
}
```

### Validation Errors (Fail-Closed)

```typescript
{
  stage: "validate_rows",
  message: "3 row(s) failed validation",
  detail: [
    { rowIndex: 5, field: "revenue", value: "abc", reason: "not a valid number" },
    // ... up to 5 errors shown
  ],
}
```

### Duplicate Errors

```typescript
{
  stage: "detect_duplicates",
  message: "Found 2 duplicate (SKU, period) key(s)",
  detail: [
    { sku: "SKU001", period: "2024-03", rowIndices: [10, 15] },
  ],
}
```

**Policy Options:**

- `"fail"` (default): Block on first duplicate
- `"last-wins"`: Keep last occurrence, de-duplicate silently (warns in result)

## Testing

```bash
npm run test
```

Tests validate:
- CSV parsing with valid/invalid data
- Field mapping inference
- Metrics computation (velocity, cover, value-at-risk)
- Trend detection (growth, decline, stable)
- Fact bundle generation
- Reorder recommendation ranking

## Dependencies

### Core
- **`@supabase/supabase-js`** — PostgreSQL + Storage client
- **`csv-parse`** — CSV parsing (CommonJS-safe streaming)
- **`zod`** — Runtime schema validation

### Phase 2 — LangGraph Agents
- **`@anthropic-ai/sdk`** — Claude API client for agent nodes
- **`@langchain/anthropic`** — LangChain bindings for Claude
- **`@langchain/langgraph`** — Graph-based orchestration (not used in final implementation; pure TS executor)

## Environment Configuration

### Required Variables (Phase 1)
- `SUPABASE_URL` — PostgreSQL database URL (e.g., `https://xxxxx.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` — Service role API key for admin operations

### Required Variables (Phase 2 — Agent Orchestration)
- `ANTHROPIC_API_KEY` — Claude API key (e.g., `sk-ant-...`)
- `LLM_MODEL` — Claude model ID (default: `claude-3-5-haiku-20241022`)
- `LLM_TEMPERATURE` — Sampling temperature for agents (default: `0.3`)

Set these in `.env` or pass to `loadEnv(overrides)`:

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-xxx...
LLM_MODEL=claude-3-5-haiku-20241022
LLM_TEMPERATURE=0.3
```

## Performance Notes

- **Parsing**: ~10-50ms for typical 1K-row CSV
- **Analytics**: ~5-20ms (all metrics computed in-memory)
- **Bundle generation**: ~2-5ms (JSON serialization)
- **Total**: ~20-100ms for end-to-end CSV→bundle on typical data
- **Briefing generation** (Phase 2): ~2-4 min for Analyst + Auditor (includes API latency)

Storage operations (Supabase upload/download) are network-dependent (100ms–1s).

## Roadmap

### Phase 2 (Complete) ✓
- LangGraph orchestration with Analyst + Auditor agents
- Narrative briefing generation with citation verification
- Timeout enforcement (2-min Analyst, 1-min Auditor, 5-min total)
- Async workflow execution with fire-and-forget pattern
- Briefing storage in Supabase with versioned paths

### Phase 3 (Future)
- PDF generation for briefing documents
- Human-in-the-Loop (HiTL) gates for manual risk review
- Scheduled/batch runs for automated weekly briefings
- Supplier lead time & MOQ in CSV → order quantity suggestions
- Seasonal decomposition for demand forecasting
- A/B testing artifact comparison
- Custom metric plugins for domain-specific analyses

## License

Internal use only.
