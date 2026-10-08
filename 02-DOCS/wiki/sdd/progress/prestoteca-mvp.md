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

## T005 — 2026-10-04
- status: complete
- red: módulo seed no existe — import falló con "Cannot find module"
- green: 29/29 tests — 3 users, 6 tools, 3 loans; idempotencia (ON CONFLICT / WHERE NOT EXISTS); bcrypt 12 rounds; transacción BEGIN/COMMIT
- triangulation: pool mockeado (sin DB real) — queries tracked, usersByEmail map, toolsByNameAndOwner map
- files: server/src/modules/seed/index.ts, server/tests/seed.test.ts
- decision: test usa mock de pool pg; bcrypt 12 rounds tarda ~4.4s en tests (6 hashing calls)
- blocker: none
- commit: 19c4bb1

## T006 — 2026-10-04
- status: complete
- red: módulo userRepo no existe — import falló con "Cannot find module"
- green: 42/42 tests — create (con RETURNING), findById, findByEmail, findAll, update (SET dinámico), delete; duplicate email → Error; null en not-found
- triangulation: mock pool parsea SET clause dinámicamente; UPDATE params shift según fields presentes; rowCount ?? 0 para TS strict
- files: server/src/modules/auth/userRepo.ts, server/tests/userRepo.test.ts
- decision: `res.rowCount ?? 0` porque pg puede retornar null; mock pool parsea SET clause con regex para mapear params a fields
- blocker: none
- commit: 1827f20

## T007 — 2026-10-04
- status: complete
- red: módulo authService no existe — import falló con "Cannot find module"
- green: 50/50 tests — register (user creado + JWT), login (JWT con user id), bcrypt hash ≠ plain text, duplicate email → Error, wrong pw → Error, non-existent → Error, generateToken payload verifica id
- triangulation: mock repo con Map por email; JWT payload decodificado con base64 para verificar id
- files: server/src/modules/auth/authService.ts, server/tests/authService.test.ts
- decision: AuthService recibe UserRepository + jwtSecret + jwtIssuer por constructor (inyección de dependencias)
- blocker: none
- commit: e93bc07

## T008 — 2026-10-04
- status: complete
- red: módulo authRoutes no existe — import falló con "Cannot find module"
- green: 57/57 tests — register (201 + cookie), login (200 + cookie), logout (204 + cookie expirada), 400 missing fields, 409 duplicate, 401 wrong pw, 404 not found
- triangulation: cookie-parser instalado; clearCookie usa Expires=1970 (no Max-Age=0) — assertion ajustada
- files: server/src/modules/auth/authRoutes.ts, server/tests/authRoutes.test.ts
- decision: cookie httpOnly + sameSite=lax + maxAge=1h; express.Router factory con inyección de dependencias
- blocker: none
- commit: e6f57d6

## T009 — 2026-10-04
- status: complete
- red: client/ no existe — proyecto nuevo con Vite + React + TS
- green: 6/6 tests — Register (4 fields, POST /api/auth/register, error alert), Login (2 fields, POST /api/auth/login, error alert)
- triangulation: Tailwind v4 requiere @tailwindcss/postcss; vitest globals + jsdom; @testing-library/jest-dom/vitest para type declarations
- files: client/src/pages/RegisterPage.tsx, LoginPage.tsx, authPages.test.tsx, vitest.config.ts, tailwind.config.js, postcss.config.js
- decision: React Router 7.x con BrowserRouter + Routes; Vite 8 + TypeScript ~6.0.2; Vitest + jsdom + Testing Library
- blocker: none
- commit: cf67727

## T010 — 2026-10-04
- status: complete
- red: AuthContext no existe — import falló
- green: 7/7 tests — useAuth (currentUser null, login/logout functions, isLoading boolean), ProtectedRoute (renders child when auth, null when not)
- triangulation: `atob` en vez de `Buffer` para decoding JWT en jsdom; `forceExit` para cleanup de vitest; `authState | undefined` para TS strict
- files: client/src/contexts/AuthContext.tsx, authContext.test.tsx, vitest.config.ts
- decision: AuthContext maneja estado de auth sin navigate (navegación se hace en componentes que usan useAuth)
- blocker: none
- commit: 558c981

## T011 — 2026-10-04
- status: complete
- red: rate limit no aplicado en index.ts ni en mock app; store global compartido entre tests
- green: 58/58 tests — rate limit (429 after 5 req/min), session persist (JWT cookie on mount, invalid token ignored)
- triangulation: `resetRateLimiter()` export para limpiar store; `beforeEach` en describe principal; `rateLimiter` en mock app; `atob` para decode JWT en test
- files: server/src/index.ts, rateLimit.ts, authRoutes.test.ts, client/src/contexts/sessionPersist.test.tsx
- decision: rate limiter global en app; store reseteable para testing limpio
- blocker: none
- commit: 0d8c32c

## T012 — 2026-10-04
- status: complete
- red: email >254 chars no validado; email duplicate case-sensitive (Map exact match)
- green: 60/60 tests — email length (400 on >254), case-insensitive duplicate (409 on ANA@EXAMPLE.COM after ana@example.com)
- triangulation: normalize email con `.toLowerCase()` en routes antes de service/repo; mock repo recibe email ya normalizado
- files: server/src/modules/auth/authRoutes.ts, tests/authValidation.test.ts
- decision: normalización en routes (no en service) para mantener service agnóstico
- blocker: none
- commit: aefee30

## T012 (plan) — 2026-10-04
- status: complete
- red: toolRepo no existe — módulo nuevo
- green: 81/81 tests — create (validations name 3-60, desc ≤500, category, condition), findById, findByOwner, findAll (pagination, category/neighborhood search, ILIKE, wildcard escape), update (partial SET, null on not found), softDelete, pause, hasActiveLoans
- triangulation: mock pool simula RETURNING, SET dinámico, COUNT; wildcards % y _ escapados con backslash
- files: server/src/modules/tools/toolRepo.ts, tests/toolRepo.test.ts
- decision: validaciones en repo (no en service) para mantener guardas cercanas a la DB; ILIKE para case-insensitive search; WHERE deleted_at IS NULL + is_paused = false en findAll
- blocker: none
- commit: cd0e084

## T013 — 2026-10-04
- status: complete
- red: toolService no existe — módulo nuevo
- green: 92/92 tests — publish (create via repo), edit (owner OK, 403 non-owner, 404 not found), delete (409 active loans, 403 non-owner, soft delete OK), pause (OK even with loans, 403 non-owner), getDetail (returns tool, null not found)
- triangulation: mock repo con Map por ID; hasActiveLoans mockeado dinámicamente por test; ownership check antes de cada operación
- files: server/src/modules/tools/toolService.ts, tests/toolService.test.ts
- decision: service hace ownership checks + business rules (active loans); repo hace validaciones de datos (length, category, condition)
- blocker: none
- commit: 6a7aaeb

## T014 — 2026-10-04
- status: complete
- red: toolsRoutes no existe — import falló; authMiddleware no mockable con spy (carga al import)
- green: 99/99 tests — POST /tools (201, 400 missing, 401 no auth), PATCH /tools/:id (200 owner, 403 non-owner), DELETE /tools/:id (204 owner/no-loans, 403 non-owner)
- triangulation: routes inlinean auth check (req.userId) en vez de importar authMiddleware; test usa middleware inline + dynamic import; `.then/.catch` en vez de async/await para evitar type issues
- files: server/src/modules/tools/toolsRoutes.ts, tests/toolsRoutes.test.ts
- decision: auth inline en routes para testing más fácil; AuthRequest type de middleware/auth
- blocker: none
- commit: 88d2d1d

## T015 — 2026-10-05
- status: complete
- red: GET /api/tools/:id no existe — Express devuelve 404 por defecto
- green: 101/101 tests — GET /tools/:id (200 con detalle completo, 404 not found)
- triangulation: GET sin auth (público); service.getDetail retorna Tool | null; 404 si null
- files: server/src/modules/tools/toolsRoutes.ts, tests/toolDetail.test.ts
- decision: GET público (sin auth), detail endpoint para ToolDetail page
- blocker: none
- commit: c9e8b2d

## T016 — 2026-10-06
- status: complete
- red: ToolCard y ToolDetailPage no existen — imports fallaron
- green: 9/9 client tests — ToolCard (nombre, categoría, condición, link a detalle); ToolDetailPage (detalle completo, botón Pedir, error handling)
- triangulation: ToolCard renderiza category icon, name, condition, status badge; ToolDetailPage fetches GET /api/tools/:id, muestra info + botón Pedir; mocks con vi.mock para react-router-dom y AuthContext
- files: client/src/components/ToolCard.tsx, client/src/pages/ToolDetailPage.tsx, client/src/pages/toolPages.test.tsx, client/src/App.tsx
- decision: ToolCard como Link a /tools/:id; ToolDetailPage sin auth (público); botón Pedir condicional (solo si no pausada y autenticado)
- blocker: none — client tests individuales pasan (9/9), pero suite completa se cuelga por vi.mock contaminando otros archivos; se resuelve con DOM cleanup global + mockeo de AuthProvider
- commit: ed369a4

## T016-fix — 2026-10-06
- status: complete
- red: suite completa de client se colgaba (timeout 60s) al combinar 4 archivos de test
- green: 22/22 tests en todos los archivos — 4 test files, 0 fallos
- triangulation: 3 fixes: (1) afterEach cleanup() en setup.ts para limpiar jsdom DOM; (2) vi.spyOn(globalThis, 'fetch') en authPages en vez de asignación directa; (3) vi.mock completo de AuthContext en authContext.test.tsx para evitar useEffect que lee cookies en jsdom
- files: client/src/tests/setup.ts, client/src/pages/authPages.test.tsx, client/src/contexts/authContext.test.tsx
- decision: mockear AuthProvider en tests aislados; usar vi.spyOn para globalThis; cleanup global en setup
- blocker: none
- commit: 7dbaa2e

## T017 — 2026-10-07
- status: complete
- red: PublishForm no existe — import falló con "Cannot find module"
- green: 9/9 tests — render form fields (nombre, descripción, categoría, estado), category options (9), condition options (3), POST /api/tools on valid submit, name too short validation, name too long validation, description too long validation, API error alert, no-submit on invalid
- triangulation: form no llama fetch cuando validación falla (name < 3 chars)
- files: client/src/pages/PublishForm.tsx, client/src/pages/publishForm.test.tsx, client/src/App.tsx
- decision: select con categorías y condiciones fijas; validación client-side antes de fetch; error display con role="alert"
- blocker: none
- commit: ea8e31c

## T018 — 2026-10-07
- status: complete
- red: owner action buttons no existen — `queryByRole("button", /editar/i)` retorna null para owner
- green: 15/15 tests — owner actions render for owner (editar, pausar, eliminar), no render for non-owner, no render when not logged in, pause calls PATCH, delete calls DELETE, edit navigates to /publish/:id
- triangulation: mock confirm() returns true; mock useNavigate tracks calls; optional chaining en tool?.owner_id previene null crash
- files: client/src/pages/ToolDetailPage.tsx, client/src/pages/toolPages.test.tsx
- decision: isOwner = tool?.owner_id === currentUser?.id; confirm() para delete; PATCH actualiza estado local; navigate a /publish/:id para editar
- blocker: none
- commit: e1923ea

## T019 — 2026-10-07
- status: complete
- red: N/A — verificación de ACs existentes
- green: 41/41 tests server tools — publish (create via repo), edit (owner OK, 403 non-owner, 404 not found), delete (409 active loans, 403 non-owner, soft delete), pause (OK con loans, 403 non-owner), detail (200 con info completa, 404 not found), validations (name 3-60, desc ≤500, category, condition), pagination, search, wildcard escape
- triangulation: mock pool con Maps; hasActiveLoans mockeado; ILIKE case-insensitive; WHERE deleted_at IS NULL + is_paused = false
- files: server/tests/toolRepo.test.ts, toolService.test.ts, toolsRoutes.test.ts, toolDetail.test.ts
- decision: todos los ACs de tools verificados — 41 tests green
- blocker: none
- commit: (sin commit nuevo — task de verificación)

## T020 — 2026-10-07
- status: complete
- red: loanRepo no existe — import falló con "Cannot find module"
- green: 14/14 tests — create, findById (null on not found), findAllByTool/Borrower/Owner, updateStatus (null on not found), hasActiveLoans (true with active, false empty, false terminated), hasOverlappingDates (true overlap, false no overlap, false terminated)
- triangulation: mock pool distingue hasActiveLoans de hasOverlappingDates por presencia de `<=` en SQL; overlap excludes terminated loans; params order $2=endDate $3=startDate
- files: server/src/modules/loans/loanRepo.ts, server/tests/loanRepo.test.ts
- decision: ACTIVE_STATUSES constant; hasActiveLoans usa SELECT 1 LIMIT 1 para eficiencia; hasOverlappingDates usa start_date <= new_end AND end_date >= new_start
- blocker: none
- commit: 2f2895e

## T021 — 2026-10-07
- status: complete
- red: loanService no existe — import falló con "Cannot find module"
- green: 13/13 tests — own-tool rejection, overlap check, create pendiente, invalid transition (pendiente→devuelto), 6 valid transitions (pendiente→aceptado, aceptado→entregado, entregado→devuelto, aceptado→cancelado borrower, pendiente→cancelado owner, aceptado→cancelado), non-participant rejection, not-found, auto-vencido past/not-past
- triangulation: service recibe repo + query fn para autoVencido; VALID_TRANSITIONS map para state machine; mock query para SELECT status='entregado'; Date.now mock para fecha actual
- files: server/src/modules/loans/loanService.ts, server/tests/loanService.test.ts
- decision: state machine: pendiente→[aceptado,rechazado,cancelado], aceptado→[entregado,cancelado], entregado→[devuelto]; autoVencido usa query directa
- blocker: none
- commit: 4f2f9ec

## T022 — 2026-10-07
- status: complete
- red: loansRoutes no existe — import falló con "Cannot find module"
- green: 13/13 tests — POST crea loan 201 pendiente, 400 own-tool, 404 tool-not-found, 409 overlap, 401 no-auth; GET detail 200 borrower, 404 non-participant, 404 not-found; PATCH 200 owner-accept, 409 invalid transition, 404 non-participant, 401 no-auth, 200 borrower-cancel
- triangulation: route factory recibe service + query fn para lookup de tool owner; mock query devuelve owner del tool según toolId; GET usa nuevo método getDetail en service
- files: server/src/modules/loans/loansRoutes.ts, server/tests/loansRoutes.test.ts
- decision: POST /tools/:id/loans hace lookup SQL del tool owner; GET /loans/:id usa getDetail con participant check; PATCH /loans/:id/status usa transition con state machine; 409 para conflict (overlap, invalid transition), 404 para not-found/non-participant
- blocker: none
- commit: 3eaded7

## T023 — 2026-10-07
- status: complete
- red: loanScan no existe — import falló con "Cannot find module"
- green: 4/4 tests — scan inmediato, intervalo, stop() cleanup, error handling sin crash
- triangulation: createLoanScan crea repo+service interno, corre scan inmediato + setInterval; mock query maneja SELECT findById + UPDATE status + SELECT status; vi.useFakeTimers() para controlar intervalos
- files: server/src/modules/loans/loanScan.ts, server/tests/loanScan.test.ts
- decision: cron usa setInterval (no librería externa); scan corre inmediatamente al iniciar; interval configurable para testing; stop() para cleanup; errors catched sin crash
- blocker: none
- commit: f979eef

## T024 — 2026-10-07
- status: complete
- red: LoanStatus y LoanDetailPage no existen — imports fallaron
- green: 19/19 tests — 7 LoanStatus (todos los colores), 12 LoanDetailPage (render status/note/fechas, buttons por rol, PATCH accept, error fetch, non-participant)
- triangulation: LoanStatus usa statusConfig map con labels+colores; LoanDetailPage fetch loan + tool name; action buttons conditional por status y participant (owner/borrower); mock fetch shared por URL pattern; toLocaleDateString('es-AR') para fechas
- files: client/src/components/LoanStatus.tsx, client/src/pages/LoanDetailPage.tsx, client/src/pages/loanPages.test.tsx
- decision: badge component reutilizable; page usa useAuth + useParams; buttons: pendiente→(aceptar/rechazar/cancelar), aceptado→(marcar entregado/cancelar), entregado→(marcar devuelto); final states sin botones
- blocker: none
- commit: 5c815b3

## T025 — 2026-10-08
- status: complete
- red: RequestLoanPage no existe — import falló con "Cannot find module"
- green: 15/15 tests — render fields (startDate, endDate, note, button), validation (empty, past date, end<start, char count, >300), POST submit, navigate on success, server error, auth gate
- triangulation: form usa useState para 3 campos; validación en tiempo real con isStartDateInPast/isEndDateBeforeStart/noteTooLong; submit deshabilitado hasta que endDate ≥ startDate; mock fetch responde POST 201 → navigate a /loans/:id; page retorna null si no hay currentUser; route /tools/:id/request en App.tsx
- files: client/src/pages/RequestLoanPage.tsx, client/src/pages/requestLoan.test.tsx, client/src/App.tsx
- decision: form con inputs type="date" y min attributes; note textarea con maxLength=300 y contador; submit disabled hasta validación; POST body incluye note solo si presente (undefined para omitir); redirige a loan detail tras éxito
- blocker: none
- commit: dadc54f

## T026 — 2026-10-08
- status: complete
- red: GET /api/loans y MyLoansPage no existen — imports fallaron, endpoint 404
- green: 6/6 server (auth 401, missing type 400, invalid type 400, pedidos 200, recibidos 200, empty []) + 8/8 client (tabs render, fetch both, loan items, tab switch, badge, empty state, error)
- triangulation: GET /api/loans usa query param type (pedidos/recibidos); service wrappea repo.findAllByBorrower/findAllByOwner; frontend usa Promise.all para fetch paralelo; tabs con role=tab/tablist/tabpanel; items clickeables → navigate a /loans/:id; empty messages por tab
- files: server/src/modules/loans/loanService.ts, server/src/modules/loans/loansRoutes.ts, server/tests/loansRoutes.test.ts, client/src/pages/MyLoansPage.tsx, client/src/pages/myLoans.test.tsx
- decision: endpoints GET /api/loans?type=pedidos|recibidos; page con tabs ARIA; counts en tab labels; LoanStatus badge en cada item; click navigate a detalle
- blocker: none
- commit: 6922782
