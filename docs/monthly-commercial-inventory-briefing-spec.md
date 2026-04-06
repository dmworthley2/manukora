# Manukora Functional & Architecture Specification  

## Monthly Commercial & Inventory Briefing (Agentic)

**Audience:** CTO, Solutions Architect, Engineering Lead  
**Classification:** Internal — product & technical  
**Version:** 3.0  
**Status:** Draft for review  

---

## 1. Executive summary

This initiative delivers a **batch agentic application**—**Next.js / React** front end, **TypeScript** analytics and API, **LangGraph** orchestration, deployed on **Vercel** with **Supabase** (PostgreSQL + Storage)—that ingests **structured commercial CSV data** and produces a **monthly executive briefing** (~5-minute read) covering **what sold well or poorly**, **inventory cover risk**, **Proactive Risks** (§9.2.2), and **prioritized reorder guidance** with explicit trade-offs.

**Architectural principle:** A **deterministic analytics core** (TypeScript) computes all metrics, rankings, and flags. A **LangGraph**-orchestrated agent loop—**Analyst** (narrative) and **Auditor** (verification)—consumes a **machine-readable fact bundle** and produces the briefing. **Numbers displayed to users SHALL NOT originate from unconstrained LLM generation**; the **Auditor** node enforces alignment with the fact bundle before finalization (§5.5).

**Scope honesty:** This is **not** full cross-functional S&OP (finance consensus, capacity, integrated business planning). It is the **demand–inventory–replenishment chapter** of that story. Naming and external comms MUST reflect that to avoid stakeholder misalignment.

---

## 2. Business outcomes & success criteria

| Outcome | Measure |
|--------|---------|
| Actionable monthly view | Exec completes scan in ≤5 minutes; clear next steps |
| Trust | Every quantitative claim traceable to input rows + computed fields |
| Correct prioritization | Reorder ranking reflects **commercial value at risk** with **declining-demand conflicts** surfaced, not suppressed |
| Reasoning quality | Narrative **interprets** facts (implications, trade-offs, priorities)—not **restates** tables (§10.5) |
| Operability | Repeatable batch runs, auditable outputs, validation on bad inputs |
| Discoverability | **Simple UX** (§5.8): uploads list + **historical output folder** for analysis without re-run |

---

## 3. Stakeholders

| Role | Interest |
|------|----------|
| **CTO / Platform** | Security, data governance, LLM guardrails, cost/latency, maintainability |
| **Solutions / Enterprise Architecture** | Integration patterns, data contracts, boundary between deterministic and probabilistic components |
| **Commercial / Ops** | Accurate performance narrative, reorder priorities |
| **Engineering** | Clear schemas, testable metrics, CI-friendly golden outputs |

---

## 4. Scope

### 4.1 In scope

- Monthly (or user-selected) reporting period with **defined calendar rules** (§7).
- SKU-level (and optional category rollup) **performance vs prior periods** and **multi-month trends**.
- **YoY** comparison when sufficient history exists; explicit **insufficient history** otherwise (see **launch / short-history** rules in §9.6).
- **Cover risk** from **defined inventory and velocity fields** (§8).
- **At least three** SKU-level reorder recommendations with structured rationale.
- **Ranking** by **commercial value at risk** (§9.3) with **mandatory conflict handling** when **validated declining trend** applies (§9.4).
- **Agentic narrative** constrained by **fact bundle** (§11) and **Auditor verification** (§5.5).
- **Optional Human-in-the-Loop (HiTL)** for validation of **Proactive Risks** and reorder stance before finalize (§5.6).

### 4.2 Out of scope (initial release)

- ERP / PO automation, supplier APIs, automated ordering.
- Training bespoke forecasting models (may use **documented simple projections** only).
- Full IBP / finance S&OP cycle, capacity planning, promotional calendar system integration.

### 4.3 Optional extension (documented as Phase 2)

- CSV or config fields for **supplier lead time**, **MOQ**, **case pack** — to move from “reorder candidate” to **constraint-aware** suggested order quantities.

---

## 5. Architecture overview

### 5.1 Technology stack

| Layer | Technology | Role |
|-------|------------|------|
| **Frontend** | **Next.js**, **React** | Uploads, run history, **Simple UX** (§5.8), HiTL review surfaces when enabled |
| **Backend** | **TypeScript** (Next.js Route Handlers / Server Actions **or** dedicated TS service co-deployed) | CSV ingestion, **deterministic analytics core**, fact-bundle construction, LangGraph invocation, persistence calls |
| **Orchestration** | **LangChain** + **LangGraph** | Graph state, **Analyst** / **Auditor** nodes, optional **interrupt** for HiTL (§5.5–5.6) |
| **LLM** | Provider TBD (OpenAI, Anthropic, etc.) | **Only** within Analyst (and Auditor’s structured checks)—**no numeric invention** |

### 5.2 Infrastructure & deployment

| Component | Service | Responsibility |
|-----------|---------|----------------|
| **Hosting / edge** | **Vercel** | Next.js app, serverless/edge API routes, background jobs (or queue-triggered workers per implementation) |
| **Relational metadata** | **Supabase (PostgreSQL)** | Users/sessions (if applicable), **upload registry**, **run records** (`run_id`, status, timestamps, input hashes, links to Storage paths, LangGraph **thread/checkpoint ids** for HiTL resume) |
| **Object storage** | **Supabase Storage** | **Immutable CSV archives** per upload; **briefing artifacts** (Markdown, PDF, rendered HTML); **fact bundle JSON snapshots**; optional Auditor transcript |

**Principle:** Postgres holds **pointers and metadata**; Storage holds **blobs**. Retention policies MUST treat briefing outputs as **long-lived commercial records** unless legally constrained (§5.7).

### 5.3 Logical components (data flow)

```
┌──────────────┐     ┌─────────────────────────┐     ┌──────────────────────┐
│ Next.js UI   │────▶│ TypeScript backend       │────▶│ Fact bundle (JSON)    │
│ (uploads)    │     │ Deterministic analytics  │     │ Single source of      │
└──────────────┘     │ (metrics, ranks, flags)  │     │ numeric truth         │
       ▲             └─────────────────────────┘     └──────────┬───────────┘
       │                          ▲                               │
       │                          │ save                          ▼
       │                   ┌──────┴──────┐              ┌───────────────────────┐
       │                   │ Supabase   │              │ LangGraph (LC)        │
       │                   │ PG + Store │◀────────────▶│ Analyst → Auditor    │
       │                   └────────────┘              │ (loop §5.5)           │
       │                          ▲                    └──────────┬────────────┘
       │                          │                               │
       │                   HiTL interrupt (optional)               ▼
       └────────────────────────────────────────────── Briefing + archive (§5.7)
```

### 5.4 Fact bundle principle (non-negotiables)

1. **All numbers** in the user-facing report are **serialized from the fact bundle** (or verbatim copies of bundle fields produced by the **analytics core**).  
2. **Analyst** and **Auditor** nodes **SHALL NOT** invent SKUs, dates, quantities, prices, or rankings; Auditor **rejects** drafts that introduce or mismatch quantitative claims.  
3. **Validation failures** block briefing generation or produce an explicit **error report** (prefer **fail closed** for metrics layer).  
4. LangGraph state MAY store **references** to fact bundle IDs and Storage URIs; **authoritative metrics** remain in the bundle artifact, not in mutable graph memory alone.

### 5.5 LangGraph: multi-agent loop (Analyst + Auditor)

The orchestration graph SHALL implement at minimum:

| Node | Responsibility |
|------|----------------|
| **`analyst`** | Consumes **fact bundle** + policy context; generates **narrative briefing** (§10.5, §11): synthesis, trade-offs, priorities, **Proactive Risks** (§9.2). Output: draft document + structured citations map to bundle keys. |
| **`auditor`** | **Numerical and logic verification:** confirms every quantitative statement in the draft maps to a **fact-bundle field** (or derived field defined in `methodology`); checks internal consistency (e.g. ranks, flags); flags **hallucination risk** or **unsupported claims**. |

**Loop:** `analyst` → `auditor` → if **fail** or **needs_revision**, route back to `analyst` with **auditor_feedback** (bounded iterations, e.g. max 3); if **pass**, proceed to **finalize** (and optional **HiTL** gate §5.6).

**Determinism:** Metrics and flags are **never** recomputed inside LLM nodes; **Auditor** may run **deterministic string/regex/schema checks** in TypeScript **outside** the model, or a **tool-calling** sub-step—product choice, but **verification logic** MUST be testable in CI.

### 5.6 Optional Human-in-the-Loop (HiTL)

When enabled (per org, user, or run):

1. **Interrupt points** after **Auditor pass** (or before finalize): user must **acknowledge** or **edit** disposition on **Proactive Risks** (`proactive_risks[]` in fact bundle) and/or **reorder stance** summaries for top recommendations.  
2. LangGraph **persistent checkpointing** (LangGraph + Supabase-backed thread id) SHALL allow **resume** after human input; state MUST NOT advance to **archived output** until HiTL completes or user **explicitly overrides** with audit log entry.  
3. HiTL is **optional**: default automated path runs **Analyst → Auditor → finalize** without pause.

### 5.7 Output archive & version-controlled records

1. **Permanent record:** Each successful run produces an **immutable output set**: fact bundle JSON, briefing (MD and/or PDF), optional HTML, **manifest** (`run_id`, versions, hashes).  
2. **Supabase Storage:** Canonical store for blobs; paths versioned by `run_id` / period (e.g. `outputs/{year}/{month}/{run_id}/…`).  
3. **Repository convention:** The codebase SHALL maintain a **version-controlled `outputs/` (or `fixtures/golden-outputs/`) folder** for **golden snapshots**, **schema examples**, and **documented sample briefings**—not necessarily every production run, but the **pattern** for how archived artifacts are named and structured MUST match Storage layout for **reproducibility and audits**. Production runs MAY be Storage-only if volume is high; **metadata in Postgres** always points to Storage URIs.  
4. **Audit:** No user-facing “delete briefing” without **admin policy**; aligns with **permanent records** for historical analysis.

### 5.8 Simple UX requirements

| Requirement | Description |
|-------------|-------------|
| **Uploads view** | A **storage-oriented list** of **previous CSV uploads** (filename, upload time, size, status, link to source blob in Storage, associated `run_id`s). Users can **trace** which input produced which briefing. |
| **Output / history folder** | A dedicated **UI surface** (and Storage prefix) for **historical briefings**: browse by month, search by SKU/run, open PDF/MD, compare **recommendations** across runs. Supports **historical analysis** without re-running the graph. |
| **Consistency** | Same **path naming** between UI labels, Postgres `storage_path`, and **§5.7** repo convention. |

### 5.9 Operational deployment pattern

- **Trigger:** User upload via Next.js or scheduled job.  
- **Target latency:** deterministic stage seconds–minutes; LangGraph bounded by iterations × model SLA; HiTL pauses wall-clock until resume.  
- **Artifacts:** Every finalize writes **Storage + Postgres row**; `run_id`, input hash, fact bundle hash, model id, **LangGraph** / prompt version recorded.

---

## 6. Data ingestion contract

Accepted uploads are **persisted to Supabase Storage** (immutable blob per version) and registered in **Postgres** (metadata, `run_id` linkage) per **§5.2** and **§5.8**—enabling the **previous uploads** view and audit trail.

### 6.1 File format

| Rule | Specification |
|------|----------------|
| Encoding | UTF-8 (BOM tolerated) |
| Delimiter | Comma (configurable to tab if needed) |
| Header row | Required; column mapping via config if names differ |
| Duplicates | Policy: **fail** on duplicate (SKU, period) keys, or **last row wins** — pick one and implement exactly |

### 6.2 Minimum logical schema

Concepts MUST be mappable from the CSV. **Minimum required:**

| Concept | Required | Notes |
|---------|----------|--------|
| SKU identifier | Yes | Stable string key |
| Period (month) | Yes | ISO month or agreed format |
| Units sold (net) | Yes | **Net of returns** per §8.4 |
| Revenue (net) | Strongly recommended | For ASP and “sold well” |
| On-hand inventory (units) | Yes | **Definition fixed** per §8.1 |
| Retail / list price | Yes* | For theoretical upside; *ASP preferred if net revenue + units available |
| Cost / COGS | Optional | Enables **contribution**-based ranking (Phase 1 optional) |

**Inbound / on-order** — represented in source data per deployment (e.g. **`Order_Arrival_Months`**). Semantics MUST NOT be ambiguous (§6.5).

**Channel demand** — when **Shopify** and **Amazon** are separate columns, **combined channel demand** (sum) SHALL be used for **all** sell-through, trend, and value-at-risk calculations unless the briefing is explicitly single-channel (not the default for pooled inventory — §8.1).

### 6.3 History requirements

- **Trend context:** ≥2 complete prior months recommended; **3-month declining trend** requires **3 prior months** of non-null demand/velocity in scope.  
- **YoY:** requires **same calendar month one year ago**; if missing, output **“YoY N/A (insufficient history)”**.

### 6.4 Validation & errors

Ingestion SHALL emit **structured validation result**: errors (blocking), warnings (non-blocking, listed in briefing appendix). Examples: missing required columns, non-numeric fields, impossible dates, negative inventory where disallowed.

### 6.5 Column semantics (deployment: pooled inventory & orders)

| Field / concept | Normative meaning |
|-----------------|-------------------|
| **`Stock_On_Hand`** | **Global pooled** position: all channels (e.g. Shopify + Amazon) draw from **one** pool. This is the inventory input to cover math. |
| **Channel sales** | **Shopify M4 + Amazon M4** (per month) = **combined demand** baseline for rate, trends, and projections unless config disables a channel. |
| **`Order_Arrival_Months`** | **`0` = no supplier order currently placed** (not “arrives immediately”). Non-zero = order exists with arrival in the indicated horizon (exact calendar mapping per data dictionary). Misinterpreting `0` **invalidates** cover and reorder narrative. |

These semantics MUST be reflected in `methodology` inside the fact bundle and in LLM system prompts.

---

## 7. Time & calendar (normative)

| Decision | Specification |
|----------|----------------|
| Reporting period | **Calendar month** in a **named timezone** (e.g. `America/Los_Angeles`) — **configurable** |
| Month boundaries | First instant to last instant of month in that timezone |
| “Last month” | Default: last **completed** calendar month relative to run date (configurable anchor) |
| Partial months | Not supported for “closed month” metrics; if file contains MTD only, **warn** and treat as out of scope for official monthly close |

### 7.1 Reference period labels (deployment example: Manukora)

For alignment across data exports and narrative, **month indices** MAY be used in addition to calendar dates:

| Label | Calendar (example) | Role |
|-------|-------------------|------|
| **M1** | December 2025 | History for **trend** |
| **M2** | January 2026 | History for **trend** |
| **M3** | February 2026 | History for **trend** |
| **M4** | March 2026 | **Most recent complete month** — **baseline month** for **current sell-through rate** and cover (§8.2) |

When the CSV uses calendar months instead of M-labels, the analytics layer SHALL map rows to the same logical roles. **“Current rate” for cover** = **M4** (or configured `baseline_month`), not an average of M1–M4 unless explicitly overridden in methodology.

---

## 8. Domain definitions

### 8.1 Inventory for cover calculations

**Single authoritative field** SHALL be documented per deployment.

**Manukora / DTC pooled model:** **`Stock_On_Hand`** = **current global pooled** inventory (Shopify and Amazon orders **both** consume this pool). Do **not** split cover by channel unless channel-specific inventory columns exist and policy requires it.

More generally:

- **Sellable on-hand** = units available to fulfill orders (exclude unsellable hold if columns exist), **or**  
- **Total on-hand** if no finer breakdown — **must be consistent** across SKUs.

If multiple **physical** warehouses exist without pooling in the file, either **sum** into one “network on-hand” column or **per-node** rules — **must be explicit**. Vague “inventory” without mapping is **non-compliant**.

### 8.2 Velocity & baseline month (canonical; avoid ambiguous “sell-through %”)

**Baseline for cover and “current rate” (Manukora):** Use **M4 (most recent complete month)** **combined** channel units as the **monthly demand** input for translating into run rate and weeks of cover:

\[
D_{\text{M4}} = \text{Shopify units}_{\text{M4}} + \text{Amazon units}_{\text{M4}} \quad (\text{per SKU})
\]

\[
v_{\text{weekly}} = \frac{D_{\text{M4}}}{4.33}
\]

(Equivalent: monthly rate = \(D_{\text{M4}}\); cover in **days** = \(\text{Stock\_On\_Hand} / (D_{\text{M4}}/30.4)\), etc.)

**Trend context (M1–M4):** Compute **monthly series** over **M1–M4** on **combined** demand. If a **clear** trend (accelerating or declining) is detected, the fact bundle SHALL include `trend_m1_m4` (direction, magnitude) and the LLM SHALL **explain whether it changes** reorder urgency vs using the **M4 point estimate** alone (§10.5).

**General formulation (non-M4 deployments):** Weekly velocity MAY still be defined as:

\[
v = \frac{\text{net units sold in trailing } W \text{ weeks}}{W}
\]

Default **W = 4** **or** **last baseline month’s units ÷ 4.33** — **one rule globally** in `methodology.velocity`.

**“Sell-through %”** (optional KPI): only if **beginning inventory + receipts** exist; otherwise **do not** compute or label loosely.

### 8.3 Cover (weeks)

\[
\text{cover\_weeks} = \frac{\text{inventory\_units (per §8.1)}}{v}
\]

Guardrails: if \(v = 0\) or below noise threshold, set **cover = undefined** and flag **low/zero velocity** (do not divide by zero).

### 8.4 Net sales & returns

- **Net units** and **net revenue** SHALL be defined as **after returns/cancellations** if those are in source data.  
- If only gross is available, **warn** in fact bundle and briefing: projections may be **biased high**.

### 8.5 Price & commercial value

| Field | Use |
|-------|-----|
| **ASP** | `net revenue ÷ net units` per SKU-month when revenue present |
| **List / retail price** | Theoretical upside; label clearly if ASP differs materially |

---

## 9. Business logic

### 9.1 Performance: sold well / poorly

- **Last month (e.g. M4):** ranking by **net revenue** (primary) and/or **net units** (secondary) on **combined** channel demand — **configurable weighting**.  
- **Trend:** vs **prior month** and multi-month series (e.g. **M1–M4** combined demand for Manukora — §7.1, §8.2).  
- **YoY:** same month prior year when available — **not** used for **launch cohorts** (§9.6).

### 9.2 Stock cover risk flags & Proactive Risks

**Default target cover:** configurable global (e.g. **~2 months** for “most SKUs”). **Per-SKU overrides** MUST be supported in **SKU policy config** (YAML/JSON), not hard-coded only in prompts.

**Example (Manukora):**

| SKU / family | Rule |
|--------------|------|
| **MGO 1700+ 100g** | **Target cover = 3 months** (vs 2 for default basket): intentional—premium price point and **longer supplier lead times**. Risk / “below target” flags use **this** threshold. |
| **Propolis Tincture 30ml** | **Phase-out:** commercial end **Q2 2026**. **Flag** if **stockout risk before end of Q2 2026**; **deprioritise reorder** in ranking **unless** cover falls **below 30 days** (then surface as exception). Fact bundle: `lifecycle = phase_out`, `phase_out_horizon = 2026-Q2`. |

#### 9.2.1 Reactive / cover-based flags

**Risk flag** when **either**:

- **cover < target_cover** for that SKU (SKU-specific or default), **or**  
- projected **stockout** before a **policy horizon** (e.g. phase-out date, next review) **when** `velocity > 0`.

#### 9.2.2 Proactive Risks (deterministic)

**Proactive Risks** are **forward-looking** conditions that warrant executive attention **even when current cover is at or above target**. They MUST be computed in the **analytics core** and emitted as structured `proactive_risks[]` in the fact bundle—**not** invented by the Analyst.

| Pattern (example) | Logic (deterministic) | Rationale |
|-------------------|------------------------|-----------|
| **Accelerating demand + no open order** | **`Order_Arrival_Months = 0`** (no PO) **and** **accelerating demand** over M1–M4 (or configured window) per `trend_m1_m4` / slope rule **and** **cover ≥ target** today | Demand is heating up while **no replenishment is in flight**—stock may look “fine” now but **fall through the target** before lead time elapses if trend persists. |
| **High value at risk + no order** | **`Order_Arrival_Months = 0`** **and** **value_at_risk** above SKU or global percentile | Commercial exposure with **no inbound**—prioritize narrative even if cover not yet “red.” |

**Rules:**

1. **Eligibility thresholds** (what counts as “accelerating,” minimum volume) MUST be **versioned** in `methodology.proactive_risks`.  
2. Proactive Risks **complement** cover flags; they **do not replace** them.  
3. **HiTL (§5.6):** Runs MAY pause for user validation of **Proactive Risk** dispositions before finalize.  
4. Analyst MUST **explain** each proactive item using bundle fields; Auditor **verifies** no new numbers.

Thresholds MUST appear in fact bundle and briefing methodology section.

### 9.3 Commercial value at risk (primary ranking metric)

**Primary (recommended): expected monthly revenue at stake**

\[
\text{value\_at\_risk} = \text{ASP} \times D_{\text{monthly}}
\]

Where \(D_{\text{monthly}}\) is **projected monthly demand** from velocity (e.g. \(v \times 4.33\)) or **baseline month** net units (**M4** combined for Manukora — §8.2) — **one rule globally**, stored in `methodology.demand_projection`.

**Alternative (optional config): contribution at risk**

\[
(\text{ASP} - \text{unit\_cost}) \times D_{\text{monthly}}
\]

when cost is trustworthy.

**Secondary / diagnostic:** `list_price × D_monthly` MAY be computed as **theoretical list-price upside** but MUST NOT be the sole ranking dimension when ASP is available (avoid optimizing to phantom list revenue).

### 9.4 Declining trend (single normative rule + volume floor)

A SKU is **declining_trend = true** when **all** hold:

1. **Volume floor:** trailing 3-month **total net units ≥ N_min** (e.g. 20 — **tunable**) OR revenue ≥ equivalent — **suppresses noise on slow movers**.  
2. **Slope rule (default):** simple linear regression of **monthly net units** over the **last 3 completed months** yields **negative slope** and **R² ≥ R²_min** (e.g. 0.5) **OR** monotonic strict decline over those three months **without** flat middle month ambiguity — **pick one primary**; regression preferred for auditability.  
3. **Magnitude guard (optional):** total decline from month T-3 to T-1 ≥ **X%** (e.g. 15%) to avoid flagging trivial drift.

**Conflict:** If `declining_trend = true` **and** SKU is high on **value_at_risk**, the fact bundle MUST set `priority_conflict = true` and carry fields the LLM must address: `value_at_risk`, `decline_pct`, `cover_weeks`.

**Launch / short-history exception:** For **launch cohorts** (§9.6), compute trend **only** on in-trajectory months; use `insufficient_trend_history` when regression cannot be applied—**do not** substitute a misleading YoY or pre-launch baseline.

### 9.5 Reorder recommendations (≥3 SKUs)

- Select **at least three** SKUs using a **documented selection order**, e.g.:  
  1. Highest **value_at_risk** among `cover_risk OR stockout_soon`, **after** applying **lifecycle** rules (e.g. **deprioritise** `phase_out` unless **exception** cover &lt; 30 days — §9.2)  
  2. Then include top **priority_conflict** cases  
  3. If &lt;3 qualify, **widen** by lowering cover threshold **one step** (documented) and **emit `selection.widened_criteria = true`**

Each recommendation object in the fact bundle SHALL include: `sku`, `recommended_stance` (enum), `drivers` (structured), `metrics_snapshot`, `priority_rank`, `priority_conflict`.

### 9.6 Launch cohorts & short history (Bioactive Blends)

**Context:** **Bioactive Blends** (SKUs: **Immunity**, **Energy**, **Recovery**) **launched mid–January 2026**. Observable monthly trajectory in-file is **M2–M4** only.

**Rules:**

1. **Do not** assess these SKUs against a **pre-launch historical baseline** or YoY (insufficient / misleading).  
2. **Trend:** characterize **only within M2–M4** (combined channel demand).  
3. **Declining-trend / conflict flags:** apply **volume floor and regression** only on months with **actual sales post-launch**; if &lt;3 months of meaningful data, set `insufficient_trend_history = true` and let the LLM **qualify** conclusions.  
4. Fact bundle SHOULD include `launch_cohort = bioactive_blends` and `first_full_month = M2` for traceability.

---

## 10. Agentic layer (CTO / SA concerns)

Orchestration is implemented in **LangGraph** (§5.5): **Analyst** generates narrative from the fact bundle; **Auditor** verifies numerical/logical alignment before finalize. Optional **HiTL** interrupts (§5.6) sit **after** Auditor pass when enabled.

### 10.1 Inputs

- **Fact bundle JSON** (complete), including **`proactive_risks[]`** (§9.2.2).  
- Optional: **org glossary**, **risk appetite** text (future).  
- **Auditor feedback** (internal loop only): structured diff from previous iteration—**not** a second source of truth for metrics.

### 10.2 Outputs

- **Narrative briefing** (Markdown / rendered PDF/HTML) **only after** Auditor **pass** (or HiTL completion).  
- **No new quantitative fields** in prose without matching fact-bundle keys (enforce via template, schema, or **Auditor** rejection).

### 10.3 Guardrails

| Risk | Mitigation |
|------|------------|
| Hallucinated numbers | **Auditor** node + optional **TypeScript post-checks**; render tables from bundle-filled templates |
| Inconsistent advice | System prompt: **must** echo `priority_conflict` and **Proactive Risks** when present |
| Cost / latency | Bounded **Analyst ↔ Auditor** iterations; summarize SKUs from bundle, not raw CSV |
| Model drift | **Prompt version** + **model id** + **graph version** stored per run (Postgres metadata) |

### 10.4 Human review (policy decision)

- **Product HiTL (§5.6):** user validation of **Proactive Risks** / reorder stance—**optional** feature flag.  
- **Governance:** CTO may additionally require sign-off above **materiality threshold** (e.g. reorder value &gt; $X)—audit entry in Postgres.

### 10.5 Reasoning quality (normative)

The LLM performs **genuine reasoning**: **inference**, **prioritisation**, and **actionable recommendations**. It MUST **not** substitute **tabular restatement** for analysis.

| Bad (reject) | Good (target) |
|--------------|----------------|
| *“MGO 263+ 500g has 1,700 units on hand and sold 684 units last month.”* | *“MGO 263+ 500g has ~2.5 months of cover at **current combined sell-through**, **no stock on order**, and demand has **grown 23% over four months**. At **$54.99** retail and **~684 units/month** combined, **~$37K/month** revenue is at stake. Cover will fall **below target before a new order could arrive** — **recommend ordering immediately. Priority 1.”* |

**Requirements:**

1. **Synthesis:** Combine **cover**, **M4 rate**, **M1–M4 trend** (if material), **order status** (`Order_Arrival_Months`), **retail/ASP**, and **value at risk** into a **conclusion**, not a list of fields.  
2. **Explicit trade-offs:** When `trend_m1_m4` conflicts with the M4 point estimate, **state** which horizon you are optimising for and **why**.  
3. **Lifecycle awareness:** Honor fact-bundle flags such as `phase_out`, `launch_cohort`, and **SKU target cover** (e.g. 3 months for MGO 1700+ 100g).  
4. **Proactive Risks:** When `proactive_risks[]` is non-empty, **explain** why each item matters (e.g. **no open order** + **accelerating demand**)—do not skip because cover looks “healthy” today.  
5. **Numbers:** Still **only** from the fact bundle; reasoning **interprets** them.

**Evaluation:** Rubric checks (automated or human) SHOULD score runs on: *synthesis*, *actionability*, *absence of pure description*, *conflict paragraphs* where flags exist.

---

## 11. Fact bundle schema (conceptual)

Minimum top-level keys (exact schema: JSON Schema in implementation repo):

- `run_id`, `generated_at`, `timezone`, `period`  
- `methodology` (velocity, cover, demand projection, declining trend rule, thresholds, **`proactive_risks` rules version**)  
- `validation` (errors, warnings)  
- `skus[]`: per-SKU metrics, flags, ranks; include `target_cover_months`, `lifecycle`, `launch_cohort`, `trend_m1_m4`, `order_arrival_months` (raw + interpreted), `channels_combined`, **`cover_risk`**, **`proactive_risk_codes[]`**  
- **`proactive_risks[]`**: global list of proactive items (SKU refs, codes, severity, **deterministic** driver fields)—**Analyst** narrates; **Auditor** checks citations  
- `recommendations[]`: ordered list with `stance`, `reason_codes`, `priority_conflict`  
- `sku_policies` / `deployment`: optional blob for **per-SKU thresholds**, phase-out dates, launch rules  
- `global_insights`: pre-computed strings **optional** — if absent, LLM derives only from `skus` (still no new numbers)  
- **`orchestration_meta`** (optional): `langgraph_thread_id`, `graph_version`, `analyst_iterations` — for **HiTL resume** and audit (no metrics)

---

## 12. Non-functional requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-SEC-1 | Security | Treat CSV as **confidential**; **Supabase** RLS policies for multi-tenant data; signed URLs or server-mediated access to Storage |
| NFR-SEC-2 | Data | If PII columns appear, **reject or strip** per policy — **schema allowlist** recommended |
| NFR-INFRA-1 | Platform | **Vercel**: environment separation (preview/prod); secrets via Vercel env / Supabase vault pattern |
| NFR-INFRA-2 | Persistence | **Supabase Postgres**: migrations versioned; **Storage** buckets for `uploads/` and `outputs/` with **immutable** finalize semantics |
| NFR-OPS-1 | Observability | Structured logs: `run_id`, graph node transitions, durations, validation outcome |
| NFR-OPS-2 | Idempotency | Same input file hash + config → reproducible fact bundle (byte-stable if dependencies pinned) |
| NFR-OPS-3 | HiTL | Checkpoint **thread id** durable in Postgres; resume **idempotent** |
| NFR-QUAL-1 | Testing | **Golden CSV fixtures**; CI asserts fact-bundle JSON matches snapshots; **Auditor** rules unit-tested |
| NFR-QUAL-2 | LLM quality | Rubric-based eval: **`priority_conflict`**, **`proactive_risks`** narrative; **§10.5** synthesis vs description |
| NFR-UX-1 | Experience | **§5.8** uploads list and historical outputs **reachable** in production build |

---

## 13. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Misleading “S&OP” label | Rename externally to **Commercial & Inventory Briefing**; roadmap slide for full IBP |
| Seasonal misread without YoY | YoY when data exists; else explicit gap |
| Naive demand projection | Document methodology; Phase 2 for richer forecast interfaces |
| LLM overrides trust | Hard separation: metrics in code only; **Auditor** gate |
| HiTL complexity | Feature-flag off by default; clear UX for **resume** |
| Vendor coupling | Abstract LLM provider; **LangGraph** checkpoint store pluggable |

---

## 14. Open decisions (for CTO / SA sign-off)

1. **Primary ranking:** ASP-based value at risk vs contribution at risk when cost available.  
2. **Declining trend:** regression vs monotonic rule as **sole** primary (spec allows regression as default).  
3. **Fail vs degrade** on validation warnings.  
4. **Artifact retention** period and **PII** policy for uploaded files (**Supabase** policies).  
5. **LLM provider** and **data residency** (if regulated).  
6. **LangGraph checkpoint backend:** Supabase-native vs Redis (if using managed LangGraph Cloud).  
7. **HiTL default:** off vs on for production pilot.  

---

## 15. Acceptance criteria (release gate)

1. **Golden tests:** Given fixed CSV(s), fact bundle matches approved snapshot (metrics, ranks, flags).  
2. **Conflict:** Synthetic SKU with high value at risk + `declining_trend` → `priority_conflict = true` and briefing section addresses trade-off (manual or rubric eval).  
3. **Bad CSV:** Clear error; no silent briefing.  
4. **Length:** Narrative target **~1,200–1,800 words** configurable; exec snapshot on first screen.  
5. **Reasoning:** Sample outputs meet **§10.5** (synthesis, not table repetition); bad-example patterns absent.  
6. **Deployment rules:** Golden fixtures verify **Order_Arrival_Months = 0** handling, **pooled** `Stock_On_Hand`, **M4 baseline**, **Bioactive** short-history flags, **Propolis** phase-out deprioritisation, **MGO 1700+** 3-month target.  
7. **Proactive Risks:** Fixture where **cover ≥ target**, **`Order_Arrival_Months = 0`**, **accelerating** trend → `proactive_risks[]` populated; Analyst explains; Auditor accepts only cited numbers.  
8. **LangGraph:** Analyst → Auditor loop reaches **pass** within iteration bound on golden runs; no orphan quantitative claims.  
9. **Archive:** Finalize writes **Supabase Storage** + Postgres row; **§5.7** naming convention satisfied.  
10. **UX (when built):** Uploads list and **historical outputs** browse match **§5.8**.  
11. **HiTL (optional):** Interrupt → resume preserves **same** fact bundle; user edits **disposition only**, not metrics (or explicit **override** audit event).  

---

## Document history

| Version | Date | Author | Notes |
|---------|------|--------|--------|
| 3.0 | 2026-04-06 | — | Next.js/React + TS backend, LangGraph Analyst/Auditor, Supabase + Vercel, Simple UX, HiTL, **Proactive Risks** (§9.2.2), output archive §5.7 |
| 2.1 | 2026-04-06 | — | Manukora data context: M1–M4 calendar, pooled inventory, M4 baseline, SKU policies, Order_Arrival semantics, §10.5 reasoning quality |
| 2.0 | 2026-04-06 | — | CTO/SA audience; developer review folded in |
| 1.0 | — | — | Initial functional outline |
