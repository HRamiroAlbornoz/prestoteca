---
type: progress
title: error-codes — avance de implement
description: Registro append-only de cada tarea de error-codes (rojo/verde, riesgo, revisión, controles).
tags: [sdd, progress, errors]
timestamp: 2026-11-03T17:40:00Z
topic: sdd
slug: error-codes
---

# error-codes — avance de implement

> [Plan y tareas](../plans/error-codes.md) · rama `feat/error-codes-server` (T017, T001-T007).
> Append-only: una corrección es una entrada nueva, nunca se reescribe una vieja.

## Decision queue

(vacía)

## T017 — 2026-11-03
- status: complete (commit `16e76de`)
- what: `@vitest/coverage-v8@5.1.0` instalado por Hernán en `server` y `client`; línea base en
  [error-codes-coverage-baseline.md](../verifications/error-codes-coverage-baseline.md)
- files: client/package.json, server/package.json, package-lock.json, .gitignore, 02-DOCS (línea base, índice)
- risk: tier 1 — revisión hecha por el orquestador (11 paquetes nuevos, todos de registry.npmjs.org; 0 vulnerabilidades)
- controls: tests ✅ (server 268/268, client 181/181) · build no aplica (sin código) · security ✅ (`npm audit` 0) · traceability ✅ (constitución 6)
- note: el umbral global de ramas del server (80 %) ya fallaba antes (77,27 %): punto de partida, no defecto

## Pilot — 2026-11-03
- status: complete — Orca → OpenCode → Qwen3.6 35B A3B local funciona; Qwen creó solo el archivo permitido
- found: el worktree nuevo no trae `node_modules` → `orca.yaml` con `npm ci` y `wait-for-setup` (commit `62601fc`),
  sin probar todavía (se verifica en el worktree de T005); OpenCode avisó "Shell cwd was reset to E:\Trabajo\prestoteca"
  → los briefs exigen `cd <ruta del worktree> &&` en cada comando y se revisa que la carpeta principal siga limpia

## T001 — 2026-11-03
- status: complete
- red: `cd server && npx vitest run tests/errorCodes.test.ts` falla con
  `Cannot find module '../src/modules/errors/errorCodes.js'` (lo que pide el done-check)
- files: server/tests/errorCodes.test.ts
- risk: tier 1 — 1 revisor de contexto fresco
- review: 3 reportados → 3 únicos → 0 bloqueantes (3 nits, todos arreglados en la ronda 1: log asertado,
  `sendErrorCode` recorre todo el catálogo, la guardia "sin imports" también ve re-exports e `import()`)
- controls: tests ✅ (rojo esperado) · build ✅ (server `tsconfig` excluye tests; sin cambio en `src`) · security no aplica (solo tests) · traceability ✅ (AC-6, AC-7)
- note: el rojo es por import, no por aserción (el done-check aprobado lo pide así); T002 crea primero los
  módulos con stubs para ver el rojo por aserción antes del verde

## T002 — 2026-11-10
- status: complete
- red: con stubs (`ERROR_CODES = {}`, `sendErrorCode`/`apiNotFound` vacías) → 117 de 121 fallan por aserción
  (`expected +0 to be 404`, `expected 'TOOL_NOT_OWNER' to be 403`), no por import
- green: `cd server && npx vitest run tests/errorCodes.test.ts` → 121/121; suite completa del server 28 archivos, 389/389, sin tocar tests viejos
- files: server/src/modules/errors/errorCodes.ts (nuevo), server/src/modules/errors/AppError.ts
- risk: tier 1 — 1 revisor de contexto fresco
- review: 0 hallazgos, VERDICT pass (ronda 1)
- controls: tests ✅ · build ✅ (`tsc -b`, `npm run build`) · security ✅ (un error no previsto sigue respondiendo solo `INTERNAL_ERROR`; el detalle va al log) · traceability ✅ (AC-6, AC-7)
- coverage: errorCodes.ts 100 % líneas · AppError.ts 90 % líneas
- note: los genéricos `UNAUTHORIZED`/`FORBIDDEN`/`NOT_FOUND`/`CONFLICT` quedan en el catálogo, marcados como temporales; T009 los borra

## T003 — 2026-11-10
- status: complete — aprobada por Hernán (tier 2)
- red: 17 aserciones fallan por el código viejo (`UNAUTHORIZED`, `TOO_MANY_REQUESTS`) y por el 404 HTML de `/api/nope`
- green: suite del server 28 archivos, 394/394; `tsc -b` y `npm run build` limpios
- files: server/src/index.ts, server/src/modules/middleware/{auth,origin,rateLimit}.ts; tests middleware, originWiring,
  rateLimitIsolation, securityAc, errors, authRoutes
- risk: tier 2 (auth: `jwt.verify`) — 3 refuters + aprobación humana
- review: ronda 1: 3 refuters → 3 nits (stub viejo y test SPA débil arreglados; OPTIONS 200→404 arreglado por elección
  de Hernán); ronda 2 (correctness, solo el diff nuevo): pass, 2 nits aceptados → decisión D9
- controls: tests ✅ · build ✅ · security ✅ (refuter-security pass: sin oráculo de rutas, límites y origen antes del 404) · traceability ✅ (AC-5b, AC-6 filas 8 y 35, AC-8)
- coverage: index.ts 85,71 % · auth.ts 100 % · origin.ts 100 % · rateLimit.ts 83,87 %
- note: el test "token inválido" de middleware.test.ts probaba "sin token" (la mini-app no lee cookies); ahora usa el header

## T004 — 2026-11-10
- status: complete — aprobada por Hernán (tier 2)
- red: 14 aserciones fallan por el código viejo (`BAD_REQUEST`, `UNAUTHORIZED`, `ConflictError`)
- green: suite del server 29 archivos, 414/414 (junto con T005); `tsc -b` y `npm run build` limpios
- files: server/src/modules/auth/{authRoutes,authService,userRepo}.ts; tests authRoutes, authService, authValidation, errors
- risk: tier 2 (auth) — 3 refuters + aprobación humana
- review: ronda 1: security pass (sin enumeración de emails: mismo `if`, mismo cuerpo, bcrypt siempre); correctness y
  tests pass con 3 nits (bordes aceptados de los límites sin test; "faltan datos" con un solo caso) → arreglados
  (5 casos de borde aceptados, 5 casos de un campo faltante). Mutantes del diff: 18/18 detectados
- controls: tests ✅ · build ✅ · security ✅ · traceability ✅ (AC-6 filas 1-7, AC-12)
- coverage: authRoutes.ts 100 % · authService.ts 100 % · userRepo.ts 90 %
- backlog: email/contraseña no string → 500 (preexistente, fuera de alcance)

## T005 — 2026-11-10
- status: complete — aprobada por Hernán (tier 2). Implementada por Qwen (OpenCode vía Orca, worktree `t005-me`), revisada por Claude
- red: 11 tests fallan por los códigos viejos (reporte de Qwen)
- green: 24/24 en los tests de `me`; con T004 en la carpeta principal, 29 archivos, 418/418; `tsc -b` limpio
- files: server/src/modules/me/{meRoutes,meAccountRoutes,accountDeletion}.ts; tests meAccountRoutes, accountDeletion, meRoutes (nuevo)
- risk: tier 2 (`bcrypt.compare` en meAccountRoutes; el pronóstico decía 1) — 3 refuters + aprobación humana
- review de Claude antes de los refuters: el test D7 no distinguía `findById` de `findActiveById` y dos tests de
  `deleteAccount` se aflojaron a `toBeInstanceOf(AppError)` → devueltos a Qwen y arreglados; prueba del mutante
  `findById` repetida por Claude: el test falla con 401
- review refuters: security pass; correctness pass (2 nits); tests: 1 should-fix (títulos con nombres de subclases) + 3 nits
  → todos arreglados por Claude en la carpeta principal (solo tests); los mutantes que sobrevivían ahora mueren
- controls: tests ✅ · build ✅ · security ✅ (el 404 de cuenta eliminada solo lo ve quien tiene ese token) · traceability ✅ (AC-6 filas 8 y 11-16, excepción D7)
- coverage: accountDeletion.ts 100 % · meAccountRoutes.ts 88,88 % · meRoutes.ts 90,9 %
- backlog: carrera borrar cuenta / cambiar contraseña (`updatePassword` y `findByEmail` sin `deleted_at`), preexistente
