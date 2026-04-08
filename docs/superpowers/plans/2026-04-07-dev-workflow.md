# Dev Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a 5-step development workflow (Analysis → Refinement → Plan → Edits → Execute) via a CLAUDE.md rule and a `dev-workflow` skill.

**Architecture:** Two files — a new section appended to the project `CLAUDE.md`, and a new skill at `~/.claude/skills/dev-workflow/SKILL.md`. No code changes, no migrations.

**Tech Stack:** Markdown only.

---

### Task 1: Add Development Workflow section to CLAUDE.md

**Files:**
- Modify: `/Users/davidworthley/manukora/CLAUDE.md` (append new section before Git Guidelines)

- [ ] **Step 1: Append the Development Workflow section**

Open `/Users/davidworthley/manukora/CLAUDE.md` and insert the following block immediately before the `# Git Guidelines` heading (after the `---` that follows the How to Resume/Continue section):

```markdown
## Development Workflow

For any non-trivial change, invoke the `dev-workflow` skill before writing implementation code. This applies to new features, refactors, multi-file changes, and prompt/agent changes.

**Exception:** Single-file bug fixes where the problem and fix are both unambiguous may skip the skill and be fixed directly. If there is any doubt about root cause or side effects across other files, the skill applies.
```

- [ ] **Step 2: Verify the file reads correctly**

Read back the file and confirm:
- The new section appears between `How to Resume/Continue` and `Git Guidelines`
- The exception clause is present and unambiguous
- No existing content was removed or altered

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Development Workflow rule to CLAUDE.md"
```

---

### Task 2: Create the dev-workflow skill

**Files:**
- Create: `/Users/davidworthley/.claude/skills/dev-workflow/SKILL.md`

- [ ] **Step 1: Create the skill directory and file**

Create `/Users/davidworthley/.claude/skills/dev-workflow/SKILL.md` with the following content:

```markdown
---
name: dev-workflow
description: 5-step development workflow gate: Analysis → Refinement → Plan → Edits → Execute. Invoke before any non-trivial implementation work.
triggers:
  - when starting a new feature
  - when fixing a multi-file bug
  - when refactoring
  - when changing agent prompts or edge functions
---

# Development Workflow

Announce: "Using dev-workflow to gate this change through Analysis → Refinement → Plan → Edits → Execute."

Work through each step in order. Do not proceed past a gate until it is explicitly cleared.

---

## Step 1: Analysis

1. Read every file relevant to the change before writing anything.
2. Write out clearly:
   - **What the problem is** — one sentence
   - **What we know** — facts confirmed by reading the code
   - **What we don't know** — explicit list of unknowns
3. For each unknown: probe it. Read more code, check the DB schema, inspect a migration, run a query. Do not assume.
4. **Gate:** State all unknowns as either resolved (with evidence) or accepted as named assumptions. Get user confirmation before proceeding.

---

## Step 2: Refinement

1. Restate the requirement with all ambiguity resolved.
2. Propose 2–3 approaches with trade-offs for each.
3. Explicitly state what is out of scope.
4. **Gate:** State which approach is chosen and why. Wait for user confirmation before proceeding.

---

## Step 3: Plan

1. List every file that will change and what changes in it (exact paths).
2. State the order of changes — what must happen before what.
3. Call out every deploy step required: edge function deploy, backend build, DB migration, env var change.
4. **Gate:** Present the full plan and wait for user confirmation before touching any code.

---

## Step 4: Edits

1. Work through the plan file by file.
2. After each logical checkpoint (a coherent unit of change — e.g., all backend changes done, or one component complete), pause and state:
   - What was done
   - What is next
3. **Gate:** Wait for user review at each checkpoint before continuing to the next.

---

## Step 5: Execute

1. Commit with a clear, descriptive message that explains the why, not just the what.
2. Run every deploy step listed in the plan:
   - Edge function: `supabase functions deploy <name>`
   - Backend: `cd backend && npm run build`
   - Migration: apply via Supabase CLI or dashboard
3. **Gate:** Confirm the deploy completed — check logs, verify data in DB, or confirm the UI reflects the change. Do not mark work done until this is confirmed.
```

- [ ] **Step 2: Verify the skill file**

Read back `/Users/davidworthley/.claude/skills/dev-workflow/SKILL.md` and confirm:
- All 5 steps are present with their gates
- Each gate requires explicit user confirmation before proceeding
- Deploy steps in Step 5 match the actual deploy commands used in this project

- [ ] **Step 3: Commit**

```bash
git -C /Users/davidworthley/.claude add skills/dev-workflow/SKILL.md
git -C /Users/davidworthley/.claude commit -m "feat: add dev-workflow skill"
```

Note: the skill lives in `~/.claude` which is its own git repo, separate from the Manukora project repo.

---

## Self-Review

- Spec coverage: CLAUDE.md rule ✓ (Task 1), skill with all 5 gates ✓ (Task 2), exception clause ✓ (Task 1 Step 1), deploy steps in Execute ✓ (Task 2 Step 1)
- No placeholders or TBDs
- Two separate commits — one per repo — correctly identified
- Exception clause wording is identical between spec and plan
