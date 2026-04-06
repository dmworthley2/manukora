# Implementation status (paused)

This document records what was **completed** before execution was paused, and what **remains** for the Manukora commercial briefing stack (backend, web UX, and integrations). Last updated from the paused checkpoint.

---

## Completed (up to pause)

### Product / design inputs

- **[`monthly-commercial-inventory-briefing-spec.md`](monthly-commercial-inventory-briefing-spec.md)** — Functional and architecture specification (v3.0) including fact bundle, LangGraph Analyst/Auditor, Supabase, Vercel, Simple UX, HiTL, Proactive Risks, etc.
- **Stitch UX mockups** — Extracted to [`docs/stitch-mockups/stitch/`](stitch-mockups/stitch/):
  - `executive_summary_brand_aligned/` — `code.html`, `screen.png`
  - `sales_trends_brand_aligned/` — `code.html`, `screen.png`
  - `inventory_risk_brand_aligned/` — `code.html`, `screen.png`
  - `reorder_recommendations_brand_aligned/` — `code.html`, `screen.png`
  - `m_nuka_reserve/DESIGN.md` — **Precision Organics** design system (colors, typography Newsreader + Manrope, no hard borders rule, honey gradient, etc.)

### Backend package (`backend/`)

TypeScript ESM library for deterministic metadata + Supabase Storage (per original backend plan; not the paused web work).

| Area | Status |
|------|--------|
| `package.json` | Scripts: `build`, `typecheck`, `test`; deps: `@supabase/supabase-js`, `zod`; dev: `vitest` |
| `src/env.ts` | Zod validation for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `src/supabase/admin-client.ts` | `createSupabaseAdminClient()` (service role) |
| `src/db/types.ts` | `Database` types for `uploads`, `report_runs` |
| `src/services/uploads.ts` | `uploadCsv`, `getUploadRecord`, `listUploads`, `downloadCsv` |
| `src/services/reports.ts` | `createReportRun`, `finalizeRun`, `saveReportArtifact`, `listOutputsForRun`, `getReportDownloadUrl`, `getReportRun`, `listReportRuns`, `updateReportRunStatus` |
| `src/lib/*` | Constants, paths, SHA-256, minimal structured `log` |
| `src/index.ts` | Public exports |
| `src/env.test.ts` | Vitest smoke tests for `loadEnv` |
| [`supabase/migrations/20260406120000_init_uploads_outputs.sql`](../supabase/migrations/20260406120000_init_uploads_outputs.sql) | Buckets `uploads` / `outputs`, tables `uploads` + `report_runs`, RLS enabled (no user policies yet), updated_at trigger |

**Not verified at pause:** `npm install` / `npm run build` / `npm test` in `backend/` against a live Supabase project (run when resuming).

### Web app (`web/`)

Next.js app + shadcn initialization only; **mockup-aligned UI not built yet.**

| Area | Status |
|------|--------|
| Scaffold | Next.js **15.2.4**, React 19, App Router, `src/`, import alias `@/*` |
| Tailwind | **v4** (`@import "tailwindcss"`), PostCSS |
| shadcn | **`npx shadcn@latest init`** completed — style **base-nova**, `components.json`, Lucide |
| Generated files | [`src/components/ui/button.tsx`](../web/src/components/ui/button.tsx) (Base UI primitive), [`src/lib/utils.ts`](../web/src/lib/utils.ts), [`src/app/globals.css`](../web/src/app/globals.css) updated with shadcn/tokens |
| Default app | Stock [`layout.tsx`](../web/src/app/layout.tsx) / [`page.tsx`](../web/src/app/page.tsx) (Geist fonts; not yet switched to Newsreader/Manrope or Precision Organics theme) |

**Note:** `create-next-app` reported a **security advisory** for Next 15.2.4 — bump to a patched release when resuming ([CVE-2025-66478](https://nextjs.org/blog/CVE-2025-66478)).

---

## Paused at (checkpoint)

Execution stopped **after** Supabase-oriented backend code + SQL migration were added and **after** the `web/` app was created and **shadcn was initialized**, but **before**:

- Applying **Precision Organics** tokens and typography to `globals.css` / layout (per `DESIGN.md` and HTML mockups).
- Adding shadcn primitives beyond **Button** (e.g. Card, Tabs, Table, Badge, Sheet, Separator).
- Building **routes and layouts** that mirror the four Stitch screens + **Simple UX** from the spec (uploads list, historical outputs).
- Connecting the UI to the **`backend`** package or Next.js **Route Handlers** / Server Actions calling Supabase.
- Optional: root `package.json` workspace, shared env `.env.example` at repo root, CI.

---

## Remaining work (recommended order)

### 1. Hardening and verification

- [ ] In `backend/`: run `npm install`, `npm run typecheck`, `npm run build`, `npm test`.
- [ ] Apply Supabase migration to a dev project (`supabase db push` or paste SQL in dashboard).
- [ ] In `web/`: upgrade **Next.js** to a patched version; run `npm run build` and fix any issues.

### 2. Design system (web)

- [ ] Map **Precision Organics** CSS variables in [`web/src/app/globals.css`](../web/src/app/globals.css): cream background `#fdf9ef`, `primary` `#775a00`, `primary-container` / gold `#f6be00`, surfaces per DESIGN.md, **sharp radius** (`0.125rem`) where mockups use it.
- [ ] Load **Newsreader** + **Manrope** in [`layout.tsx`](../web/src/app/layout.tsx) (replace or complement Geist).
- [ ] Add utility classes: `honey-gradient`, `premium-shadow`, `breathing-margin` (from mockup HTML).
- [ ] Respect **no 1px section borders** where possible—use tonal surfaces instead (DESIGN.md).

### 3. shadcn components

- [ ] `npx shadcn@latest add` for: **card**, **badge**, **tabs**, **table**, **separator**, **scroll-area**, **sheet** (mobile nav), and any others needed for tables/alerts.

### 4. App structure and pages (mirror mockups + spec §5.8)

- [ ] Shared **shell**: fixed header (“Manukora”), nav links matching mockups: Summary, Sales, Inventory, Reorders; add **Data** or **Library** section for **Uploads** + **Outputs** per spec.
- [ ] `/` or `/dashboard` — Executive summary (KPI grid, “What to Act On”, alerts).
- [ ] `/sales-trends` — Sales & trends (bento, top/bottom SKUs, Revenue/Units toggle).
- [ ] `/inventory-risk` — Stock cover / risk table (filter controls as in mockup).
- [ ] `/reorder-recommendations` — Prioritized reorder cards/list.
- [ ] `/uploads` — List previous CSV uploads (metadata; later: Supabase-backed).
- [ ] `/outputs` — Historical briefings / reports (browse by period; later: Storage + DB).

Use **placeholder data** initially; wire to APIs in a later step.

### 5. Integration

- [ ] Server-only Supabase client in Next.js **or** import `@manukora/backend` from a workspace package after adding `npm` workspaces / `tsconfig` paths.
- [ ] API routes or Server Actions: upload CSV → `uploadCsv`; list uploads; create run → `finalizeRun` when pipeline exists.
- [ ] Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only); never expose service role to the client.

### 6. Repository hygiene

- [ ] Root **README** linking backend, web, migrations, and this status doc.
- [ ] Optional: **pnpm/npm workspaces** to hoist `backend` + `web` under one repo root `package.json`.

---

## Reference links

- Spec: [`docs/monthly-commercial-inventory-briefing-spec.md`](monthly-commercial-inventory-briefing-spec.md)
- Design system: [`docs/stitch-mockups/stitch/m_nuka_reserve/DESIGN.md`](stitch-mockups/stitch/m_nuka_reserve/DESIGN.md)

---

## How to resume

1. Read this file and confirm priority (UI-first vs Supabase wiring-first).
2. Run verification commands in §1.
3. Implement §2–§4 in the web app, then §5–§6 as needed.
