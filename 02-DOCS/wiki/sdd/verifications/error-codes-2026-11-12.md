---
type: verification
title: error-codes — verificación de cierre (T016)
description: Cierre de error-codes. Todos los done-checks en verde, cobertura por archivo cambiado ≥ 80 % y los tres recorridos de staging probados con respuestas de la API y capturas.
tags: [sdd, verification, errors, staging, coverage]
timestamp: 2026-11-12T19:40:00Z
topic: sdd
slug: error-codes
---

# error-codes — verificación de cierre (T016)

> Tarea T016 del [plan](../plans/error-codes.md) · [spec](../specs/error-codes.md) ·
> [progreso](../progress/error-codes.md) · [línea base de cobertura](error-codes-coverage-baseline.md).
> Rama `feat/error-codes-screens`, commit `f4b89f0` (PR 3 de 3; los PR 1 y 2 ya están en `main`).

**Veredicto (2026-11-12): PASS.** No queda ningún check sin correr. Hay dos observaciones menores, que no bloquean el
cierre (ver al final).

## 1. Done-checks y suites (C1-C23)

Los corrió primero Qwen, en un worktree aparte (`t016-checks`, Parte A, solo lectura). Después Claude los volvió a
correr en `E:\Trabajo\prestoteca` sobre el mismo commit. Los números coinciden en todas las filas.

| # | Tarea | Comando (resumido) | Resultado |
| --- | --- | --- | --- |
| C1 | T002 | `server: npx vitest run` | 30 archivos, **506/506** |
| C2 | T003 | middleware, origin, rate limit, securityAc, errors, authRoutes | 6 archivos, 64/64 |
| C3 | T004 | authRoutes, authService, authValidation, userRepo, errors | 5 archivos, 66/66 |
| C4 | T005 | meAccountRoutes, accountDeletion | 2 archivos, 23/23 |
| C5 | T006 | tools y search (7 archivos) | 7 archivos, 114/114 |
| C6 | T007 | loansRoutes, loanService, loanRepo | 3 archivos, 79/79 |
| C7 | T001/T002 | `tests/errorCodes.test.ts` | 123/123 |
| C8 | T009 | `tests/errorGuard.test.ts` | 41/41 |
| C9 | T009 | `grep` de las subclases viejas en `server/src` y `server/tests` | sin resultados (exit 1 = pasa) |
| C10 | — | `server: npx tsc -b` | sin errores |
| C11 | — | `client: npx vitest run` | 20 archivos, **458/458** |
| C12 | T008 | `src/errors` | 3 archivos, 131/131 |
| C13 | T010 | App, contexts, authPages, errors | 7 archivos, 171/171 |
| C14 | T011 | authPages, profilePage | 2 archivos, 51/51 |
| C15 | T012 | homePage | 33/33 |
| C16 | T013 | toolPages, editTool, publishForm | 3 archivos, 55/55 |
| C17 | T014 | requestLoan, loanPages, myLoans | 3 archivos, 79/79 |
| C18 | T015 | noServerText, errorAlerts, accessibility | 3 archivos, 62/62 |
| C19 | — | `client: npx tsc -b` | sin errores |
| C20 | — | `client: npm run lint` (oxlint 1.89.0) | exit 0; `npx oxlint --max-warnings 0` → exit 0 (oxlint no imprime nada cuando no encuentra problemas) |
| C21 | — | `npm run build` desde la raíz | exit 0 |
| C22 | T017 | `server: npx vitest run --coverage` | exit 0 (ver §2) |
| C23 | T017 | `client: npx vitest run --coverage --coverage.provider=v8` | exit 0 (ver §2) |

**Pruebas "visto fallando"**: se hicieron en su momento, a mano, y no se repiten acá. Quedaron registradas en el
progreso: T001 y T002 (rojo por import y por aserción), T008 (AC-5 sin la entrada `TOOL_PAUSED`), T009 (la guardia del
server contra copias de `origin.ts` y `rateLimit.ts`) y T015 (la guardia del cliente contra el `LoginPage.tsx` de
antes, más los mutantes de las alertas).

## 2. Cobertura por archivo cambiado (% líneas)

El criterio es el de la [constitución](../constitution.md), principio 6: ≥ 80 % de líneas en cada archivo de la app
que cambió la feature (los 3 PR, desde `ef238a2`). Los números salen de `coverage-summary.json`, porque la tabla de
texto de vitest esconde los archivos cubiertos al 100 %.

| Cliente (`client/src/…`) | % | Servidor (`server/src/…`) | % |
| --- | --- | --- | --- |
| App.tsx | 100 | index.ts | 85.71 |
| components/NavBar.tsx | 100 | modules/auth/authRoutes.ts | 100 |
| contexts/AuthContext.tsx | 96.96 | modules/auth/authService.ts | 100 |
| errors/apiError.ts | 100 | modules/auth/userRepo.ts | 90 |
| errors/messages.ts | 100 | modules/errors/AppError.ts | 96 |
| errors/useApiError.ts | 100 | modules/errors/errorCodes.ts | 100 |
| pages/HomePage.tsx | 95.4 | modules/loans/loanService.ts | 100 |
| pages/LoanDetailPage.tsx | 84.53 | modules/loans/loansRoutes.ts | 91.46 |
| pages/LoginPage.tsx | 100 | modules/me/accountDeletion.ts | 100 |
| pages/MyLoansPage.tsx | 94.02 | modules/me/meAccountRoutes.ts | 96.29 |
| pages/ProfilePage.tsx | 85.6 | modules/me/meRoutes.ts | 90.9 |
| pages/PublishForm.tsx | 100 | modules/middleware/auth.ts | 100 |
| pages/RegisterPage.tsx | 100 | modules/middleware/origin.ts | 100 |
| pages/RequestLoanPage.tsx | 97.56 | modules/middleware/rateLimit.ts | 83.87 |
| pages/ToolDetailPage.tsx | 92.85 | modules/search/searchRepo.ts | 88.88 |
| | | modules/search/searchService.ts | 100 |
| | | modules/tools/toolRepo.ts | 100 |
| | | modules/tools/toolService.ts | 100 |
| | | modules/tools/toolsRoutes.ts | 89.65 |

**34 de 34 ≥ 80 %.** Totales, comparados con la línea base de T017:

| Lado | Líneas (antes → ahora) | Ramas (antes → ahora) |
| --- | --- | --- |
| server | 84.75 % → **93.78 %** | 77.27 % → **88.38 %** |
| client | 85.24 % → **93.36 %** | 75.94 % → **85.64 %** |

El umbral global de ramas del server (80 %), que fallaba en la línea base, **ahora se cumple** y la corrida con
cobertura termina con exit 0.

## 3. Staging

**Deploy**: `railway up -s prestoteca -e staging` desde el worktree limpio en `f4b89f0`. No se cambió la fuente del
servicio. Staging pasó a `8236083b` (SUCCESS). Antes estaba en `3ee20593`. Producción sigue en `66adb1af`, sin
tocar. `GET /api/health` → `200 {"status":"ok","db":"connected"}`. La rama no trae migraciones.

**Datos de prueba** creados en la base de staging: 3 usuarios `t016-*-1794511861645@example.com`, la herramienta
`ce45e157-…` ("Taladro T016") y el préstamo pendiente `9d6cf7f2-…` (20 al 22/11).

### 3.1 Respuestas de la API (script con `fetch`, `Origin` de staging)

```
OVERLAP: second loan 21-23 nov → 409 {"error":{"code":"LOAN_DATES_OVERLAP","message":"La herramienta tiene un préstamo activo con fechas solapadas"}}
SESSION: GET /api/me without cookie → 401 {"error":{"code":"SESSION_REQUIRED","message":"Authentication required"}}
SESSION: GET /api/me with an invalid token → 401 {"error":{"code":"SESSION_REQUIRED","message":"Invalid or expired token"}}
SESSION: GET /api/me with the real cookie (control) → 200
RATE: wrong login #1 → 401 {"error":{"code":"INVALID_CREDENTIALS","message":"Invalid credentials"}}
RATE: wrong login #2 → 401 {"error":{"code":"INVALID_CREDENTIALS","message":"Invalid credentials"}}
RATE: wrong login #3 → 429 {"error":{"code":"RATE_LIMITED","message":"Too many requests. Please try again later."}}
RATE: wrong login #4 → 429 {"error":{"code":"RATE_LIMITED","message":"Too many requests. Please try again later."}}
UNKNOWN API ROUTE (AC-5b) → 404 {"error":{"code":"API_ROUTE_NOT_FOUND","message":"API route not found"}}
```

El 429 llega en el tercer login porque los 3 registros anteriores ya habían usado 3 de los 5 pedidos por minuto del
limitador de autenticación.

### 3.2 Recorridos en el navegador (Chrome aislado, 390 × 844)

| Caso | Qué se hizo | Qué se vio | Captura |
| --- | --- | --- | --- |
| Superposición (AC-1, AC-9, fila 29) | Con sesión, en `/tools/ce45e157-…/request`, pedir del 21 al 23/11 | Un único `role="alert"`: "La herramienta ya está reservada en esas fechas. Probá con otras." No aparece el texto del server. El formulario conserva las fechas | [1-overlap.png](error-codes-2026-11-12/1-overlap.png) |
| Sesión terminada (AC-11, fila 8) | Con sesión, se borró la cookie del lado del server (`POST /api/auth/logout` desde la página, sin avisarle a la app; `/api/me` → 401 `SESSION_REQUIRED`), y después clic en "Mis préstamos" | Llevó a `/login?returnTo=%2Floans` con el aviso "Tu sesión terminó. Iniciá sesión para continuar." en `role="alert"` y la barra sin sesión | [2a-session-ended-login.png](error-codes-2026-11-12/2a-session-ended-login.png) |
| … y vuelve | Login correcto | Volvió a `/loans` ("Mis préstamos" cargado). "Atrás" llevó a la pantalla anterior al login, sin volver a mostrar el aviso | [2b-session-back-to-loans.png](error-codes-2026-11-12/2b-session-back-to-loans.png) |
| Demasiados intentos (AC-9c, fila 35) | En `/login`, varios intentos con contraseña incorrecta | Primero "El email o la contraseña no son correctos." y, al llegar al límite, "Hubo demasiados pedidos en poco tiempo. Esperá un minuto y volvé a intentar.". Red: `login` 401, 401, 429. El email escrito sigue en el campo | [3-rate-limited.png](error-codes-2026-11-12/3-rate-limited.png) |

**Cómo se simuló el vencimiento**: la cookie dura lo mismo que la sesión (1 h). Al vencer, el navegador la descarta y
el server solo ve "no hay cookie". Borrarla con el logout del server produce exactamente ese estado, sin esperar
una hora.

**Fuera de alcance acá**: la búsqueda demasiado larga pegando 61 caracteres (AC-5c). La spec no la pide en staging; la
cubren los tests de `homePage.test.tsx` (C15).

## 4. Criterios de aceptación → evidencia

| AC | Evidencia |
| --- | --- |
| AC-1, AC-9 | C18 (`errorAlerts.test.tsx` E1-E13, axe sin violaciones) + staging 3.2 |
| AC-2, AC-3, AC-4 | C12 (`apiError`), C13-C17 por pantalla |
| AC-5 | C12; visto fallar en T008 |
| AC-5b | C2, C8 (guardia del server) + `API_ROUTE_NOT_FOUND` en staging |
| AC-5c | C15 |
| AC-6, AC-7 | C1-C7 (una tabla de casos con Supertest) |
| AC-8 | C2 (`errors.test.ts`), C8 |
| AC-9b | C16 |
| AC-9c | C12 + staging (429) |
| AC-10 | C18 (`noServerText.test.ts`); visto fallar en T015 |
| AC-11 | C13 + staging (sesión terminada → login → vuelta) |
| AC-12 | C13, C14 + staging (401 deja el email escrito) |
| AC-13 | C13 |
| AC-14 | C12 (lee la tabla de la spec) |

## 5. Rollback

- **Staging**: volver a publicar `main` con `railway up -s prestoteca -e staging` desde un checkout limpio de `main`.
  El deploy anterior, `3ee20593`, quedó en estado REMOVED.
- **Producción, después del merge**: revertir el commit squash del PR 3 en `main`. Railway publica solo, porque
  producción sigue a `main`. No hay migraciones, así que la base no hay que tocarla. Volver atrás deja la versión del
  PR 2: el server ya responde los códigos nuevos, pero las pantallas vuelven a sus textos genéricos.

## 6. Observaciones (no bloquean)

1. **Foco después de la redirección al login**: después de la redirección, el foco del teclado quedó en "Crear
   cuenta" de la barra, y no al inicio del contenido. El aviso igual se anuncia, porque es `role="alert"`.
   Candidato para la feature de navegación/accesibilidad.
2. **Captura 2a**: el enlace "Iniciar sesión" de la barra se ve casi invisible. Parece una transición a medio
   camino al momento de la captura (en la captura 3 se ve bien). No se pudo confirmar más.
3. **Done-check de lint del pedido a Qwen**: pedía el texto "0 warnings", pero oxlint no imprime nada cuando no
   encuentra problemas. Qwen lo marcó FAIL siguiendo la regla al pie de la letra. El check real (exit 0 con
   `--max-warnings 0`) pasa.
