---
type: verification
title: Verification — db-backups — 2026-10-24
description: Evidence-backed verdict for the FTD feature db-backups (daily Postgres backups to a Railway bucket).
tags: [sdd, verification, ftd]
timestamp: 2026-10-24T21:45:00Z
topic: sdd
slug: db-backups
source_state: 664ef2b (dirty — backup/, .gitignore and docs not committed yet)
---

# Verification — db-backups — 2026-10-24

FTD lane: the "spec" is `02-DOCS/wiki/ftd/db-backups.md` (Intent + Scope) and the done-checks are its Checklist.
All numbers below come from one fresh run after the last code edit.

## Stack gate

Configured commands (`02-DOCS/wiki/sdd/config.yaml` → `testing.commands.verify`), plus the new `backup/` subproject:

- `cd backup && npm test` → PASS (`Test Files 4 passed (4)`, `Tests 35 passed (35)`)
- `oxlint backup/src backup/tests` → PASS (exit 0)
- `cd backup && npm audit --omit=dev` → PASS (`found 0 vulnerabilities`)
- `cd server && npm test` → PASS (`Test Files 26 passed (26)`, `Tests 233 passed (233)`)
- `cd client && npm test` → FAIL (`Tests 4 failed | 144 passed (148)`): the 4 `requestLoan.test.tsx`
  tests with fixed dates. They fail the same way on `main` (baseline recorded in `railway-deploy.md` T4
  and in the backlog). Not caused by this change, which does not touch `client/`.
- `npm run build` (root) → PASS (`tsc -b` without errors)

## Task done-checks (FTD checklist)

- [x] T1 branch `feat/db-backups` — `Switched to a new branch 'feat/db-backups'`
- [x] T2 pure logic red → green — red: `4 failed (4)`; green: `35 passed`
- [x] T3 full flow with fakes (no delete on dump/verify/upload failure, own keys only) — `runBackup.test.mjs` 9 tests green
- [x] T4 Dockerfile + README — staging build `SUCCESS`, log `pg_dump (PostgreSQL) 18.6`
- [x] T5 staging bucket + service + references — run log `backup finished`; bucket listed from outside: `objects=1, 9768 bytes`
- [x] T6 retention `BACKUP_KEEP=2` — logs show one deletion per run; bucket `objects=2`
- [x] T7 restore in staging — `source {"users":10,"tools":3,"loans":3}` = `restored`, `restore check passed`, `scratch database dropped`
- [x] T8 no regressions — see the stack gate above (client: same 4 baseline failures)
- [ ] T9 PR merged — pending (Hernán runs commit/push/PR)
- [ ] T10 production — pending, after the merge

## Acceptance (Intent of the FTD doc)

- [x] Daily copy at 06:00 UTC — staging service has `cronSchedule "0 6 * * *"` (`railway cron list` → `next run in 8 hours`). The schedule itself has not fired yet: observed runs were manual triggers.
- [x] Keeps the last 14 — retention proven with `BACKUP_KEEP=2`; production value `14` confirmed in the run log (`keep 14`).
- [x] DB not exposed to the internet — `DATABASE_URL` host `postgres.railway.internal`; no TCP proxy on Postgres.
- [x] A backup restores — T7.
- [ ] Production has backups — UNVERIFIED until T10.

## Capas no ejecutadas

- **HERRAMIENTA-AUSENTE** — coverage: `@vitest/coverage-v8` is not installed in `backup/`, so the constitution's
  floor (principle 6: ≥ 80% line coverage on changed code) **was not measured at all**. Expected to be below 80%:
  `storage.mjs`, `main.mjs`, `restoreCheck.mjs` and `runCommand`/`dumpDatabase`/`verifyDump` in `postgres.mjs`
  have no unit tests. They were exercised only at runtime in staging (T5–T7).
- **SUSTITUIDA** — formatting/lint: the constitution (principle 4) names Prettier + ESLint; the project actually runs
  `oxlint` (`client/.oxlintrc.json`) and has no formatter. `oxlint` ran with default rules from the repo root;
  it cannot detect formatting drift. This drift predates the feature.
- **NO-APLICA** — browser/UI runtime: the change has no UI.

## Hallazgos descartados

- ninguno

## Verdict: FAIL — 1 open item that this change owns (coverage floor not measured, and likely not met), plus
T9/T10 pending by design. The 4 client failures are pre-existing baseline, not introduced here.
Next: install `@vitest/coverage-v8`, measure, and add unit tests for `storage.mjs` and `postgres.mjs` until changed code is ≥ 80%.
