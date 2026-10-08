---
type: constitution
title: Prestoteca — Constitution
description: The non-negotiable principles every rsc-sdd phase obeys.
tags: [sdd, constitution]
timestamp: 2026-10-04T00:00:00Z
topic: sdd
version: v1.0.0
---

# Prestoteca — Constitution

> Version: v1.0.0 · Ratified: 2026-10-04 · Last amended: 2026-10-04
> The non-negotiable principles every rsc-sdd phase obeys. Stack mechanics live in
> `02-DOCS/wiki/stack/*`; this file ratifies the principle and links the detail.

## 1. Stack canon

1. Server: Node.js >= 18 + Express 5.2.1 + TypeScript ~6.0.2. Pinned in `server/package.json`.
2. Database: PostgreSQL. Queries via `pg` (no ORM). Detail: `02-DOCS/wiki/stack/postgresdb.md`.
3. Client: React 19.2.7 + Vite 8.1.0 + TypeScript ~6.0.2 + Tailwind CSS + React Router 7.x. Pinned in `client/package.json`.
4. Package manager: npm (one lockfile per workspace, committed).

## 2. Quality bar

4. Code is formatted and lint-clean on every commit (Prettier + ESLint, zero warnings).
   Enforced by pre-commit — detail in `02-DOCS/wiki/stack/<x>.md`.
5. Types are strict; the type checker passes with no errors before merge.
6. Tests gate the merge: TDD red→green→refactor; line coverage ≥ 80% on changed code.
   Test tooling: Vitest (unit), Supertest (API), Testing Library (components).
   Detail: `02-DOCS/wiki/stack/testing.md`.

## 3. Conventions

7. Naming & structure: `server/src/modules/<module>/` and `client/src/<layer>/` as defined in the brief.
8. API & errors: All routes under `/api`; auth via JWT in httpOnly cookie (1h expiry). Error responses use consistent shape with generic messages to client; details in logs.
9. Commit messages: Semantic (`feat:`, `fix:`, `test:`, `docs:`…).

## 4. Branching & shipping

10. Work happens on a branch off `main`; merge via PR. Direct pushes to `main` are not allowed.
11. **Git authorship is the human's.** No `Co-Authored-By` an AI, no "generated with" footer.
     Enforced at the `ship` phase.

## 5. Security & privacy floor

12. No secret is ever committed. Secrets load from `server/.env` (gitignored). Baseline: `secure-coding`.
13. All external data validated server-side (Zod schemas, length limits, safeParse). SQL always parameterized. Passwords hashed with bcrypt (max 72 chars, 12 salt rounds). XSS: React default escaping, no `dangerouslySetInnerHTML`. CSRF: `SameSite=Lax` + Origin header check on mutating requests. Rate limiting on login/register (5/min/IP). JSON body max 10kb. Helmet 8+ (HSTS 365d default) + CORS. `app.disable('x-powered-by')`. `app.set('trust proxy', 1)`.

## 6. UX / accessibility floor

14. Minimum accessibility bar: WCAG 2.2 AA, keyboard-navigable, visible focus, `prefers-reduced-motion`. Labels on all forms, errors announced to screen readers. Contrast: 4.5:1 text, 3:1 borders/inputs/focus rings. Touch targets ≥ 24×24px.

## 7. Performance budgets

15. Server-side pagination on all listings (12 items per page). Mobile-first: base CSS at 320px, tablet at 768px, desktop at 1024px.

## 8. Knowledge & decisions

16. Every significant decision is appended to `02-DOCS/wiki/sdd/decisions.md` (date, options, why). The constitution is the highest-order decision record.

## Definition of Done (the merge bar `verify` runs against)

A change ships only when ALL hold:

- [ ] Formatter + linter clean (principle 4).
- [ ] Type checker passes (principle 5).
- [ ] Tests pass; coverage floor met on changed code (principle 6).
- [ ] Conventions followed (principles 7-9).
- [ ] On a branch, merged via PR, authored by the human (principles 10-11).
- [ ] No secret committed; security baseline met (principles 12-13).
- [ ] Accessibility / performance budgets met where they apply (principles 14-15).
- [ ] Significant decisions logged (principle 16).

## Amendment log (append-only)

| Date | Version | Change | Why |
|------|---------|--------|-----|
| 2026-10-03 | v1.0.0 | Ratified initial constitution. | Project kickoff. |
| 2026-10-04 | v1.0.1 | Filled stack canon, quality bar, conventions, security, accessibility, performance from product brief. | Brief review. |
| 2026-10-04 | v1.0.2 | Pinned versions: Express 5.2.1, Node >= 18, React 19.2.7, Vite 8.1.0, TS ~6.0.2, React Router 7.x, Helmet 8+. Added `app.disable('x-powered-by')`, `trust proxy`, bcrypt 12 rounds, Zod safeParse. | Context7 library docs consultation. |
