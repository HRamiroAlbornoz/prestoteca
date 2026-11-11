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

## T006 — 2026-11-10
- status: complete. Implementada por Qwen (worktree `t006-tools`), revisada por Claude
- red: 3 tests fallan por los códigos viejos (reporte de Qwen)
- green: suite del server 29 archivos, 444/444 (junto con T004 y T005); `tsc -b` limpio
- files: server/src/modules/tools/{toolsRoutes,toolService,toolRepo}.ts, server/src/modules/search/{searchService,searchRepo}.ts;
  tests toolsRoutes, toolService, toolRepo, toolDetail, searchService, searchRepo
- risk: tier 1 — 1 revisor de contexto fresco
- review de Claude: el código estaba bien a la primera, pero los tests fijaban 5 de los 10 códigos → devueltos a Qwen,
  que agregó los que faltaban; mutantes de Claude (código de publicar y de repo) detectados. Claude agregó los tests de
  `toolRepo.update` (78 % → 100 % de cobertura)
- review revisor: pass; 1 should-fix (sin test de servicio para `TOOL_EDIT_EMPTY` ni de su orden) + 3 nits → arreglados
  (3 tests de servicio, test HTTP de `SEARCH_QUERY_TOO_LONG`, comentario y variables sin uso)
- controls: tests ✅ · build ✅ · security no aplica (tier 1, sin auth) · traceability ✅ (AC-6 filas 17-22 y 33, AC-5c server)
- coverage: toolsRoutes.ts 89,65 % · toolService.ts 88,88 % · toolRepo.ts 100 % · searchService.ts 100 % · searchRepo.ts 88,88 %
- note: el mensaje de desarrollo de `TOOL_EDIT_EMPTY` sigue siendo 'Tool not found' (§0: los mensajes no cambian)

## T007 — 2026-11-10
- status: complete. Implementada por Qwen (worktree `t007-loans`), revisada por Claude
- red: 15 tests fallan por los códigos viejos (reporte de Qwen)
- green: suite del server 29 archivos, 457/457 (con T004-T006); `tsc -b` y `npm run build` limpios
- files: server/src/modules/loans/{loansRoutes,loanService}.ts; tests loansRoutes, loanService
- risk: tier 1 — 1 revisor de contexto fresco
- review de Claude: código bien a la primera; los tests fijaban 8 de 13 códigos y faltaba la comparación ajeno =
  inexistente → devueltos a Qwen y agregados. Qwen se detuvo sin `worker_done`; Claude verificó todo y corrió 3 mutantes
  (detectados)
- review revisor: 1 blocker — Qwen dejó commiteable un bloque de test que reescribía `src/` con `writeFileSync` y lanzaba
  `vitest` anidado (su "prueba de mutantes") → borrado; el código de `src/` se comprobó intacto. 1 should-fix (ese mismo
  bloque) y 2 nits arreglados (código en el 409 por HTTP, test del `updateStatus` que devuelve null, una aserción doble);
  1 nit aceptado (helper de mock duplicado)
- controls: tests ✅ · build ✅ · security no aplica (tier 1) · traceability ✅ (AC-6 filas 23-32; ajeno = inexistente)
- coverage: loansRoutes.ts 91,46 % · loanService.ts 100 %
- lección: los pedidos a Qwen prohíben tests que escriban en `src/` o lancen procesos; Claude lo busca con `grep` antes de aplicar un parche

## Cierre del PR 1 (rama `feat/error-codes-server`) — 2026-11-10
- spec enlazada a la rama (`branch: feat/error-codes-server`, ok de Hernán) y `.gitattributes` para que las specs queden
  con LF en disco (rsc lee mal los CRLF): `rsc spec gate` pasa sobre el archivo real (commit `ac7ef06`)
- revisión triple de la rama entera contra `main` (HEAD `ac7ef06`):
  - correctness: pass, 0 hallazgos (cada status igual que en `main` salvo D7 y D9; ningún error a mano fuera de `errors/`;
    mensajes de desarrollo intactos)
  - security: pass, 0 hallazgos (login, préstamos y rutas `/api` siguen indistinguibles donde deben; nada interno en
    cuerpos ni logs; `orca.yaml` no corre fuera de la PC)
  - tests: changes-needed — 115 mutantes, 100 detectados; 2 should-fix (borrar y pausar una herramienta inexistente sin
    test de `TOOL_NOT_FOUND`) y 2 nits (`BAD_REQUEST` de categoría/estado solo por status; `headersSent` de
    `errorHandler` sin test) → arreglados, solo tests (toolService.test.ts, errorCodes.test.ts). Los `BAD_REQUEST` de
    "id inválido" en rutas quedan sin test: ningún pedido real llega a esa línea
- controls: suite del server 29 archivos, 464/464; build desde la raíz y tests del cliente (181/181) verdes
- backlog (preexistentes, aprobados por Hernán): email/contraseña no string → 500; carrera borrar cuenta / cambiar
  contraseña; estado de préstamo `"constructor"` → 500; los tests del server no pasan por `tsc`
- resultado: PR #42 mergeado (`9434bd9`), deploy SUCCESS en producción y staging; humo: `/api/nope` sin sesión →
  `SESSION_REQUIRED`, login sin `Origin` → `ORIGIN_NOT_ALLOWED`

## T008 — 2026-11-11 (PR 2, rama `feat/error-codes-client-base`)
- status: complete. Hecha por Claude
- red: con stubs (`MESSAGES = {}`, funciones que devuelven el código equivocado) → cada test falla por su aserción; el
  parser ya leía los textos de la spec (`expected undefined to be 'Tu sesión terminó…'`)
- green: `cd client && npx vitest run src/errors` → 108/108; cliente completo 17 archivos, 289/289; `tsc -b` limpio;
  `npm run build` desde la raíz verde (R1); el bundle no contiene valores del catálogo (`import type` borrado)
- AC-5 visto fallar: sin la entrada `TOOL_PAUSED` fallan el test (`expected 'undefined' to be 'string'`, y la fila 23
  de AC-14) **y** `tsc -b` (`TS2741: Property 'TOOL_PAUSED' is missing`); archivo restaurado byte a byte
- files: client/src/errors/{messages,apiError}.ts y sus tests (nuevos)
- risk: tier 1 — 1 revisor de contexto fresco
- review: pass, 2 nits → lista de códigos propios del cliente escrita tres veces: arreglado (`CLIENT_ONLY_CODES` única,
  el tipo sale de ella); el bucle de "códigos pendientes" queda vacío después de T009: aceptado, T009 lo borra
- controls: tests ✅ · build ✅ · lint ✅ (oxlint sin avisos en `errors/`) · security ✅ (nunca se lee el `message` del
  server) · traceability ✅ (AC-2, AC-3, AC-4 unit, AC-5, AC-9c, AC-14)
- spec: `branch:` pasa a `feat/error-codes-client-base` (ok de Hernán)

## T009 — 2026-11-11
- status: complete. Hecha por Claude
- red (guardia): con `origin.ts` y `rateLimit.ts` de antes del PR 1 (`git show 16e76de:…`) puestos en `src`,
  `tests/errorGuard.test.ts` falla en esos dos archivos; restaurados (`git status` vacío) → verde
- red (borrado): el test nuevo "el catálogo tiene exactamente los códigos del plan" falla con 42 claves contra 38 →
  borrados `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` del catálogo y del mapa del cliente, y las 5 subclases
- green: server 30 archivos, 506/506; cliente 17 archivos, 285/285; `tsc -b` limpio en los dos; build desde la raíz verde;
  `grep -rnE "ValidationError|NotFoundError|ConflictError|ForbiddenError|UnauthorizedError" server/src server/tests` → 0
- files: server/tests/errorGuard.test.ts (nuevo), server/src/modules/errors/{AppError,errorCodes}.ts,
  client/src/errors/{messages.ts,messages.test.ts}; tests del server con subclases o con porteros falsos que respondían
  `UNAUTHORIZED` (ahora `SESSION_REQUIRED`)
- risk: tier 1 — 1 revisor de contexto fresco
- review: pass, 4 nits + 1 pregunta sobre huecos de la guardia → reforzada (prohíbe cualquier clave `error: {` y
  `code:` con literal, también entre comillas, fuera de `errors/`; solo borra comentarios de línea completa; revisa
  `.mts`, `.js` y `.tsx`); 6 casos nuevos en el test. Aceptado: fixtures del cliente con códigos viejos
  (`App.test.tsx`, `editTool.test.tsx`, `toolPages.test.tsx`), que se reescriben con sus pantallas en el PR 3
- controls: tests ✅ · build ✅ · lint ✅ (cliente) · security ✅ · traceability ✅ (AC-5b estática, AC-7, AC-8)
- resultado: PR #44 mergeado (`3fe39aa`), deploy SUCCESS en producción y staging

## T010 — 2026-11-11 (PR 3, rama `feat/error-codes-screens`)
- status: complete — pendiente de la aprobación de Hernán (tier 2). Hecha por Claude
- alcance (decisión de Hernán, opción 1): además de la sesión, T010 conecta el código `SESSION_REQUIRED` en la carga de
  `LoanDetailPage` y en pausar/eliminar de `ToolDetailPage`, para probar AC-11 con la app real; el resto de esas
  pantallas lo migran T013 y T014. Regla de oxlint `allowExportNames: ["useAuth"]` (ok de Hernán)
- red: `client/src/session.test.tsx` (nuevo, app real) → 12 de 15 fallan con el comportamiento de antes
- green: cliente 18 archivos, 312/312; `tsc -b` limpio; lint sin avisos salvo el de `HomePage` (T012)
- files: App.tsx (`useTransitions={false}`), contexts/AuthContext.tsx (`markSignedOut`, `logout()` que informa),
  errors/useApiError.ts (nuevo), pages/LoginPage.tsx (aviso por state, mensajes en español, `replace`, filtro de
  caracteres de control en `returnTo`), components/NavBar.tsx ("Salir" que falla), pages/LoanDetailPage.tsx,
  pages/ToolDetailPage.tsx (`returnUrl` → `returnTo`), .oxlintrc.json; tests session, authContext, App, toolPages
- risk: tier 2 (`session.test.tsx`, clase auth) — 3 refuters + aprobación humana
- review ronda 1: correctness 1 should-fix (el aviso de "Salir" volvía con "atrás": se ataba a `location.key`) + 2 nits;
  security pass + 1 nit preexistente (`/%09/evil.com` pasaba el filtro de `returnTo`); tests 4 should-fix + 1 nit
  (tests que pasaban por otra razón: "atrás" sin destino, reintento de "Salir", eliminar, query string) → todo
  arreglado; los 5 mutantes que sobrevivían ahora mueren. Aparcado a T014: la carga de préstamos sin `AbortController`
- review ronda 2 (correctness, solo los arreglos): pass + 2 nits → el aviso ya no parpadea mientras la sesión no se
  conoce (`!isLoading`, con test); guardia `currentUser` en "Salir" sin test: aceptado (casi equivalente)
- controls: tests ✅ · build ✅ · lint ✅ · security ✅ · traceability ✅ (AC-11, AC-12, AC-13)
- commit: `384d065` (aprobada por Hernán)

## T012 — 2026-11-11
- status: complete. Implementada por Qwen (worktree `t012-home`, base `8725147`: no necesita `useApiError`), revisada por Claude
- review de Claude, 1.ª entrega: 3 errores que los tests no veían (resultados viejos junto al error; un 200 que no es
  JSON mostraba "sin conexión"; un truco frágil `msg in MESSAGES`) → devueltos a Qwen y arreglados
- review de Claude, 2.ª entrega: 3 de 4 mutantes propios detectados; agregado el test del error viejo que seguía
  mientras carga la búsqueda nueva; 2 errores de `tsc -b` que Qwen no vio (corrió `tsc --noEmit`) arreglados
- review del revisor: 1 should-fix (ningún test probaba que un pedido cancelado no toca la pantalla: borrar esa
  guardia dejaba "Cargando" para siempre con todo verde) + 5 nits → test nuevo (la respuesta tardía no cambia nada),
  validación completa de la página de herramientas (`total`, `page`, `pages`), la paginación ya no desaparece al
  cargar, `fetchTools` pasa a ser una función común que usa la misma `requestKey`. Aceptados: C10 débil y el caso
  A→B→A
- green: cliente 18 archivos, 329/329; `tsc -b` limpio; **lint 0 advertencias en todo el cliente** (se fue la de
  `HomePage`)
- files: client/src/pages/HomePage.tsx, client/src/pages/homePage.test.tsx
- risk: tier 1 — 1 revisor
- controls: tests ✅ · build ✅ · lint ✅ · security no aplica · traceability ✅ (AC-5c, AC-1, AC-4)
- coverage: HomePage.tsx ~96 %
- lección para los pedidos: exigir `npx tsc -b` exacto (no `--noEmit`) y avisar que `ClientErrorCode` sale de `messages.ts`

## T011 — 2026-11-11
- status: complete. Implementada por Qwen (worktree `t011-account`, base `a627e83`), revisada por Claude
- review de Claude, 1.ª entrega: 5 problemas → devueltos a Qwen y arreglados: los tests reemplazaban `useNavigate`
  por un mock (la navegación al login no se probaba de verdad); cambió los textos de las validaciones locales de
  contraseña (el pedido decía que no se tocan); solo detectaba un 200 que no es JSON, no uno con otra forma; carga
  duplicada con dos `AbortController` y la cancelación contada como "sin conexión"; terminó sin `worker_done`
- review de Claude, 2.ª entrega: el código quedó bien; 3 huecos en los tests arreglados por Claude: C9 no probaba la
  cancelación (los pedidos nunca respondían, borrar la guardia dejaba todo verde); el contador de `markSignedOut` no
  se reiniciaba entre tests (C4 pasaba por el orden); faltaban los textos locales de largo y espacios y el caso con
  SESSION_REQUIRED solo en el historial (C5b). 6 mutantes propios, todos detectados
- review del revisor (correctness, tier 1): código sin defectos; 3 should-fix + 1 nit, todos de tests → tests nuevos
  (forma del historial, `receivedLoans`/`madeLoans` faltantes, dos fallas distintas → gana herramientas, una sola
  carga al volver a pintar); los 3 mutantes del revisor ahora fallan. Aceptado sin test: el error de carga no se
  borra si el efecto vuelve a correr (hoy no puede pasar)
- green: cliente 18 archivos, 360/360; `tsc -b` limpio; lint 0 advertencias
- files: client/src/pages/RegisterPage.tsx, client/src/pages/ProfilePage.tsx, client/src/pages/authPages.test.tsx,
  client/src/pages/profilePage.test.tsx
- risk: tier 1 — 1 revisor
- controls: tests ✅ · build ✅ · lint ✅ · security ✅ (no se muestra texto del servidor) · traceability ✅ (C1-C13)
- coverage: RegisterPage.tsx 100 %, ProfilePage.tsx 85,6 %
- lección para los pedidos: prohibir mockear `react-router-dom`; en los tests de cancelación, las respuestas tienen
  que llegar después de desmontar

## T013 — 2026-11-11
- status: complete. Empezada por Qwen (worktree `t013-tools`, base `47a9585`), terminada por Claude
- review de Claude, 1.ª entrega: 9 problemas devueltos (`tsc -b` fallaba, Qwen corrió `--noEmit`; `fetchFailureCode(null)`
  en 3 lugares; un 200 que no es JSON mostraba "sin conexión"; estado tocado después de cancelar; error de acción viejo
  que no se borraba; C6 con un fetch que nunca respondía; comentarios borrados; `restoreAllMocks` quitado; sin
  `worker_done` ni autorrevisión)
- 2.ª entrega: cambió `client/src/errors/apiError.ts` (prohibido; cambiaba el significado de `fetchFailureCode` para
  toda la app) y dejó puntos sin hacer → Claude trajo solo los archivos de pantallas y terminó: carga de
  `ToolDetailPage` y de `PublishForm` en una función que devuelve el resultado y una sola guardia `aborted` antes de
  tocar estado o llamar a `handle`; JSON roto o forma inválida → UNKNOWN_ERROR; comentarios restaurados;
  `restoreAllMocks` en `afterEach`; tests nuevos (error viejo de pausa, cancelar la edición no lleva al login).
  7 mutantes propios, todos detectados
- review del revisor (correctness, tier 1): PASS; 1 should-fix (test de que eliminar borra el error viejo) → test
  nuevo, el mutante ahora falla; 2 nits aceptados (L57, L58: los errores no se reinician si cambia el `id` en la misma
  pantalla; igual que antes, y hoy ninguna pantalla lleva de una herramienta a otra). Pregunta abierta, fuera del
  plan: pausar, eliminar y guardar no se cancelan al salir
- green: cliente 18 archivos, 380/380; `tsc -b` limpio; lint 0 advertencias
- files: client/src/pages/ToolDetailPage.tsx, client/src/pages/PublishForm.tsx, client/src/pages/toolPages.test.tsx,
  client/src/pages/editTool.test.tsx, client/src/pages/publishForm.test.tsx
- risk: tier 1 — 1 revisor
- controls: tests ✅ · build ✅ · lint ✅ · security ✅ (no se muestra texto del servidor) · traceability ✅ (C1-C14, AC-9b)
- coverage: PublishForm.tsx 100 %, ToolDetailPage.tsx 92,9 %
- lección: Qwen no siguió las reglas nuevas del pedido ni la autorrevisión. Hernán decidió seguir delegando a Qwen
  para probar el modelo local; el pedido de T014 apunta a los patrones ya revisados y lista cada mutante
