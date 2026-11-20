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

## T005 — 2026-11-19

- status: complete (pendiente: commit de Hernán y aprobación de tier 2)
- quién: Qwen (Orca, dispatch `ctx_302e4981248b`, worktree `t005-session-purge`), una ronda, con `worker_done`
  (resumió en vez de pegar las salidas; Claude re-corrió todo). Claude escribió el código y las pruebas, los probó en
  seco y los dejó en `prestoteca-briefs/T005-files/`; Qwen los copió con `cp` e hizo a mano el cambio de `index.ts`
  (brief de ~5 600 caracteres, contra ~30 000 del de T003). Brief revisado por un agente sin contexto antes del
  lanzamiento (2 should-fix: orden de `restoreAllMocks`/`useRealTimers`, `grep` sin líneas en blanco + `--numstat`;
  nit `intervalMs` sin probar: prueba agregada).
- red: con el stub `8 failed (8)`.
- green: `8 passed (8)`; tras la ronda 2 `9 passed (9)`; suite del server `36 files, 788 passed` (incluye un caso
  automático nuevo de `errorGuard.test.ts`, que recorre cada archivo de `src/`); `tsc -b` exit 0.
- verificación de Claude: los dos archivos de Qwen idénticos (`cmp`) a la prueba en seco; diff de `index.ts` = 4
  líneas exactas, `--numstat` `3 1`; mutantes re-corridos en el worktree (sin `catch`, `intervalMs` ignorado).
- cobertura: `sessionPurge.ts` 100/100; `index.ts` 30/36 = 83,3 % (antes 24/28 = 85,7 %). Lectura del plan §6 paso 5
  ("una sola línea"): una sola línea **sin cubrir**, `startSessionPurge(getPool())`; los dos imports corren en las
  pruebas.
- mutantes: 9 de la prueba en seco (sin primera corrida, sin `catch`, sin `unref`, `stop` vacío, intervalo +1 ms, log
  con 0, cortes calculados una vez al arrancar, `intervalMs` ignorado) + 4 del refutador de pruebas + 2 de la ronda 2;
  todos caen.
- files: `server/src/modules/auth/sessionPurge.ts` (nuevo), `server/tests/sessionPurge.test.ts` (nuevo),
  `server/src/index.ts` (una llamada + su import).
- risk: tier 2 (auth). Ronda 1 → 3 refutadores; ronda 2 tier 1 (solo pruebas) → 1 revisor.
- review: ronda 1 → seguridad APPROVE (nit: dos purgas se solapan si una tarda más que el intervalo: intentional, el
  `DELETE` es idempotente y una purga de 1 h no es realista con este volumen); corrección APPROVE (0 hallazgos, misma
  nota); pruebas APPROVE WITH NITS (`removed > 1` sobrevivía porque la prueba del log usaba 3 y 0: fixed, usa 1;
  el pool recibido nunca llegaba a una aserción, `new SessionRepository({} as Pool)` sobrevivía: fixed con una prueba
  que pasa un pool falso con `query` y afirma el `DELETE` y los dos cortes como parámetros). Ronda 2 → APPROVE, 0
  hallazgos (10 mutantes propios, todos caen, incluidos `removed > 1`, `removed >= 0` y otro pool).
- incidente: la copia de respaldo de un mutante apuntaba a una carpeta del scratchpad que ya no existía; dos mutantes
  quedaron aplicados en el checkout. Se restauró `sessionPurge.ts` desde `T005-files/sessionPurge.real.ts` (comprobado
  igual a la copia de Qwen con `cmp`) y se repitió el mutante. Lección: comprobar que el respaldo existe antes de mutar.
- para T009: la purga en staging se prueba reiniciando el servicio (corre al arrancar).
- controls: tests ✅ build ✅ (`tsc -b`) security ✅ (refutador APPROVE) traceability ✅ (AC-37).
- decision: ninguna nueva; tier 2 → aprobación de Hernán antes del push.

## T006 — 2026-11-19

- status: complete (pendiente: commit de Hernán y aprobación de tier 2)
- quién: Qwen (Orca, dispatch `ctx_cd474be40080`, worktree `t006-jwt-env`), una ronda, con `worker_done` (resumió en
  vez de pegar las salidas; Claude re-corrió todo). Claude escribió los 7 archivos, los probó en seco y los dejó en
  `prestoteca-briefs/T006-files/`; Qwen solo los copió. Brief revisado por dos agentes sin contexto antes del
  lanzamiento (ronda 1: 1 should-fix, el `grep` de `jsonwebtoken` faltaba, y 3 nits, entre ellos la aserción sobre
  `envSchema.shape`; ronda 2: 0 cambios al brief).
- uninstall (Hernán): `npm uninstall jsonwebtoken @types/jsonwebtoken --workspace server` desde la raíz (el lockfile
  vive ahí, workspaces). Sin `--workspace` no hace nada ("up to date"); desde la terminal UCRT64 npm 11.20 falla con
  `Cannot read properties of null (reading 'location')` porque recibe la unidad en minúscula (`e:\`); reproducido con
  `--dry-run` (`e:` falla, `E:` quita 16 paquetes). `server/package.json` −2 líneas, `package-lock.json` −152.
- red: con las pruebas nuevas y el `env.ts` viejo, `4 failed | 4 passed (8)`.
- green: `8 passed (8)`; suite del server `36 files, 788 passed` (sin cambio de cantidad: 2 pruebas fuera, 2 nuevas);
  `tsc -b` exit 0, en el worktree y en el checkout principal con el uninstall aplicado.
- verificación de Claude: los 7 archivos de Qwen idénticos (`cmp`) a la prueba en seco; `--numstat` igual al brief.
- done-check: `grep -rn jsonwebtoken server/src server/tests server/package.json` vacío (exit 1); `env.test.ts`
  reescrito verde; `JWT_SECRET` fuera de `server/.env.example`; la variable **sigue** en Railway (sin tocar).
- mutantes: 4 de Claude (`JWT_SECRET` opcional y leída, `JWT_EXPIRES_IN` con default, `JWT_SECRET` `min(32)`,
  `JWT_SECRET` solo en el esquema) + 5 del refutador de pruebas (`looseObject`, `strictObject`, `JWT_EXPIRES_IN` con
  regex, sin default de `CORS_ORIGIN`, `prefault` → `default`): todos caen. Equivalente conocido: `'JWT_SECRET'` solo
  en la lista de claves (zod la descarta).
- files: `server/src/modules/config/env.ts`, `server/.env.example`, `server/package.json`, `package-lock.json`;
  pruebas `env`, `errors`, `health`, `originWiring`, `sessionWiring` (fuera los `vi.hoisted` que solo ponían
  `JWT_SECRET`).
- risk: tier 2 (clase `secrets` por `server/.env.example`) — 3 refutadores, una ronda.
- review: corrección APPROVE (0 hallazgos; lockfile sin dependencias colgadas, `npm ls` limpio); seguridad APPROVE
  (nit: nada dice cuándo borrar `JWT_SECRET` de Railway: intentional, el plan §0 lo fija — se conserva hasta que el
  PR 2 lleve una semana estable en producción; queda como pendiente después del PR 2); pruebas APPROVE WITH NITS
  (las pruebas de cableado ya no tocan `JWT_SECRET`: intentional, `env.test.ts` la borra a propósito; ninguna prueba
  arranca `createApp` con una `JWT_SECRET` corta sobrante: va a T007, barrido en la app real).
- para T007: un caso que arranque la app real con `JWT_SECRET='short'` en el entorno (como Railway) y responda.
- después del PR 2 (+1 semana estable): borrar `JWT_SECRET` de Railway en los dos entornos.
- controls: tests ✅ build ✅ (`tsc -b`) security ✅ (refutador APPROVE) traceability ✅ (AC-10).
- decision: ninguna nueva; tier 2 → aprobación de Hernán antes del push.

## T007 — 2026-11-19

- status: complete (pendiente: commit de Hernán)
- quién: Qwen (Orca, dispatch `ctx_332a0b99eef9`, worktree `t007-real-app-sweep`), una ronda, con `worker_done`
  (resumió otra vez, y contó "31 criterios" en vez de 32; Claude re-corrió todo). Claude escribió la prueba, la probó en
  seco y la dejó en `prestoteca-briefs/T007-files/`; Qwen solo la copió. Brief revisado por dos agentes sin contexto
  antes del lanzamiento, con Hernán viendo los hallazgos antes de lanzar.
- hallazgo previo: todos los ids ya aparecían en `server/tests` (el `grep` del done-check pasaba antes de empezar), pero
  23 criterios del server no pasaban por la app real (`createApp`). `middleware.test.ts` define un `createApp` **local**:
  las pruebas de la app real son las que importan `../src/index.js`.
- archivo: `server/tests/serverSessions.test.ts` (nuevo, solo pruebas; no toca `src`). 25 pruebas, 20 criterios por la
  app real: AC-1, 2, 4, 5, 8, 10, 12, 14, 17, 21 a 26, 28, 29, 30, 34, 35. Patrón de `sessionWiring.test.ts` (espías en
  los prototipos de los repositorios, pool falso con `fakeTransaction`).
- quedan a nivel SQL/unidad + staging (T009), porque no hay Postgres local: AC-3, AC-7, AC-15, AC-36, AC-37 (la purga
  arranca en el bloque `listen` de `index.ts`, fuera de `createApp`). Confirmado por los dos revisores del brief.
- red: no aplica (la tarea solo agrega pruebas sobre código ya hecho); la evidencia son los mutantes.
- green: `25 passed (25)`; suite del server `37 files, 813 passed` (788 + 25); `tsc -b` exit 0; la prueba pasa `tsc` con
  un tsconfig temporal que la incluye (0 errores).
- done-check: `npx vitest run tests/serverSessions.test.ts` verde; para cada id de AC-1 a AC-10, AC-12 a AC-17, AC-19,
  AC-21 a AC-30, AC-33 a AC-37, `grep -rqE "AC-<n>\b" server/tests` encuentra al menos un archivo ("sweep done").
- mutantes (en `src`, restaurado con `git restore` cada vez): 19 de Claude, todos caen — sin renovar "Recordarme",
  `remember` ignorado, registro con 7 días, "Salir" borra la cookie antes de borrar la sesión, sesión vieja borrada
  fuera de la transacción, cookie nunca `Secure`, plazos corridos 1 ms, `JWT_SECRET` exigida de nuevo, `remember: "yes"`
  aceptado, "Salir" no borra nada, la sesión vieja nunca se borra, sin borrar la cookie con sesión nula, valor de token
  fijo, contraseña vieja ignorada, middleware que acepta todo, sin límite de `/api/auth`, `Path=/api`, `j:{}` a la base,
  sesión creada con `new Date(0)`. Dos mutantes de Claude estaban mal armados (sin efecto visible) y se rearmaron.
  Revisores: 24 + 23 + 4 mutantes propios.
- revisión del brief: ronda 1 → `Path=/` débil (`Path=/api` pasaba **toda** la suite): fixed con `/; Path=\/(;|$)/`;
  `j:{}` nunca por la app real: fixed; caso "anulada o vencida" en AC-12 y "la cookie no lleva datos de la cuenta" en
  AC-14: fixed; dos frases del brief. Ronda 2 → sin el límite de `/api/auth` en `index.ts` pasaba **toda** la suite (el
  429 de AC-28 solo se probaba en una app armada a mano): fixed con una prueba en la app real; `not.toContain('ana')`
  fallaba por azar ~1 de cada 6 400 corridas: fixed (email completo + regex de 43 caracteres); comentario en la prueba de
  T006.
- risk: tier 1 (solo pruebas) → 1 revisor.
- review: ronda 1 → APPROVE WITH NITS. Should-fix: la fecha con la que login y registro crean la sesión no se afirmaba
  (`new Date(0)` pasaba **toda** la suite): fixed por Claude (fix-and-record) con reloj falso y `createdAt` igual a la
  hora fija; el mutante cae con `2 failed`. Nits: el comentario de cabecera prometía el control de origen (se prueba en
  `sessionWiring`/`originWiring`): fixed; el título de AC-8 del login: fixed como "AC-8 (stale login)". Mutantes del
  revisor que sobreviven a este archivo pero caen en la suite: `sessionTokenHash` alterado (`sessionWiring.test.ts:146`)
  y sin `originChecker` (`sessionWiring.test.ts:162`).
  Ronda 2 (tier 1, solo pruebas) → APPROVE, 0 blocker, 0 should-fix; 15 mutantes propios, todos caen en la suite. Nit:
  AC-25 solo manda `remember: 'yes'` y `null` lo fija otro archivo (`authRoutes.test.ts`): intentional, la regla de
  `null` ya está probada y este archivo prueba el cableado.
- huecos anotados, fuera de alcance: (1) sin el límite general de 30 pedidos/min (`generalRateLimiter`) la suite sigue
  verde: ningún criterio de esta spec lo pide; (2) `sessionToken.test.ts` (~líneas 50, 61, 235) usa el mismo
  `toContain('Path=/')` débil; (3) la fecha de creación de la sesión solo se afirmaba como `toBeInstanceOf(Date)` en
  `authRoutes.test.ts:379` (ahora la fija esta prueba).
- controls: tests ✅ build ✅ (`tsc -b`) security ✅ (sin cambios en `src`) traceability ✅ (20 ids en títulos de
  pruebas; barrido completo).
- decision: ninguna nueva.

## T008 — 2026-11-19

- status: complete (pendiente: aprobación de tier 2 de Hernán). Arreglos del panel en `dee7ae2`; panel registrado con
  `rsc review ledger panel server-sessions/pr1-server --lenses correctness,security,tests` sobre `dee7ae2` (ronda 1).
- quién: Qwen (Orca, dispatch `ctx_d16b6949eff6`, worktree `t008-push-gate`) corrió la puerta en modo solo lectura y
  reportó con `worker_done` (resumido otra vez; Claude re-corrió los números en su worktree). Brief y script
  `prestoteca-briefs/T008-files/coverage-report.mjs` de Claude, revisados por dos agentes sin contexto antes del
  lanzamiento, con Hernán viendo los hallazgos (ronda 1: las herramientas escriben `dist/`, `tsbuildinfo` y
  `coverage/`; `vitest exit` por los mínimos globales; casos borde del script. Ronda 2: paso 0 con el commit y el diff
  vacío de `client/` como evidencia de lint; `npx --yes` en vez de esperar la pregunta; detalles de redacción).
- antes de lanzar, por decisión de Hernán: prueba `AC-8 B2c` en `userRepo.test.ts` (`rowCount` nulo sin transacción;
  la rama de la línea 172 era nueva de T003): ramas de `userRepo.ts` 78,37 % → 81,08 %. Revisor tier 1 APPROVE WITH NITS
  (error de tipos de `rowCount: null`: fixed con un cast; quedan los 9 errores viejos de HEAD). Commit `0fe76b0`.
- puerta (pasos 1 a 5 de la "Puerta de push de tier 2" del plan), sobre `0fe76b0`:
  1. spec con `branch: feat/server-sessions-server` (línea 12) ✅
  2. verify: suite del server `37 files, 814 passed`; `tsc -b` exit 0; `vitest --coverage` exit 0; cobertura de
     **líneas** ≥ 80 % en los 12 archivos `.ts` de `server/src` que cambió la rama (constitución, principio 6): el más
     bajo `index.ts` 83,33 % (funciones 66,66 %: el bloque de arranque, que las pruebas no corren); `userRepo.ts` 100 %
     líneas / 81,08 % ramas. Lint: el server no tiene linter (principio 4, su barra es `tsc -b`) y la rama no cambia
     nada en `client/`. Suite del cliente (por el cambio del lockfile): `20 files, 486 passed` ✅
  3. `rsc risk --base origin/main` → tier 2 (auth, default, docs, migrations, secrets), 3 revisores, aprobación humana ✅
  4. `rsc spec gate` → PASS (13 puntos abiertos, 10 con tipo) ✅
  5. panel de 3 sobre toda la rama (`origin/main...HEAD`, 39 archivos) → ver review ✅ (registro en el ledger después del
     commit de los arreglos)
- review (panel de cierre, ronda 1): seguridad APPROVE WITH NITS (0 should-fix); corrección APPROVE WITH NITS
  (0 should-fix; trazó carreras, bloqueos mutuos y bordes sin encontrar una sesión viva de la contraseña vieja); pruebas
  APPROVE WITH NITS (66 mutantes; 1 should-fix).
  - should-fix: sin `startSessionPurge(getPool())` en `index.ts` la suite seguía verde (AC-37 dependía de una línea sin
    prueba). Hernán eligió la opción A: prueba de texto en `sessionPurge.test.ts` ("index.ts starts the purge": imports,
    llamada en su propia línea dentro del bloque de arranque, una sola vez en el archivo). Caen: llamada borrada,
    comentada, movida a `createApp`, con otro intervalo, después del `if`, con otro pool. Fixed.
  - nit → fixed: sin el `FOR UPDATE` del primer `SELECT` de `accountDeletion.ts` la suite seguía verde (es la mitad del
    par con el `FOR SHARE` del login, AC-9/AC-33); prueba que fija la SQL exacta del primer paso; caen `FOR UPDATE`
    quitado y cambiado por `FOR SHARE`.
  - revisor tier 1 de esos arreglos: APPROVE WITH NITS. La prueba dependía de 4 espacios de sangría: fixed con una
    expresión por línea (con 2 espacios sigue pasando). `texts[1]` en la prueba del bloqueo: intentional, fija que el
    bloqueo va primero. Sobreviven (aceptado): la llamada dentro del callback de `listen` (sigue corriendo solo al
    arrancar) y una guarda cambiada a `&& false` (código de arranque estándar). Suite `37 files, 817 passed`.
  - nits anotados, sin cambio: `touchActive` puede atrasar `last_used_at` unos ms si dos pedidos llegan en desorden
    (arreglo posible `GREATEST(last_used_at, $3)`); si falla el propio `ROLLBACK`, `transaction.ts` pierde el error
    original y devuelve al pool una conexión rota (código viejo, ahora en el camino del login); la purga recorre la tabla
    sin índice por `last_used_at` (inofensivo con este volumen); "Salir" comparte el límite de 5/min del login
    (riesgo R8, aceptado); sesiones que "reviven" tras una vuelta atrás (cubierto: plan §7, `DELETE FROM sessions` antes
    de volver a desplegar); una sesión "Recordarme" no tiene tope total (decisión de la spec).
- huecos fuera de alcance (código viejo, para su propio cambio): `origin.ts` separa `CORS_ORIGIN` por coma sin `trim`
  (falla cerrado); el mínimo de 8 caracteres de la contraseña nunca se prueba con 7 (`< 7` sobrevive); sin el límite
  general de 30/min la suite sigue verde; `sessionToken.test.ts` con `toContain('Path=/')` débil.
- para T009 (staging), lo que solo la base real puede mostrar: el `FOR SHARE` dentro del `INSERT … SELECT` corre; los
  `::timestamptz` dentro del `CASE` resuelven; en READ COMMITTED la contraseña se vuelve a leer después de la espera;
  5 pedidos simultáneos con la misma cookie dan 200; tras reiniciar el servicio, una sesión vencida desaparece (AC-37).
- controls: tests ✅ build ✅ (`tsc -b`) security ✅ (panel APPROVE) traceability ✅ (todos los AC del server con prueba).
- decision: ninguna nueva; tier 2 → aprobación de Hernán antes del push (T010, después de staging en T009).

## T009 — 2026-11-19

- status: complete — **PASS**. Verificación completa en
  [../verifications/server-sessions-2026-11-19.md](../verifications/server-sessions-2026-11-19.md).
- quién: Claude, con OK de Hernán en cada escritura (migración, deploy, pasos 1 a 7 de las comprobaciones).
- done-check:
  - 005 aplicada en staging con `ON_ERROR_STOP` y `-1`; columnas, `UNIQUE`, FK `NO ACTION` (sin `CASCADE`) e índice
    comprobados ✅
  - `railway up -e staging --service prestoteca --ci` desde la rama ✅
  - deploys de los dos entornos antes, después y al final: producción en `471165e` todo el tiempo ✅
  - cada punto de la comprobación del plan §6: 41/41 en la corrida 4 ✅
  - `smoke.mjs` → SMOKE OK ✅
  - purga: sesión de 8 días borrada tras el reinicio (`Removed 1 expired session(s)`) ✅
  - latencia (R3): mediana 174 ms con el método de 5c (292 ms entonces, con `curl`); dentro de la corrida, pedido
    protegido 178 ms contra `/api/health` 170 ms → sin subida medible; la renovación con umbral no se construye ✅
  - cuentas `qa-sessions-*` borradas desde la app y consulta de solo lectura con 0 activas ✅
- `JWT_SECRET`: presente con 32 caracteres o más en el servicio de la app de los dos entornos (comprobado dentro de
  cada contenedor, sin leer el valor). Se conserva hasta que el PR 2 lleve una semana estable en producción.
- hallazgos de operación (sin cambio de código): `npx railway` corre el paquete de IaC del repo, la CLI es
  `~/.railway/bin/railway.exe`; `railway ssh` corta a veces y se reintenta; `railway restart` puede no terminar aunque
  reinicie (se confirma por los logs); `railway variables --json` queda bloqueado por permisos (trae los valores).
- trazas: AC-1 a AC-10, AC-14, AC-15, AC-21 a AC-24, AC-27, AC-33, AC-35, AC-36, AC-37 contra la base real.
- decision: ninguna nueva. Siguiente: T010 (aprobación de tier 2 de Hernán → push → PR → 005 en **producción**
  comprobada **antes** del merge → merge → deploys de los dos entornos → smoke en producción).

## T010 — 2026-11-19

- aprobación de tier 2: **Hernán aprobó el PR 1** el 2026-11-19, después de ver la verificación de staging (PASS) y la
  opinión de Claude (riesgos restantes: la carrera de la contraseña releída en READ COMMITTED no se forzó en vivo; el
  orden en producción — 005 antes del merge — es crítico; al desplegar, todos cierran sesión una vez por AC-10).
  El código aprobado es el del panel (`dee7ae2`); después solo hay commits de `docs(auto)`.
- PR #51 abierto (MERGEABLE, head `395b061`).
- 005 en **producción** (OK de Hernán, 2026-11-19), antes del merge:
  - antes: tablas públicas `loans`, `tools`, `users`; sin `sessions` ✅
  - aplicada con `ON_ERROR_STOP=1 -1` → `CREATE TABLE`, `CREATE INDEX`, exit 0 ✅
  - después: 6 columnas `NOT NULL` (`token_hash` `character`), `PRIMARY KEY (id)`, `UNIQUE (token_hash)`,
    `FOREIGN KEY (user_id) REFERENCES users(id)` sin `ON DELETE`, índice `idx_sessions_user`; 0 filas ✅
- siguiente: merge del PR #51 → deploys de los dos entornos → smoke en producción.
