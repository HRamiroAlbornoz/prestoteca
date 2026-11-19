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

## T002 — 2026-11-18

- status: complete (pendiente: commit de Hernán y aprobación de tier 2)
- quién: Qwen (Orca, dispatch `ctx_beb2c2d974ab`, worktree `t002-session-token`), una ronda, con `worker_done`
  (resumió en vez de pegar las salidas textuales; Claude re-corrió todo). Brief probado en seco antes de lanzarlo.
  Claude agregó dos pruebas en la ronda 2 de revisión.
- red: `npx vitest run tests/sessionToken.test.ts` → `18 failed | 9 passed (27)` con los stubs (prueba en seco).
- green: `27 passed (27)`; tras la ronda 2 `29 passed (29)`; suite del server `34 files, 710 passed`; `tsc -b`
  exit 0 (worktree y checkout principal).
- verificación de Claude: los dos archivos de Qwen idénticos letra por letra a la prueba en seco; mutantes M1-M9
  con el resumen exacto del brief; M10 (sin `typeof`) y M11 (regex sin `-`/`_`) caen con las pruebas nuevas
  (`1 failed | 28 passed` cada uno); `cmp` limpio; las únicas líneas quitadas son los 3 imports.
- files: `server/src/modules/auth/sessionToken.ts`, `server/tests/sessionToken.test.ts`.
- risk: tier 2 (auth) — 3 refutadores en la ronda 1; ronda 2 tier 1 (solo pruebas), 1 revisor.
- review: ronda 1 → seguridad APPROVE (0 hallazgos), corrección APPROVE (L80, L81 nits), pruebas APPROVE WITH NITS
  (L82, L83 should-fix, L84 nit). L82 `typeof` sin probar (`j:["<válido>"]` pasaba como `ok`): fixed. L83 `-`/`_`
  probados solo al azar: fixed con un valor fijo. L80 la comparación `>` se prueba en la SQL de T003: intentional.
  L81 `req.cookies?.` da `none` sin `cookie-parser` (montado en `src/index.ts`): intentional. L84 entropía sin
  probar (repetiría el código): intentional. Ronda 2 → APPROVE, 0 hallazgos.
- para T004 (notas del refutador de seguridad): `malformed` nunca llega al repositorio; el `setSessionCookie` nuevo
  reusa `sessionCookieAttributes()` (riesgo R2) para que crear y borrar no se desfasen.
- controls: tests ✅ build ✅ (`tsc -b`) security ✅ (refutador sin hallazgos) traceability ✅ (AC-1, AC-2, AC-10,
  AC-14, AC-23, AC-35).
- decision: ninguna nueva; tier 2 → aprobación de Hernán antes del push.

## T003 — 2026-11-19

- status: complete (pendiente: commit de Hernán y aprobación de tier 2)
- quién: Qwen (Orca, dispatch `ctx_c0330581b471`, worktree `t003-session-repo`). Se le llenó el contexto en el
  mutante M3 (7 reintentos, ~30 min) y paró sin `worker_done`; con un mensaje corto retomó M3-M17 y lo mandó
  (otra vez resumido, números iguales a los de Claude). El plan describía la SQL pero no la traía escrita: Claude la
  escribió (§0, §3.2) y la probó en seco antes del brief. Rondas 2 y 3 de arreglos: Claude, por decisión de Hernán.
- red: con stubs `22 failed | 29 passed (51)` (prueba en seco del brief y Qwen).
- green: `51 passed (51)`; tras las rondas `53 passed (53)` en `sessionRepo.test.ts` + `userRepo.test.ts`; suite del
  server `35 files, 739 passed`; `tsc -b` exit 0 (worktree y checkout principal). `sessionRepo.test.ts` además pasa
  `tsc` con un tsconfig temporal que incluye la prueba (0 errores; los de `userRepo.test.ts` son líneas viejas, 5b(d)).
- verificación de Claude: los 4 archivos de Qwen idénticos letra por letra a la prueba en seco; 30 mutantes en una
  copia (17 del brief, `OR true` ×3, chequeo de `deleteOthers` ×10), cada uno `1 failed` (o 2) y `cmp` limpio.
- files: `server/src/modules/auth/sessionRepo.ts` (nuevo), `server/src/modules/auth/userRepo.ts`,
  `server/tests/sessionRepo.test.ts` (nuevo), `server/tests/userRepo.test.ts`.
- risk: tier 2 (auth). Ronda 1 → 3 refutadores; ronda 2 tier 2 (cambió `sessionRepo.ts`) → 3; ronda 3 tier 1 (solo
  pruebas) → 1.
- review: ronda 1 → corrección APPROVE (L85 `token_hash` repetido lanza 23505, intentional: T004 lo trata como 500;
  L86 el `EXISTS` de `deleted_at` no bloquea, intentional: el borrado se lleva la sesión), seguridad APPROVE WITH NITS
  (L87 `deleteOthers` con `undefined`/`''`: fixed con un chequeo `/^[0-9a-f]{64}$/` que aprobó Hernán; L88 `FOR SHARE`
  solo como texto: intentional, staging T009), pruebas REQUEST CHANGES (L89 `touchActive` por pedazos, `OR true`
  sobrevivía: fixed con `toBe(oneLine(sql))`; L91 lo mismo en `createIfPasswordCurrent`: fixed; L90 prueba AC-35
  repetida: intentional, deja el id). Ronda 2 → seguridad APPROVE, corrección APPROVE (L92 las pruebas de T004 con el
  repo real necesitan hashes de 64 hex: intentional, va al brief de T004), pruebas REQUEST CHANGES (L93 el chequeo solo
  probado al rechazar, 5 mutantes de la regla sobrevivían, uno sin dígitos rompía casi todo hash real: fixed).
  Ronda 3 (última) → APPROVE WITH NITS (L94 salto de línea final, L95 arreglo de un elemento): fixed y registrados
  (fix-and-record), con los mutantes N1 y N2 cayendo.
- para T004: generar un valor nuevo en cada login; `updatePassword` y `deleteOthers` en la misma transacción con un 401
  si falta `sessionTokenHash`, y el error del chequeo cuenta como fallo; `deleteAllForUser` dentro de la transacción de
  borrado; cookie ausente o mal formada rechazada antes del hash; pruebas con hashes de 64 hex (`'a'.repeat(64)`).
- para T009 (staging): login cruzado con un cambio de contraseña y purga en el borde exacto del plazo.
- para los briefs: este tenía ~30 000 caracteres (pruebas pegadas enteras) y le llenó el contexto a Qwen; para T004
  conviene que lea los bloques desde archivos y que los mutantes vayan en una tarea aparte.
- controls: tests ✅ build ✅ (`tsc -b`) security ✅ (dos APPROVE de seguridad) traceability ✅ (AC-3, AC-7, AC-8,
  AC-15, AC-33, AC-35, AC-36, AC-37).
- decision: ninguna nueva; tier 2 → aprobación de Hernán antes del push.

## T004 — 2026-11-19

- status: complete (pendiente: commit de Hernán y aprobación de tier 2)
- quién: Claude, según el plan. Plan de trabajo revisado dos veces por agentes sin contexto antes del código
  (ronda 1: 8 correcciones + 9 menores; ronda 2: 7 + 4), aprobado por Hernán (v3 en el scratchpad de la sesión).
- red: con las pruebas nuevas y el código viejo, `75 failed` en 10 archivos.
- green: suite del server `35 files, 778 passed`; `tsc -b` exit 0.
- done-check: `grep -rn "signSessionToken\|passwordFingerprint\|pwf" server/src`, `grep -rn "clearCookie('token')"
  server/src` y `grep -rn jsonwebtoken server/src server/tests` vacíos (este último adelanta parte de T006); cada id de la
  columna Trace (AC-4, 5, 6, 8, 9, 10, 12, 13, 16, 17, 19, 21, 22, 24 a 30, 33, 34) está en el nombre de una prueba de
  los archivos que toca T004.
- cobertura (líneas/ramas): `authRoutes`, `authService`, `sessionToken`, `middleware/auth`, `routes` 100/100;
  `meAccountRoutes` 98,6/100; `accountDeletion` 100/83,3; `index.ts` 85,7/80 (solo cambió un comentario).
- mutantes: 16 de Claude (renovar siempre, `null` aceptado, sin `throw` en sesión vieja, sin anular la cookie entrante,
  borrar la cookie si cae la base, `Max-Age` siempre, valor crudo al repo, `deleteOthers` fuera de la transacción, sin
  `deleteAllForUser`, logout que borra la cookie con error, registro con `remember`, sin guardia de hash ×2, carrera del
  login como 500, `remember` ignorado) + 29 del refutador de pruebas: todos caen salvo 2 equivalentes (`maxAge + 1` ms
  redondea igual; `req.userId ??`) y n1 (ver review). `src` restaurado y comparado con la copia cada vez.
- tipos de las pruebas (`tsc -b` no las incluye, 5b(d)): con un tsconfig temporal, los 12 errores nuevos de T004
  arreglados; quedan 14, todos en líneas viejas.
- files: `server/src/modules/auth/{sessionToken,authService,authRoutes}.ts`, `server/src/modules/middleware/auth.ts`,
  `server/src/modules/me/{meAccountRoutes,accountDeletion}.ts`, `server/src/routes.ts`, `server/src/index.ts`
  (comentario); pruebas `middleware`, `authService`, `authRoutes`, `authValidation`, `meAccountRoutes`, `meRoutes`,
  `accountDeletion`, `sessionToken`, `sessionWiring`, `errors` y el ayudante nuevo `server/tests/fakeTransaction.ts`.
- risk: tier 2 (auth). Ronda 1 → 3 refutadores; ronda 2 tier 1 (solo pruebas) → 1 revisor.
- review: ronda 1 → seguridad APPROVE (0 hallazgos); corrección APPROVE WITH NITS (el registro con la base caída
  después del `INSERT` deja la cuenta sin sesión: intentional, riesgo R7 aceptado en el plan); pruebas APPROVE WITH NITS
  (n1 should-fix: si falla la anulación de la sesión entrante, ninguna prueba fijaba 500 + ROLLBACK + sin cookie;
  `.catch(() => undefined)` sobrevivía → fixed con dos pruebas, AC-28 y AC-34, el mutante cae con `2 failed`; nit la
  prueba del 429 solo fija el orden límite → ruta: intentional, comentario agregado; nit el 401 en el otro dispositivo
  se prueba con repos simulados: intentional, la SQL la fija T003 y T007/T009 lo prueban de punta a punta). Ronda 2 →
  APPROVE WITH NITS (el título "no new session" sin aserción: fixed, se afirma que la sesión nueva se creó con el
  cliente de la transacción deshecha).
- desvíos: dos archivos de pruebas se recortaron con un script en vez de Edit (contra la regla de Hernán); verificado con
  suite y diff. Ayudante `fakeTransaction.ts` no nombrado en el plan, para no repetir el cliente falso en cuatro archivos.
- para T006: `env.ts`, `env.test.ts`, `.env.example` y `package.json` siguen con lo del JWT; las pruebas ya no lo usan.
- para T009: el registro que falla después de crear la cuenta (R7) no se puede forzar en staging; no hace falta.
- anotado, fuera de alcance: un pedido que no es GET a una ruta inexistente de `/api/tools` pasa dos veces por el
  middleware (dos `touchActive`); ya pasaba antes con `findActiveById`.
- controls: tests ✅ build ✅ (`tsc -b`) security ✅ (refutador APPROVE sin hallazgos) traceability ✅ (columna Trace
  de T004 completa).
- decision: ninguna nueva; tier 2 → aprobación de Hernán antes del push.
