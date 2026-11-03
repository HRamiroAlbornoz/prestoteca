---
type: plan
title: Plan — Códigos de error específicos y mensajes en español
description: El plan a nivel de estructura para error-codes — catálogo de códigos, mapa de mensajes, sesión terminada, contratos, tests y orden de construcción.
tags: [sdd, plan, errors, i18n]
timestamp: 2026-11-03T18:00:00Z
topic: sdd
slug: error-codes
status: draft
---

# Plan — Códigos de error específicos y mensajes en español

> Spec: [../specs/error-codes.md](../specs/error-codes.md) · Constitution: [../constitution.md](../constitution.md) ·
> Decisiones: D5, D6, D7 en [../decisions.md](../decisions.md) · Status: draft
> Last updated: 2026-11-03

## 0. Global Constraints

Valores exactos que toda tarea respeta. El revisor de cada tarea los lee primero; violarlos es un hallazgo.

- **Forma de toda respuesta de error (sin excepción):** JSON `{ "error": { "code": "<CÓDIGO>", "message": "<texto>" } }`.
  `code` pertenece al catálogo de §3.1. `message` es texto para desarrollo, en inglés, y **nunca** se muestra al
  usuario. Ningún otro campo (`details`, `retryable`, `action`) se agrega en este ciclo.
- **Status HTTP:** cada situación responde el mismo status que antes de este cambio (tabla de §4). Única fuente del
  status: el catálogo (un código → un status).
- **Mensajes al usuario:** los textos de la tabla *What result they get* de la spec, **copiados letra por letra**
  (incluido el punto final y el voseo). Fila 8 sin la nota en cursiva "(y la app lleva al login)".
- **Nunca se muestra el texto del server.** Ningún archivo del cliente (fuera de tests) lee `error.message` de una
  respuesta.
- **Ir al login depende del código `SESSION_REQUIRED`, nunca del status 401.** `INVALID_CREDENTIALS`,
  `CURRENT_PASSWORD_INCORRECT` (401) y `ORIGIN_NOT_ALLOWED` (403) no llevan al login.
- **Vuelta después del login:** parámetro `returnTo` (no `returnUrl`), con `encodeURIComponent`; el login lo filtra
  con `safeReturnTo` como hoy. Los tests de `App.test.tsx` con `returnTo=//evil.example` siguen pasando.
- **Accesibilidad:** todo mensaje de error visible está en un elemento con `role="alert"` (constitución, principio 14).
- **Límites que no cambian:** 5 pedidos/min por IP en `/api/auth/*`, 30/min en el resto; body JSON máx. 10 kb.
- **Logs del server:** siguen en inglés; un error inesperado se loguea en el server y responde `INTERNAL_ERROR` sin
  stack, SQL ni rutas de archivos (constitución, principio 8).
- **Calidad (constitución 4-6):** oxlint/ESLint sin warnings, `tsc -b` sin errores en `client` y `server`, TDD
  red→green→refactor, cobertura ≥ 80 % de las líneas cambiadas. Tests: Vitest, Supertest, Testing Library.
- **Commits:** gitmoji + Conventional Commits, en inglés; sin `Co-Authored-By` de una IA ni pie "generated with".
- **Fuera de alcance (no tocar):** otros idiomas, botón de reintentar, `retryable`, mensajes por campo desde el
  server, textos de éxito del server, logs, cambiar status, validaciones del cliente en `utils/toolForm.ts`, guardar
  formularios a medio llenar al ir al login, "Pedir prestada" visible para el dueño, PATCH con `name` no string → 500.

## 1. Context & constraints

- **Criterios que moldean el diseño:** AC-5 y AC-14 (un mapa completo y fiel a la tabla, comprobado por tests) fuerzan
  un catálogo único y legible por máquina; AC-5b (nada fuera del catálogo) fuerza un único escritor de respuestas de
  error en el server; AC-11 y AC-13 (sesión terminada, "Salir" que falla) tocan el estado de sesión del cliente; AC-9b
  y AC-5c fuerzan separar "error al cargar" de "error de una acción" en cada pantalla.
- **Constitución en juego:** principio 7 (estructura `server/src/modules/<module>/`, `client/src/<layer>/`), 8 (forma
  consistente, detalle solo en logs), 13 (rate limits, origin check), 14 (errores anunciados).
- **Decisiones previas:** D5 (códigos en el server, mensajes en el cliente), D6 (sesión terminada → login y vuelta;
  textos de la tabla son la referencia).
- **Lo que hay hoy (relevamiento del 2026-11-03):** `server/src/modules/errors/AppError.ts` define 7 códigos
  genéricos; ~60 respuestas de error, de las cuales ~45 se escriben a mano con `res.status(...).json(...)` en rutas y
  middlewares (`TOO_MANY_REQUESTS` del limitador y `UNAUTHORIZED` del origin check quedan fuera del catálogo). Una
  ruta `/api/...` inexistente con sesión cae al 404 HTML de Express. En el cliente, 9 pantallas y `AuthContext` hacen
  `fetch` directo y muestran `data.error?.message` o un texto fijo; `HomePage` traga los errores.
- **Fuera de alcance:** ver §0, último punto.

## 2. Architecture

```text
SERVER                                                   CLIENT
                                                         
 errors/errorCodes.ts  ── import type (solo tipos) ──▶  errors/messages.ts
 (catálogo: código → status,                            (código → texto de la spec;
  sin imports)                                           + 4 mensajes propios del cliente)
      │                                                        │
      ▼                                                        ▼
 errors/AppError.ts                                     errors/apiError.ts
 (AppError(code, devMessage), sendError,               (lee una respuesta o una falla de
  sendErrorCode, errorHandler, apiNotFound)             red → ClientErrorCode)
      ▲                                                        │
      │ lanzan / responden                                     ▼
 middlewares (auth, origin, rateLimit)                  errors/useApiError.ts (hook)
 rutas y servicios (auth, me, tools,                    (SESSION_REQUIRED → login + vuelta;
  loans, search)                                         resto → texto para la pantalla)
                                                               │
      ── HTTP: { error: { code, message } } ──────────▶  pages/* y NavBar
                                                        (error de carga vs. error de acción)
                                                               │
                                                        contexts/AuthContext
                                                        (markSignedOut, logout que informa)
```

- **`server/src/modules/errors/errorCodes.ts`** (interno, nuevo) — la lista de códigos y el status de cada uno. Sin
  imports: es la única pieza que el cliente también lee (solo sus tipos, y sus valores en un test).
- **`server/src/modules/errors/AppError.ts`** (interno, cambia) — `AppError` toma un código del catálogo y deriva el
  status; único lugar que escribe el JSON de error (`sendError`, `sendErrorCode`, `errorHandler`, `apiNotFound`).
- **Middlewares, rutas y servicios del server** (internos, cambian) — dejan de escribir JSON a mano; lanzan
  `AppError` o llaman `sendErrorCode` con el código específico.
- **`client/src/errors/messages.ts`** (interno, nuevo) — el mapa código → texto, tipado contra el catálogo del server;
  más los 4 mensajes que solo produce el cliente.
- **`client/src/errors/apiError.ts`** (interno, nuevo) — convierte una respuesta fallida o una excepción de `fetch` en
  un `ClientErrorCode`. Nunca devuelve el texto del server.
- **`client/src/errors/useApiError.ts`** (interno, nuevo) — decide la reacción: `SESSION_REQUIRED` → cierra la sesión
  en la app y navega al login con `returnTo` y el aviso 8; cualquier otro → el texto para la pantalla.
- **`AuthContext`** (interno, cambia) — expone `markSignedOut()` y un `logout()` que dice si el server cerró la sesión.
- **Pantallas** (internas, cambian) — usan el hook; separan el error que impide cargar (puede ocupar la pantalla) del
  error de una acción (se muestra arriba del contenido, sin reemplazarlo).

**Decisión principal (D7): el catálogo vive en un archivo del server sin dependencias, y el mapa del cliente se tipa
contra él con un `import type`.** El tipo `Record<ServerErrorCode, string>` hace que `tsc -b` del cliente falle si un
código no tiene mensaje, y el test de AC-5 lo comprueba además en tiempo de ejecución. Se eligió frente a:

- *Duplicar la lista de códigos en el cliente:* más simple de leer, pero la lista del cliente puede quedar vieja sin
  que nada falle hasta producción — exactamente el hueco que AC-5 quiere cerrar.
- *Un paquete compartido (`shared/` como tercer workspace):* lo más prolijo a largo plazo, pero agrega un workspace,
  su build y su lugar en Railpack para un solo archivo. Excesivo para un proyecto de este tamaño.

El `import type` se borra al compilar: el bundle del cliente no incluye nada del server. Funciona porque Railway corre
`npm run build` desde la raíz del monorepo y las dos carpetas existen (riesgo R1, §7).

**Segunda decisión: un hook (`useApiError`) en vez de envolver `fetch`.** Envolver `fetch` en un cliente HTTP propio
tocaría cada llamada y su manejo de `AbortController`; el hook solo cambia qué se hace cuando ya falló, que es lo que
pide la spec. Cada pantalla sigue haciendo su `fetch` como hoy.

## 3. Interfaces & contracts

### 3.1 Catálogo de códigos (server)

```text
ERROR_CODES: { [code]: { status } }        // un código → un status, nunca dos
type ServerErrorCode = keyof ERROR_CODES

// Situaciones de la spec (Main path) — una fila, un código
REGISTER_MISSING_FIELDS        400   fila 1
REGISTER_NAME_LENGTH           400   fila 2
REGISTER_PASSWORD_LENGTH       400   fila 3
REGISTER_EMAIL_TOO_LONG        400   fila 4
EMAIL_TAKEN                    409   fila 5
LOGIN_MISSING_FIELDS           400   fila 6
INVALID_CREDENTIALS            401   fila 7
SESSION_REQUIRED               401   fila 8
PASSWORD_CHANGE_MISSING_FIELDS 400   fila 11
CURRENT_PASSWORD_INCORRECT     401   fila 12
NEW_PASSWORD_LENGTH            400   fila 13
NEW_PASSWORD_BLANK             400   fila 14
ACCOUNT_NOT_FOUND              404   fila 15
ACCOUNT_HAS_ACTIVE_LOANS       409   fila 16
TOOL_MISSING_FIELDS            400   fila 17
TOOL_NAME_LENGTH               400   fila 18
TOOL_DESCRIPTION_TOO_LONG      400   fila 19
TOOL_NOT_FOUND                 404   fila 20
TOOL_NOT_OWNER                 403   fila 21
TOOL_HAS_ACTIVE_LOANS          409   fila 22
TOOL_PAUSED                    409   fila 23
LOAN_DATES_MISSING             400   fila 24
LOAN_START_IN_PAST             400   fila 25
LOAN_END_BEFORE_START          400   fila 26
LOAN_NOTE_TOO_LONG             400   fila 27
LOAN_OWN_TOOL                  400   fila 28
LOAN_DATES_OVERLAP             409   fila 29
LOAN_TRANSITION_INVALID        409   fila 30
LOAN_TRANSITION_WRONG_ROLE     403   fila 31
LOAN_NOT_FOUND                 404   fila 32
SEARCH_QUERY_TOO_LONG          400   fila 33
RATE_LIMITED                   429   fila 35

// Situaciones que solo produce un bug o un cliente roto — mensaje genérico (fila 37)
BAD_REQUEST                    400   cuerpo mal formado, id inválido, página inválida, categoría/estado
                                     inexistente, is_paused ≠ true, status de préstamo faltante, type ≠ pedidos/recibidos
PAYLOAD_TOO_LARGE              413   body > 10 kb
ORIGIN_NOT_ALLOWED             403   origin check (hoy escribe "UNAUTHORIZED" con 403)
TOOL_EDIT_EMPTY                404   PATCH sin ningún campo (hoy 404 "Tool not found"; el status no cambia, ver R6)
API_ROUTE_NOT_FOUND            404   /api/... que no existe (hoy 404 HTML)
INTERNAL_ERROR                 500   todo error no previsto
```

Desaparecen `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` y `TOO_MANY_REQUESTS`: quedarían sin uso, y un
código sin emisor es un mensaje muerto en el cliente. Cada código lleva en el archivo un comentario de una línea con
cuándo se emite (cierra el "área no formulable" de la spec: el catálogo se documenta a sí mismo).

### 3.2 Emisión de errores (server)

```text
new AppError(code: ServerErrorCode, devMessage: string)
  - status = ERROR_CODES[code].status            (no se pasa a mano)
  - devMessage en inglés, para desarrollo

sendError(res, err: unknown, fallbackDevMessage: string) -> void
  - err es AppError → { status, code, message: devMessage }
  - otro → log del error en el server; 500 INTERNAL_ERROR con fallbackDevMessage

sendErrorCode(res, code: ServerErrorCode, devMessage: string) -> void
  - para middlewares y validaciones de ruta que hoy hacen res.status(...).json(...)

errorHandler(err, req, res, next)       // último middleware, como hoy
  - entity.parse.failed → BAD_REQUEST · entity.too.large → PAYLOAD_TOO_LARGE · resto → sendError

apiNotFound(req, res)                   // montado en /api después de wireRoutes y antes del static/SPA
  - → API_ROUTE_NOT_FOUND
```

- **Invariante (AC-5b):** fuera de `errors/`, ningún archivo de `server/src` escribe `{ error: ... }` ni un literal de
  código. Las subclases (`ValidationError`, `NotFoundError`, …) se eliminan: su único valor era fijar un código
  genérico.
- **Dónde se decide cada código:** lo emite quien conoce la situación. Ejemplos: `TOOL_NAME_LENGTH` lo lanzan tanto
  la ruta de crear como `toolRepo.update`; `TOOL_NOT_FOUND` también lo responde la ruta de pedir préstamo cuando la
  herramienta no existe; `TOOL_EDIT_EMPTY` lo decide la ruta PATCH antes de llamar al servicio (cuando no hay campos
  ni pausa), y un `update` que no encuentra la fila sigue siendo `TOOL_NOT_FOUND`.
- **`GET /api/me` con una cuenta borrada** responde `SESSION_REQUIRED` 401 (como hoy, "Not authenticated"):
  `AuthContext` lo trata como "sin sesión" y no muestra nada. `ACCOUNT_NOT_FOUND` es solo para cambiar la contraseña
  o eliminar la cuenta.

### 3.3 Mapa de mensajes (cliente)

```text
type ClientOnlyCode = 'NETWORK_ERROR'      // fila 36
                    | 'UNKNOWN_ERROR'      // fila 37: código desconocido, sin formato, INTERNAL_ERROR y grupo "bug"
                    | 'LOGOUT_FAILED'      // fila 10
                    | 'TOOLS_LOAD_FAILED'  // fila 34
type ClientErrorCode = ServerErrorCode | ClientOnlyCode

MESSAGES: Record<ClientErrorCode, string>     // completo por tipo: falta uno → tsc falla
messageFor(code: ClientErrorCode) -> string
```

- Los códigos del grupo "bug" y `INTERNAL_ERROR` apuntan al mismo texto que `UNKNOWN_ERROR` (fila 37).

### 3.4 Lectura de una falla (cliente)

```text
readApiError(res: Response) -> Promise<ClientErrorCode>
  - cuerpo JSON con error.code ∈ catálogo → ese código
  - código desconocido, sin `error.code`, o cuerpo no JSON → 'UNKNOWN_ERROR'
  - nunca lanza; nunca devuelve el `message` del server

fetchFailureCode(err: unknown) -> ClientErrorCode | null
  - AbortError → null (la pantalla se desmontó: no se muestra nada)
  - cualquier otra excepción de fetch → 'NETWORK_ERROR'
```

- `readApiError` necesita saber qué códigos existen en tiempo de ejecución: el cliente guarda la lista como las
  claves de `MESSAGES` (no importa valores del server; ver D7).

### 3.5 Reacción de la pantalla (cliente)

```text
useApiError() -> { handle(code: ClientErrorCode) -> string | null }
  - code = SESSION_REQUIRED →
      navega a /login?returnTo=<ruta actual + query, encodeURIComponent> con state { notice: 'SESSION_REQUIRED' },
      llama markSignedOut(), devuelve null (la pantalla no muestra nada: se va)
  - otro → devuelve messageFor(code)
  - postcondición: nunca navega por un 401 que no sea SESSION_REQUIRED
```

- **Orden:** primero `navigate`, después `markSignedOut()`, en el mismo evento. Si se invirtiera, `PrivateRoute` vería
  "sin usuario" y redirigiría al login sin el aviso (riesgo R2).
- **El login** muestra el aviso 8 cuando `location.state.notice === 'SESSION_REQUIRED'`, en su `role="alert"`, y lo
  reemplaza por el error del intento siguiente si lo hay. El aviso viaja en el state del router, no en la URL: un enlace
  armado por terceros no puede mostrarlo.
- **"Iniciar sesión para pedir"** (detalle de herramienta) navega a `/login?returnTo=/tools/<id>` sin state: no es un
  error, no muestra el aviso (AC-11, salvedad).

### 3.6 Sesión y "Salir" (cliente)

```text
AuthContext.markSignedOut() -> void            // currentUser = null, sin pedir nada al server
AuthContext.logout() -> Promise<'closed' | 'failed'>
  - POST /api/auth/logout; 2xx → 'closed'; status ≠ 2xx o falla de red → 'failed'
  - no toca currentUser: quien llama decide el orden

NavBar "Salir":
  - 'closed' → navigate('/') y después markSignedOut()  (mismo orden que hoy: primero salir de la página privada)
  - 'failed' → la barra sigue mostrando la sesión; aparece messageFor('LOGOUT_FAILED') en un role="alert" debajo
    de la barra; desaparece en el siguiente intento de "Salir" o al navegar
```

### 3.7 Pantallas

Regla común: **error de carga** (no hay nada que mostrar) puede ocupar la pantalla; **error de acción** se muestra en
un `role="alert"` arriba del contenido, que sigue visible.

| Pantalla | Carga | Acciones | Nota |
|---|---|---|---|
| `LoginPage` | — | login | aviso 8 por state; `INVALID_CREDENTIALS` no navega ni borra el email (AC-12) |
| `RegisterPage` | — | registro | filas 1-5 |
| `HomePage` | listado/búsqueda | — | nuevo estado de error separado de "sin resultados"; prioridad: `NETWORK_ERROR` → 36, `SEARCH_QUERY_TOO_LONG` → 33, `RATE_LIMITED` → 35, cualquier otro → `TOOLS_LOAD_FAILED` (34) |
| `ToolDetailPage` | detalle | pausar, eliminar | `loadError` vs. `actionError` (AC-9b); `returnUrl` → `returnTo` en el botón y el enlace |
| `PublishForm` | herramienta a editar | publicar, guardar | se borran `editErrorMessage` y `publishErrorMessage`; los mensajes de validación de `toolForm.ts` no cambian |
| `RequestLoanPage` | — | pedir | filas 23-29 |
| `LoanDetailPage` | préstamo (+ nombre de la herramienta) | cambiar estado | hoy un error de transición reemplaza el préstamo: pasa a error de acción |
| `MyLoansPage` | dos listas | — | deja "Error al cargar los préstamos": código de la respuesta que falló |
| `ProfilePage` | herramientas + historial | contraseña, eliminar cuenta | deja "Error al cargar el perfil"; `settingsError` ya es de acción |
| `NavBar` | — | salir | §3.6 |

## 4. Data model & flow

**Entidades:** ninguna en la base. Sin migraciones, sin columnas, sin backfill. Los "datos" de este cambio son dos
tablas en código: el catálogo (código → status) y el mapa (código → texto).

**Flujo principal — sesión terminada en una pantalla privada (AC-11):**

1. La persona está en `/loans/42` y toca "Aceptar"; su cookie ya venció, el navegador no la manda.
2. `authMiddleware` no encuentra token → `sendErrorCode(res, 'SESSION_REQUIRED', 'Authentication required')` → 401
   `{ error: { code: 'SESSION_REQUIRED', message: 'Authentication required' } }`.
3. `LoanDetailPage` recibe `!res.ok` → `readApiError(res)` → `'SESSION_REQUIRED'` → `handle(code)`.
4. El hook navega a `/login?returnTo=%2Floans%2F42` con state `{ notice: 'SESSION_REQUIRED' }` y llama
   `markSignedOut()`; la barra pasa a mostrar "Iniciar sesión".
5. `LoginPage` muestra "Tu sesión terminó. Iniciá sesión para continuar." en su alerta.
6. La persona inicia sesión → `safeReturnTo('/loans/42')` → vuelve a `/loans/42`.

**Flujo secundario — búsqueda demasiado larga en el inicio (AC-5c):** `GET /api/tools?q=<61 caracteres>` →
`searchService` lanza `AppError('SEARCH_QUERY_TOO_LONG', …)` → 400 → `HomePage` muestra la fila 33 en su alerta, con
el formulario de búsqueda visible, y no muestra "no hay resultados".

**Tabla de status de referencia (AC-6, "el status no cambia"):** la columna de status de §3.1 es la que el server
responde hoy para cada situación, relevada del código el 2026-11-03. Una excepción a mirar: el origin check responde
hoy 403 (no 401 como dice la spec en *What it must respect*); se mantiene 403.

- **Consistencia:** no hay escrituras nuevas ni transacciones nuevas.
- **Compatibilidad:** server y cliente se despliegan juntos (mismo servicio de Railway), así que no hay ventana con un
  cliente nuevo contra un server viejo. Un cliente viejo en caché contra el server nuevo sigue mostrando
  `error.message` en inglés, como hoy: no empeora.

## 5. Testing strategy

| Criterio | Nivel | Qué afirma | Qué se simula |
|---|---|---|---|
| AC-1 | componente (Testing Library), por pantalla | con una respuesta `{ code conocido, message en inglés }` se ve el texto de la tabla y el inglés no está en el DOM | `fetch` (stub por test) |
| AC-2 | unit (`readApiError`) + 1 componente | código desconocido → `UNKNOWN_ERROR` → fila 37 | `Response` armada a mano |
| AC-3 | unit | cuerpo sin `error.code`, HTML o vacío → `UNKNOWN_ERROR` | `Response` armada a mano |
| AC-4 | unit (`fetchFailureCode`) + componente | `TypeError` de fetch → fila 36; `AbortError` → nada | `fetch` que rechaza |
| AC-5 | unit (cliente), en ejecución | cada clave de `ERROR_CODES` (importado por valor **solo en el test**) tiene texto en `MESSAGES`; se ve fallar quitando una a propósito (evidencia en la verificación) | nada |
| AC-5b | (a) estática (server) + (b) integración (Supertest) | (a) recorre `server/src` y falla si fuera de `errors/` aparece `error: {` dentro de un `.json(` o un literal `code:`; (b) cada emisor no-ruta (rate limit, origin, body mal formado, body grande, ruta inexistente, error inesperado) responde JSON con código ∈ catálogo | (b) DB falsa como en las suites actuales |
| AC-5c | componente (`HomePage`) | 400 `SEARCH_QUERY_TOO_LONG` → fila 33; red caída → 36; 500 → 34; nunca "no hay resultados" junto al error | `fetch` |
| AC-6 | integración (Supertest), una tabla de casos | por cada situación de la spec: dispara el caso real → `{ status, code }` esperado de §3.1 | repos/servicios falsos donde hoy ya se simulan |
| AC-7 | integración | cuerpo = exactamente `{ error: { code, message } }` (sin campos extra) en los casos de AC-6 | ídem |
| AC-8 | integración | error lanzado no previsto → 500 `INTERNAL_ERROR`, cuerpo sin stack/SQL; cliente → fila 37 | servicio que lanza |
| AC-9 | componente | cada alerta de error tiene `role="alert"` | `fetch` |
| AC-9b | componente (`ToolDetailPage`) | pausar/eliminar con 409/403 → mensaje + nombre, estado y botones siguen en pantalla | `fetch` |
| AC-9c | unit (mapa) | `RATE_LIMITED` → texto con "Esperá un minuto" | nada |
| AC-10 | estática (cliente) | fuera de tests, ningún archivo de `client/src` contiene `error?.message`/`error.message` sobre datos de respuesta, ni los textos en inglés conocidos (`Network error`, `Login failed`, `Registration failed`, `Tool not found`, `Failed to`) | nada |
| AC-11 | componente con router (memoria) | desde `/loans/42` un 401 `SESSION_REQUIRED` → ruta `/login?returnTo=%2Floans%2F42`, aviso 8 visible, barra sin sesión; tras login OK → `/loans/42`. Mismo recorrido desde `/tools/7` (pública) | `fetch` |
| AC-12 | componente | login 401 `INVALID_CREDENTIALS` → fila 7, sigue en `/login`, el email escrito sigue en el campo | `fetch` |
| AC-13 | componente (`NavBar` en `App`) | logout con red caída y con 429 → fila 10, la barra sigue con "Salir" y el nombre | `fetch` |
| AC-14 | unit (cliente, entorno node) | lee `02-DOCS/wiki/sdd/specs/error-codes.md`, extrae las filas numeradas de la tabla (tolerando CRLF y quitando la nota en cursiva de la fila 8) y compara cada texto con `MESSAGES[código]` mediante un mapa fila → código fijado en el test | nada: lee el archivo real |

- **No hay e2e automático.** Los recorridos que dependen del entorno real (cookie que vence, limitador en memoria del
  proceso, superposición contra Postgres) se prueban a mano en staging, como pide la spec: respuestas de la API y
  capturas en `02-DOCS/wiki/sdd/verifications/error-codes-<fecha>.md`.
- **Real, no simulado:** el archivo de la spec en AC-14 (es el oráculo); el catálogo en AC-5; el `errorHandler` y el
  orden real de middlewares de `createApp()` en AC-5b(b) (no un router aislado).
- **Tests existentes que afirman textos o códigos viejos** (`'BAD_REQUEST'`, `'Tool not found'`, "Solo podés editar
  tus propias herramientas.") se actualizan en la misma tarea que cambia el emisor: es el reemplazo a propósito que
  la spec permite. Ningún test se borra sin reemplazo.

## 6. Sequencing & dependencies

1. **Catálogo + `AppError` nuevo** (`errorCodes.ts`, `AppError(code, msg)`, `sendErrorCode`, `apiNotFound`, sin
   subclases) — depende de: nada — serial. *Done:* tests unit del catálogo (un status por código) y de `sendError`.
2. **Emisores transversales del server:** `authMiddleware`, `originChecker`, `rateLimit`, `errorHandler`, montaje de
   `apiNotFound` — depende de: 1 — paralelizable con 3-5. *Done:* AC-5b(b).
3. **Módulo auth + me** (registro, login, `GET /me`, contraseña, eliminar cuenta, `accountDeletion`) — depende de: 1
   — paralelizable. *Done:* filas 1-7, 11-16 en la tabla de AC-6.
4. **Módulo tools + search** (crear, editar, pausar, eliminar, detalle, listado; `TOOL_EDIT_EMPTY`) — depende de: 1 —
   paralelizable. *Done:* filas 17-23, 33 y casos "bug" de tools.
5. **Módulo loans** (crear, detalle, transición, listas) — depende de: 1 — paralelizable. *Done:* filas 24-32.
6. **Guardia estática del server (AC-5b a) + AC-7/AC-8** — depende de: 2-5 (falla mientras quede un emisor viejo) —
   serial.
7. **Cliente: `errors/` (mapa, `readApiError`, `fetchFailureCode`)** — depende de: 1 (tipos) — paralelizable con 2-6.
   *Done:* AC-2, AC-3, AC-4 (unit), AC-5, AC-9c, AC-14.
8. **Cliente: sesión** (`AuthContext.markSignedOut`/`logout`, `useApiError`, aviso 8 en `LoginPage`, `returnTo` en
   `ToolDetailPage`, "Salir" en `NavBar`) — depende de: 7 — serial. *Done:* AC-11, AC-12, AC-13.
9. **Cliente: pantallas de cuenta** (`RegisterPage`, `ProfilePage`) — depende de: 8 — paralelizable con 10-11.
10. **Cliente: pantallas de herramientas** (`HomePage`, `ToolDetailPage` carga/acción, `PublishForm`) — depende de: 8
    — paralelizable. *Done:* AC-5c, AC-9b.
11. **Cliente: pantallas de préstamos** (`RequestLoanPage`, `LoanDetailPage`, `MyLoansPage`) — depende de: 8 —
    paralelizable.
12. **Guardia estática del cliente (AC-10) + AC-1/AC-9 completos** — depende de: 9-11 — serial.
13. **Cierre:** verify de toda la rama, prueba en staging (sesión vencida → login → vuelta; demasiados pedidos;
    superposición), archivo de verificación — depende de: todo — serial.

- **Paralelizables (alcance disjunto):** 2, 3, 4, 5 y 7 entre sí; 9, 10 y 11 entre sí.
- **Orden duro:** 1 antes que todo (define los tipos que todo usa); 6 y 12 al final de su lado porque son las guardias
  que fallan mientras quede algo viejo; 8 antes que las pantallas porque todas usan el hook.
- **Presupuesto de revisión** (`config.yaml`: 400 líneas / 12 archivos por tarea): las tareas 3, 4, 5, 10 y 11 son las
  más grandes; `tasks` las parte si un módulo pasa el presupuesto.

## 7. Risks & open decisions

**Riesgos** (de más a menos probable/impactante)

| # | Riesgo | Disparador | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | El `import type` del cliente hacia `server/src` rompe el build | Railpack construye sin la carpeta `server`, o `tsc -b` del cliente rechaza el archivo fuera de `src` | El deploy falla | Tarea 7 corre `npm run build` desde la raíz como en Railway; el archivo del catálogo no tiene imports ni sintaxis no borrable (`erasableSyntaxOnly`). Plan B: un JSON generado en `client/src/errors/` + el test de AC-5 que lo compara con el catálogo |
| R2 | Carrera entre el hook y `PrivateRoute` | `markSignedOut()` se procesa antes que la navegación | Llega al login sin el aviso 8, o con `returnTo` de la ruta equivocada | Orden fijado en §3.5 y test de AC-11 que afirma ruta y aviso |
| R3 | Diff grande y tests viejos que afirman textos | Las tareas 3-5 y 9-11 tocan muchos archivos | Revisiones largas, tests borrados "porque fallaban" | Presupuesto por tarea; la regla de §5 (actualizar, nunca borrar sin reemplazo); el revisor de cada tarea lo controla |
| R4 | AC-14 frágil frente a la spec | Alguien edita la tabla (fila nueva, formato) | El test falla aunque el código esté bien | Es el comportamiento buscado: la tabla es la referencia. El parser solo toma filas `\| <n> \| … \| … \|` y el mensaje de falla dice qué fila difiere |
| R5 | `logout` cambia de comportamiento | "Salir" con 429 (5/min en `/api/auth`) | Antes cerraba en la app; ahora dice que falló | Es lo que pide AC-13; el mensaje explica qué hacer |
| R6 | `TOOL_EDIT_EMPTY` conserva un 404 incorrecto | PATCH sin campos | Status semánticamente equivocado | Solo lo produce un cliente roto; la spec deja los status para otro cambio (suposición "status no cambian"). Anotar en el backlog |
| R7 | Un `AbortError` se muestra como "sin conexión" | La pantalla se desmonta durante un `fetch` | Mensaje falso un instante | `fetchFailureCode` devuelve `null` para `AbortError` (§3.4) |
| R8 | Una ruta `/api/...` inexistente sin sesión responde `SESSION_REQUIRED` y lleva al login | `authMiddleware` está montado en `/api` antes que `apiNotFound` | Solo con un bug del cliente | Aceptado: es JSON del catálogo (AC-5b se cumple) |

**Rollback:** el cambio no toca la base. Revertir el merge (o redeployar el commit anterior en Railway) vuelve todo al
estado previo.

**Decisiones abiertas:** ninguna que bloquee `tasks`. Tomadas en este plan y registradas como D7: catálogo en un
archivo del server sin dependencias con el status de cada código; mapa del cliente tipado con `import type`; hook en
vez de envolver `fetch`; la tabla de la spec como oráculo de AC-14; aviso de sesión terminada en el state del router.
