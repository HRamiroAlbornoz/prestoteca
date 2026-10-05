---
type: progress
title: Progress — Prestoteca MVP
slug: prestoteca-mvp
---

# Progress — Prestoteca MVP

> Append-only ledger. Each entry: task, status, red/green/triangulate/refactor evidence.
> A task marked `complete` here is DONE — never re-dispatch.

## T001 — 2026-10-04
- status: complete
- red: import failed (module not found) — `tests/env.test.ts` could not find `../src/modules/config/env`
- green: 8/8 tests pass — missing vars, invalid values, valid env parse, transform validation
- triangulation: PORT "not-a-number" → throws (NaN is not a valid number via `Number.isFinite`)
- files: server/package.json, server/tsconfig.json, server/vitest.config.ts, server/src/modules/config/env.ts, server/src/index.ts, server/tests/env.test.ts
- decision: Express 5 `@types/express` returns `Application` with different type — use `ReturnType<typeof express>` for the app type
- blocker: none
- commit: d0d29a8

## T002 — 2026-10-04
- status: complete
- red: health endpoint devolvía `{status:"ok", env:"..."}` sin propiedad `db` — test falló con `toHaveProperty "db"`
- green: 10/10 tests — pg pool con `checkDbConnection()`, health endpoint devuelve `{status:"ok", db:"connected"|"disconnected"}`
- triangulation: DB URL inválida → `disconnected` (pool connect throws)
- files: server/src/modules/db/pool.ts, server/src/index.ts, server/tests/health.test.ts
- decision: `createApp()` es ahora async porque necesita chequear DB connection antes de retornar el app
- blocker: none
- commit: f61804c

## T003 — 2026-10-04
- status: complete
- red: módulos middleware no existen — import falló con "Cannot find module"
- green: 18/18 tests — auth (401 sin token, 401 token inválido), rate-limit (429 after 5/min), origin (403 POST/PATCH/DELETE sin Origin, 200 GET sin Origin, 200 POST con Origin)
- triangulation: rate-limiter cleanup cada 30s, originChecker solo aplica a métodos mutating
- files: server/src/modules/middleware/auth.ts, server/src/modules/middleware/rateLimit.ts, server/src/modules/middleware/origin.ts, server/tests/middleware.test.ts
- decision: `verbatimModuleSyntax` requiere `import type` para Request/Response/NextFunction
- blocker: none
- commit: aa43a0a

## T004 — 2026-10-04
- status: complete
- red: archivos de migración no existen — ENOENT en readFileSync
- green: 23/23 tests — 3 migraciones SQL con tablas, FKs, índices; test verifica contenido SQL
- triangulation: SQL con un solo espacio entre columnas para que las assertions de substring coincidan
- files: server/src/migrations/001_create_users.sql, 002_create_tools.sql, 003_create_loans.sql, server/tests/migrations.test.ts
- decision: pg-migrate instalado como devDep; migraciones usan `IF NOT EXISTS` para ser idempotentes
- blocker: none
- commit: 5140bed
