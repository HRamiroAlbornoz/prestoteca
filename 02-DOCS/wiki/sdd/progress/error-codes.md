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
