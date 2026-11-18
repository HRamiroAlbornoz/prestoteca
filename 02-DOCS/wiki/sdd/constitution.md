---
type: constitution
title: Prestoteca — Constitution
description: The non-negotiable principles every rsc-sdd phase obeys.
tags: [sdd, constitution]
timestamp: 2026-10-04T00:00:00Z
topic: sdd
version: v1.3.0
---

# Prestoteca — Constitution

> Version: v1.3.0 · Ratified: 2026-10-04 · Last amended: 2026-11-18
> The non-negotiable principles every rsc-sdd phase obeys. Stack mechanics live in
> `02-DOCS/wiki/stack/*`; this file ratifies the principle and links the detail.

## 1. Stack canon

1. Server: Node.js >= 18 + Express 5.2.1 + TypeScript ~6.0.2. Pinned in `server/package.json`.
2. Database: PostgreSQL. Queries via `pg` (no ORM). Detail: `02-DOCS/wiki/stack/postgresdb.md`.
3. Client: React 19.2.7 + Vite 8.1.0 + TypeScript ~6.0.2 + Tailwind CSS + React Router 7.x. Pinned in `client/package.json`.
4. Package manager: npm (one lockfile per workspace, committed).

## 2. Quality bar

4. Code is lint-clean before merge, with zero warnings. Client: oxlint (`npm run lint` in `client/`, config in
   `.oxlintrc.json`). Server: no linter yet — **open debt**, to be added in its own change; until then the server's
   bar is `tsc -b` strict with no errors. No formatter is enforced (no Prettier) and there is no pre-commit hook:
   the check runs in `verify` before merge.
5. Types are strict; the type checker passes with no errors before merge.
6. Tests gate the merge: TDD red→green→refactor; line coverage ≥ 80% on changed code, measured per changed file
   with `@vitest/coverage-v8`.
   Test tooling: Vitest (unit), Supertest (API), Testing Library (components).
   Detail: `02-DOCS/wiki/stack/testing.md`.

## 3. Conventions

7. Naming & structure: `server/src/modules/<module>/` and `client/src/<layer>/` as defined in the brief.
8. API & errors: All routes under `/api`. Error responses use consistent shape with generic messages to client;
   details in logs.
   Session: an opaque, unguessable session identifier in an httpOnly cookie (`SameSite=Lax`, `Secure` in
   production) that carries no account data; the server can revoke any session at any time. A session expires
   after 7 days without use when "Recordarme" was checked at login, and after 12 h without use otherwise.
   Detail: spec `server-sessions`, decision D10.
   *Superseded in v1.2.0: "auth via JWT in httpOnly cookie (1h expiry)".*
9. Commit messages: Semantic (`feat:`, `fix:`, `test:`, `docs:`…).

## 4. Branching & shipping

10. Work happens on a branch off `main`; merge via PR. Direct pushes to `main` are not allowed. Enforced twice:
    GitHub branch protection on `main` requires a pull request (admins included, no force push, no deletion), and
    rsc keeps `main` closed for the agent (`npx @ericrisco/rsc main status` → `closed: true`). Docs-only changes
    follow the same path.
    *Superseded in v1.3.0: the v1.2.0 text "`main` is open … direct pushes allowed after `verify`".*
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

- [ ] Linter clean where one exists — client oxlint (principle 4).
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
| 2026-11-03 | v1.1.0 | Principle 4 rewritten to the real tooling: oxlint in the client, no server linter yet (open debt), no Prettier, no pre-commit; check runs in `verify`. Principle 6: coverage measured per changed file with `@vitest/coverage-v8`. DoD updated. | `analyze` of error-codes (H3, H2): the old text asked for tools the repo never had, so no change could meet the DoD. Approved by Hernán ("aplicá todo"). Decision D8. |
| 2026-11-18 | v1.2.0 | Principle 8: session is an opaque, server-revocable identifier in an httpOnly cookie (7 days idle with "Recordarme", 12 h idle without), replacing "JWT in httpOnly cookie (1h expiry)". Principle 10: `main` is open, direct pushes allowed after `verify` (tier 2 also needs panel + human approval), replacing "branch + PR only". DoD updated. | Principle 8: approved spec `server-sessions`; since 5c every protected request already checks the account in the database, so a short JWT adds no revocation (decision D10). Principle 10: the text contradicted how the project works since 5b (direct pushes, `rsc main` open), found during this amendment (decision D11). Ratified by Hernán ("Ratifico tal cual"; principle 10: "Enmendarlo a main abierta"). |
| 2026-11-18 | v1.3.0 | Principle 10 back to branch + PR, tightened: GitHub protection on `main` requires a PR (admins included) and rsc keeps `main` closed for the agent; docs-only changes too. DoD restored. | Hernán: "Que el principio 10 vuelva a 'rama + PR'. Quiero que main esté protegida." Matches his global rule to protect `main` on GitHub. Decision D12 (reverses D11). |
