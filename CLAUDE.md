# Manukora Development Standards

> **Session start:** Read `docs/architecture.md` first for a full technical picture of the application — languages, patterns, data flow, and key invariants.

## Frontend Requirements

### 1. Shadcn/UI Foundation (Required)
- **All UI components MUST be built from shadcn/ui primitives**
- Do NOT build custom components from pure Tailwind unless no shadcn equivalent exists
- Add shadcn components via `npx shadcn@latest add [component]` before building features
- Compose pages/features from shadcn components + custom logic

### 2. Senior Developer Level Best Practices

#### Code Organization
- **One component per file** — no mega-files
- **Clear separation of concerns** — UI, logic, data in separate layers
- **Compound components pattern** — for complex UI (e.g., Table with Header, Body, Row)
- **Props interfaces** — explicit types, no `any`
- **Composition over inheritance** — use React composition, not class inheritance

#### Naming & Exports
- **PascalCase for components** — `UserCard.tsx` not `userCard.tsx`
- **Named exports for components**, default export for page routes
- **Explicit file purpose** — `hooks/useInventory.ts`, `components/InventoryTable.tsx`, not generic names
- **Index files for exports** — `components/index.ts` re-exports public API

#### TypeScript Standards
- **Strict mode enabled** — `strict: true` in tsconfig
- **No `any` types** — define interfaces/types for all props and return values
- **Discriminated unions for variants** — e.g., alert type (error | warning | success)
- **Generic components** — parameterize components for reuse

#### Error Handling
- **Error boundaries** — wrap data-fetching features in React error boundaries
- **User-friendly messages** — never expose stack traces to UI
- **Fallback UI** — loading states, empty states, error states
- **Validation at boundaries** — validate API responses before using

#### Performance
- **No unnecessary renders** — use `memo` for expensive computations
- **Lazy load routes** — use `dynamic()` for code splitting
- **Image optimization** — use Next.js Image component
- **Avoid inline functions in renders** — define handlers outside JSX

#### Accessibility
- **Semantic HTML** — use `<button>`, `<nav>`, `<main>`, not `<div>` everywhere
- **ARIA labels** — add aria-label to icon buttons
- **Color contrast** — verify WCAG AA minimum
- **Keyboard navigation** — test with keyboard only
- **Focus management** — visible focus indicators

#### Testing
- **Unit tests for logic** — hooks, utilities
- **Component tests for UI** — test rendered output and interactions
- **E2E tests for flows** — critical user journeys
- **Minimum 80% coverage** — for features, not line-count obsession
- **Tests are documentation** — test names describe behavior clearly

#### Documentation
- **Component storybook comments** — JSDoc for complex props
- **Hook documentation** — describe params and return values
- **Complex logic comments** — explain "why" not "what"
- **README for each feature** — setup, usage, example
- **Changelog entries** — for significant changes

---

## Backend Requirements

### 1. TypeScript Standards (as above)
- Strict mode, no `any`, explicit types, discriminated unions

### 2. Error Handling
- **Custom error classes** — don't throw generic Error
- **Result types** — use discriminated unions for success/failure
- **Detailed error context** — what failed and why
- **Logging** — structured logging (not console.log)

### 3. Testing
- **Unit tests for all services** — business logic
- **Integration tests for APIs** — call real Supabase in test env
- **Fixtures** — golden test data, not randomized
- **Test database** — isolated from production

### 4. Validation
- **Input validation** — Zod/Joi at API boundaries
- **Output validation** — ensure returned types match contracts
- **Fail fast** — validate early, return early

### 5. API Design
- **Consistent naming** — camelCase for API, snake_case for DB
- **Explicit response types** — no generic `{ data: any }`
- **Standard error format** — { code, message, details }
- **Versioning strategy** — plan for evolution

---

## Verification Checklist (Before Marking Complete)

### Frontend
- [ ] All UI built from shadcn/ui components (add any missing via CLI)
- [ ] No custom Tailwind-only components (unless unavoidable)
- [ ] TypeScript strict mode enabled and clean
- [ ] No unused imports, variables, or props
- [ ] All components have typed props interfaces
- [ ] Error boundaries wrapping data-fetching features
- [ ] Loading/empty/error states for all async operations
- [ ] Semantic HTML (buttons are `<button>`, not `<div>`)
- [ ] Responsive tested (mobile, tablet, desktop)
- [ ] Accessibility audit (WCAG AA pass)
- [ ] ESLint clean (0 warnings)

### Backend
- [ ] All services have unit tests
- [ ] All API endpoints tested
- [ ] Zod validation at boundaries
- [ ] Custom error types defined
- [ ] No `console.log` (use structured logging)
- [ ] Database types auto-generated from schema
- [ ] All async operations have timeout/retry logic
- [ ] Environment validation at startup

### Both
- [ ] README with setup instructions
- [ ] `.env.example` with all required vars
- [ ] CI runs tests on every PR
- [ ] No hardcoded secrets
- [ ] Deploys without manual intervention

---

## How to Resume/Continue

1. **Read this file first** — understand the standards
2. **Refactor frontend** — convert custom components to shadcn-based
3. **Add missing shadcn components** — via CLI
4. **Add tests** — unit tests for components, integration tests for pages
5. **Add error boundaries** — wrap data-fetching sections
6. **Verify checklist** — before marking work complete

---

## Development Workflow

For any non-trivial change, invoke the `dev-workflow` skill before writing implementation code. This applies to new features, refactors, multi-file changes, and prompt/agent changes.

**Exception:** Single-file bug fixes where the problem and fix are both unambiguous may skip the skill and be fixed directly. If there is any doubt about root cause or side effects across other files, the skill applies.

---

# Git Guidelines

When writing commit messages, strictly use standard formatting and NEVER include a "Co-authored-by" attribution or any AI signatures.
