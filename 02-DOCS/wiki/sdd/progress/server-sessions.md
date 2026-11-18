---
type: progress
title: server-sessions — avance de implement
description: Registro append-only de cada tarea de server-sessions (rojo/verde, riesgo, revisión, controles).
tags: [sdd, progress, auth, session]
timestamp: 2026-11-18T23:59:00Z
topic: sdd
slug: server-sessions
---

# server-sessions — avance de implement

> Plan: [../plans/server-sessions.md](../plans/server-sessions.md) · Spec: [../specs/server-sessions.md](../specs/server-sessions.md)
> Rama del PR 1: `feat/server-sessions-server` (sale de `main` en `1fbd2d0`).

## Decision queue

(vacía)

## T001 — 2026-11-18

- status: complete (pendiente: commit de Hernán y aprobación de tier 2)
- quién: Qwen (Orca, dispatch `ctx_f4c245af01e6`, worktree `t001-migration`), una ronda, con `worker_done`; brief
  revisado dos veces antes de lanzarlo; Claude agregó dos aserciones en la ronda 2 de revisión.
- red: `npx vitest run tests/migrations.test.ts` → `9 failed | 6 passed (15)`, todas `ENOENT` (reportado por Qwen;
  el brief lo había probado en una copia antes de lanzarlo).
- green: `16 passed (16)` tras la ronda 2; suite del server `34 files, 686 passed`; `tsc -b` exit 0.
- verificación de Claude: SQL y bloque de pruebas idénticos al brief letra por letra; líneas 1-54 del archivo de
  pruebas intactas; `git diff --numstat` `52 0` en la entrega; mutantes M1 y M3 re-corridos (cada uno
  `1 failed | 14 passed`), M10 `remote_addr INET` y M11 `ON DELETE SET NULL` para las aserciones nuevas; `cmp` limpio.
- files: `server/src/migrations/005_create_sessions.sql` (nuevo), `server/tests/migrations.test.ts`; además
  `branch: feat/server-sessions-server` en la spec (lo exigió `rsc risk`; `spec gate` PASS).
- risk: tier 2 (migrations) — 3 refutadores en la ronda 1; ronda 2 tier 1 (solo pruebas), 1 revisor.
- review: ronda 1 → 0 blocker, 0 should-fix; 2 nits (L74 lista de dispositivo por nombre, L75 `ON DELETE` no fijado)
  → fixed en la ronda 2; 2 preguntas → L76 SQL no ejecutada en las pruebas: intentional (T009 la corre en staging con
  `ON_ERROR_STOP`), L77 `sessions` fuera del chequeo de restauración del backup: intentional, al backlog (ítem 9).
  Ronda 2 → 2 nits (L78 `ALTER TABLE` no leído, L79 dos columnas en una línea): intentional (las migraciones del repo
  van una columna por línea y no mezclan `ALTER` en un `CREATE`); comentario de la prueba ajustado para no prometer
  más.
- controls: tests ✅ build ✅ (`tsc -b`) security ✅ (refutador sin hallazgos) traceability ✅ (AC-33, AC-35).
- decision: ninguna nueva; tier 2 → aprobación de Hernán antes del push.
