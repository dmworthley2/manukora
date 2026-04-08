# Dev Workflow Design

**Date:** 2026-04-07
**Status:** Approved

## Problem

Changes to the Manukora codebase have been made reactively — patches applied without fully understanding root cause, unknowns left unprobed, and deploy steps missed. This has caused repeated cycles of fixing the same issue.

## Solution

A two-part enforcement mechanism: a rule in `CLAUDE.md` that makes the workflow mandatory, and a `dev-workflow` skill that gates each step.

---

## Part 1 — CLAUDE.md Rule

Added to the project `CLAUDE.md` under a new **Development Workflow** section:

> For any non-trivial change, invoke the `dev-workflow` skill before writing implementation code. This applies to new features, refactors, multi-file changes, and prompt/agent changes.
>
> **Exception:** Single-file bug fixes where the problem and fix are both unambiguous may skip the skill and be fixed directly. If there is any doubt about root cause or side effects across other files, the skill applies.

---

## Part 2 — `dev-workflow` Skill

A skill at `~/.claude/skills/dev-workflow.md` (or equivalent location) with five explicit gates.

### Step 1: Analysis

- Read all relevant files before stating anything
- Write out: what the problem is, what we know, and what we don't know yet
- For each unknown: probe it (read code, check DB schema, test an assumption) — do not assume
- **Gate:** All unknowns resolved or explicitly accepted as named assumptions before proceeding

### Step 2: Refinement

- Restate the requirement with all ambiguity resolved
- Propose 2–3 approaches with trade-offs
- Explicitly state what is out of scope
- **Gate:** One approach chosen, with reasoning stated, before proceeding

### Step 3: Plan

- List every file that will change and what changes in it
- State the order of changes (dependencies between steps)
- Call out any deploy steps required: edge function deploy, backend build, DB migration
- **Gate:** Plan confirmed by user before touching code

### Step 4: Edits

- Work through the plan file by file
- After each logical checkpoint, pause and summarise: what was done, what is next
- **Gate:** User reviews each checkpoint before continuing to the next

### Step 5: Execute

- Commit with a clear, descriptive message
- Run all required deploy steps (build, deploy, migrate) — not just writing the code
- **Gate:** Deploy confirmed complete before marking work done

---

## Scope

This workflow applies to all non-trivial changes in the Manukora codebase. It does not apply to:
- Single-file bug fixes where the problem and fix are both unambiguous
- Documentation-only changes
- Dependency version bumps with no behaviour change

---

## Success Criteria

- No change reaches the edge function or production DB without having passed through Plan and Execute gates
- Unknown assumptions are always named before code is written, not discovered after
- Deploys are confirmed, not assumed
