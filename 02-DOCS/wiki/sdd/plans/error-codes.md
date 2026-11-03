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
> Last updated: 2026-11-03 (revisión con contexto limpio aplicada; ver *Revisions*)

## 0. Global Constraints

Valores exactos que toda tarea respeta. El revisor de cada tarea los lee primero; violarlos es un hallazgo.

- **Forma de toda respuesta de error (sin excepción):** JSON `{ "error": { "code": "<CÓDIGO>", "message": "<texto>" } }`.
  `code` pertenece al catálogo de §3.1. `message` es texto para desarrollo, en inglés, y **nunca** se muestra al
  usuario. Ningún otro campo (`details`, `retryable`, `action`) se agrega en este ciclo.
- **Status HTTP:** cada situación responde el mismo status que antes de este cambio (tabla de §3.1). Única fuente del
  status: el catálogo (un código → un status). Única excepción registrada (D7): cambiar la contraseña de una cuenta
  eliminada → `ACCOUNT_NOT_FOUND` 404.
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
  ruta `/api/...` inexistente con sesión cae al 404 HTML de Express. En el cliente, 9 pantallas hacen `fetch` directo
  y muestran `data.error?.message` o un texto fijo; `HomePage` traga los errores. `AuthContext` no muestra errores:
  trata cualquier falla de `GET /api/me` como "sin sesión", y su `logout()` olvida al usuario aunque el server falle.
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
 rutas y servicios (auth, me, tools,                    (SESSION_REQUIRED → navega al login
  loans, search)                                         y olvida al usuario; resto → texto)
                                                               │
      ── HTTP: { error: { code, message } } ──────────▶  pages/* y NavBar
                                                        (error de carga vs. error de acción)
                                                               │
                                                        contexts/AuthContext
                                                        (markSignedOut, logout que informa)
                                                               │
                                                        App.tsx · <BrowserRouter useTransitions={false}>
                                                        (navegación síncrona: sin carrera con PrivateRoute)
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
- **`client/src/errors/useApiError.ts`** (interno, nuevo) — decide la reacción: `SESSION_REQUIRED` → navega al login
  con `returnTo` y el aviso 8, y olvida al usuario; cualquier otro → el texto para la pantalla. Funciona igual en
  pantallas públicas y privadas: no necesita saber cuál es cuál.
- **`AuthContext`** (interno, cambia) — expone `markSignedOut()` (olvida al usuario sin pedir nada al server) y un
  `logout()` que dice si el server cerró la sesión.
- **`App.tsx`** (interno, cambia) — `<BrowserRouter useTransitions={false}>`. `PrivateRoute` no cambia.
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

**Tercera decisión: navegación síncrona (`<BrowserRouter useTransitions={false}>`).** React Router 7 mete por defecto
cada navegación en un `startTransition`, así que un `setCurrentUser(null)` (actualización urgente) se dibuja antes que
un `navigate()` hecho en el mismo evento: en ese dibujo `PrivateRoute` ve la página privada sin usuario y redirige por
su cuenta, pisando la navegación y su `state` (verificado en `react-router/dist/development/chunk-OB3PAWPO.mjs`: el
`setState` del router usa `startTransition` salvo con `useTransitions === false`). Con `useTransitions={false}` —prop
pública de `BrowserRouter`, documentada en los `.d.ts` de 7.x— la navegación también es urgente: React agrupa las dos
actualizaciones del mismo evento en un solo dibujo, con la ruta nueva y sin usuario, y `PrivateRoute` de la página vieja
ya no se monta. Se eligió frente a guardar un "motivo de cierre" que `PrivateRoute` leyera (versión anterior de este
plan): ese mecanismo necesitaba recordar la página donde ocurrió, saber qué pantallas son privadas y seguía fallando con
una ruta repetida en el historial. **Costo:** la app pierde las transiciones de React al navegar; hoy no usa `lazy` ni
`Suspense`, así que no hay cambio visible. Si algún día se agregan, hay que revisar esta decisión.

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
BAD_REQUEST                    400   cuerpo mal formado, página inválida, categoría/estado inexistente,
                                     is_paused ≠ true, status de préstamo faltante, type ≠ pedidos/recibidos
PAYLOAD_TOO_LARGE              413   body > 10 kb
ORIGIN_NOT_ALLOWED             403   origin check (hoy escribe "UNAUTHORIZED" con 403)
TOOL_EDIT_EMPTY                404   PATCH sin ningún campo sobre una herramienta propia (hoy 404 "Tool not found";
                                     el status no cambia, ver R6). Sobre una ajena sigue siendo TOOL_NOT_OWNER 403
API_ROUTE_NOT_FOUND            404   /api/... que no existe (hoy 404 HTML)
INTERNAL_ERROR                 500   todo error no previsto
```

**Id con formato inválido** (no es UUID, p. ej. `/api/tools/abc`): no entra en `BAD_REQUEST`. El chequeo
`typeof id !== 'string'` de las rutas nunca se cumple (Express siempre da un string), el id llega a Postgres (columna
`UUID`) y hoy responde 500. Sigue siendo `INTERNAL_ERROR` 500 —el status no cambia— y validarlo queda anotado en el
backlog.

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

- **Invariante (AC-5b):** fuera de `errors/`, ningún archivo de `server/src` escribe un cuerpo de error a mano: ni
  la clave `error: {` dentro de un `.json(` (aunque estén en líneas distintas) ni una clave `code:` con un literal.
  Lanzar `new AppError('CÓDIGO', …)` o llamar `sendErrorCode(res, 'CÓDIGO', …)` sí está permitido: el tipo
  `ServerErrorCode` ya impide un código fuera del catálogo.
- **Subclases (`ValidationError`, `NotFoundError`, …):** la tarea 1 las conserva como adaptadores finos sobre el
  `AppError` nuevo (con el código genérico que tienen hoy, que sigue en el catálogo mientras tanto), para que el server
  compile entre tareas. La tarea 6 las borra, junto con los códigos genéricos, cuando ningún archivo las usa.
- **Dónde se decide cada código:** lo emite quien conoce la situación. Ejemplos: `TOOL_NAME_LENGTH` lo lanzan tanto
  la ruta de crear como `toolRepo.update`; `TOOL_NOT_FOUND` y `TOOL_PAUSED` también los responde la ruta de pedir
  préstamo (`loansRoutes.ts`); `TOOL_EDIT_EMPTY` lo decide **el servicio** `edit()`, **después** de comprobar que la
  herramienta existe y es de quien pide (así una ajena sigue respondiendo 403), y un `update` que no encuentra la fila
  sigue siendo `TOOL_NOT_FOUND`.
- **`GET /api/me` con una cuenta borrada** responde `SESSION_REQUIRED` 401 (como hoy, "Not authenticated"):
  `AuthContext` lo trata como "sin sesión" y no muestra nada. `ACCOUNT_NOT_FOUND` es solo para cambiar la contraseña
  o eliminar la cuenta.
- **Excepción registrada al "status no cambia":** cambiar la contraseña busca hoy al usuario con `findById`, que no
  filtra `deleted_at`. Al eliminar una cuenta, su contraseña guardada se reemplaza por una al azar
  (`accountDeletion.ts:47-51`), así que una cuenta eliminada (p. ej. con un token viejo en otro dispositivo) recibe
  siempre 401 y la persona leería la fila 12, "La contraseña actual no es correcta", que es engañosa. La ruta pasa a
  `findActiveById`: una cuenta eliminada responde `ACCOUNT_NOT_FOUND` 404 (fila 15). Las validaciones previas (400)
  no cambian. Eliminar la cuenta ya responde 404 hoy en ese caso (`accountDeletion.ts:21-27`, también cuando dos
  borrados corren a la vez), así que ahí no hay excepción. Es la única excepción del plan; está en D7 y su test la
  nombra.

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

- `readApiError` necesita saber qué códigos existen en tiempo de ejecución: el cliente usa las claves de `MESSAGES`
  **menos** las cuatro de `ClientOnlyCode` (no importa valores del server; ver D7). Si el server mandara
  `NETWORK_ERROR`, se trata como desconocido.
- **Respuesta 2xx con forma inválida** (p. ej. `PublishForm` cargando la herramienta a editar): la pantalla la trata
  como `UNKNOWN_ERROR`.

### 3.5 Reacción de la pantalla (cliente)

```text
useApiError() -> { handle(code: ClientErrorCode) -> string | null }
  - code = SESSION_REQUIRED →
      navigate('/login?returnTo=<pathname + search, encodeURIComponent>', { replace: true, state: SESSION_NOTICE })
      y después markSignedOut(), en el mismo evento; devuelve null (la pantalla no muestra nada: se va)
  - otro → devuelve messageFor(code)
  - postcondición: nunca navega por un 401 que no sea SESSION_REQUIRED
  - una pantalla que recibe varios SESSION_REQUIRED en el mismo evento llama handle una sola vez

SESSION_NOTICE = { notice: 'SESSION_REQUIRED' }   // objeto constante del módulo, no uno nuevo en cada llamada
```

- **Por qué funciona (riesgo R2):** con `useTransitions={false}` (§2, tercera decisión) la navegación y
  `markSignedOut()` se dibujan juntas; `PrivateRoute` de la página vieja nunca ve "sin usuario". Vale igual en una
  pantalla pública (detalle de herramienta) que en una privada. `PrivateRoute` no cambia: sin usuario y sin haber
  pasado por el hook (nunca hubo sesión, recarga, "atrás" a una página privada) sigue llevando al login con `returnTo`,
  sin aviso, como hoy.
- **El login** muestra el aviso 8 solo si `location.state.notice === 'SESSION_REQUIRED'` **y** no hay sesión abierta,
  en su `role="alert"`, y lo reemplaza por el error del intento siguiente si lo hay. El aviso viaja en el state del
  router, no en la URL: un enlace armado por terceros no puede mostrarlo.
- **Al entrar, el login reemplaza su entrada del historial:** `navigate(returnTo, { replace: true })` (hoy agrega una
  entrada nueva, `LoginPage.tsx:45`). Así "atrás" después de iniciar sesión no vuelve al login con el aviso viejo; y
  si volviera por otro camino, la condición "sin sesión abierta" lo oculta.
- **"Iniciar sesión para pedir"** (detalle de herramienta) navega a `/login?returnTo=/tools/<id>` sin state: no es un
  error, no muestra el aviso (AC-11, salvedad).

### 3.6 Sesión y "Salir" (cliente)

```text
AuthContext.markSignedOut() -> void
  - currentUser = null; no pide nada al server
AuthContext.logout() -> Promise<'closed' | 'failed'>
  - POST /api/auth/logout; 2xx → 'closed'; status ≠ 2xx (p. ej. 429 por el límite de 5/min en /api/auth) o falla
    de red → 'failed'
  - no toca currentUser: quien llama decide el orden

NavBar "Salir":
  - 'closed' → navigate('/') y después markSignedOut(), en el mismo evento (con useTransitions={false} se dibujan
    juntas: desde una página privada termina en '/', no en el login)
  - 'failed' → la barra sigue mostrando la sesión; aparece messageFor('LOGOUT_FAILED') en un role="alert" debajo
    de la barra; desaparece en el siguiente intento de "Salir" o al navegar
```

- `authContext.test.tsx` llama hoy `logout()` y espera que olvide al usuario: la tarea 8 lo actualiza al contrato nuevo.

### 3.7 Pantallas

Regla común: **error de carga** (no hay nada que mostrar) puede ocupar la pantalla; **error de acción** se muestra en
un `role="alert"` arriba del contenido, que sigue visible.

| Pantalla | Carga | Acciones | Nota |
|---|---|---|---|
| `LoginPage` | — | login | aviso 8 por state; `INVALID_CREDENTIALS` no navega ni borra el email (AC-12) |
| `RegisterPage` | — | registro | filas 1-5 |
| `HomePage` | listado/búsqueda | — | nuevo estado de error separado de "sin resultados"; prioridad: `NETWORK_ERROR` → 36, `SEARCH_QUERY_TOO_LONG` → 33, `RATE_LIMITED` → 35, cualquier otro → `TOOLS_LOAD_FAILED` (34). Hoy dispara un pedido por tecla sin cancelar el anterior: cada pedido nuevo **cancela el anterior** (`AbortController`), así una respuesta vieja —de error o de éxito— nunca pisa a la nueva. Un pedido cancelado **no toca ningún estado**: ni lista, ni error, ni `loading` (tampoco en el `finally`, que hoy vacía la lista y apaga `loading`). Esperar entre teclas (*debounce*) queda fuera (backlog) |
| `ToolDetailPage` | detalle | pausar, eliminar | `loadError` vs. `actionError` (AC-9b); `returnUrl` → `returnTo` en el botón y el enlace |
| `PublishForm` | herramienta a editar | publicar, guardar | se borran `editErrorMessage` y `publishErrorMessage`; los mensajes de validación de `toolForm.ts` no cambian; carga 2xx con forma inválida → `UNKNOWN_ERROR` |
| `RequestLoanPage` | — | pedir | filas 23-29 |
| `LoanDetailPage` | préstamo (+ nombre de la herramienta) | cambiar estado | hoy un error de transición reemplaza el préstamo: pasa a error de acción |
| `MyLoansPage` | dos listas en paralelo | — | deja "Error al cargar los préstamos"; regla de dos pedidos (abajo) |
| `ProfilePage` | herramientas + historial en paralelo | contraseña, eliminar cuenta | deja "Error al cargar el perfil"; regla de dos pedidos (abajo); una falla del historial, que hoy se ignora, pasa a ser error de carga; `settingsError` ya es de acción |

**Regla de dos pedidos en paralelo** (`MyLoansPage`, `ProfilePage`): los dos pedidos se esperan con
`Promise.allSettled` (hoy `Promise.all`, que pierde el resultado del otro si uno falla por red). Cada pedido termina en
"éxito" o en un `ClientErrorCode` (respuesta fallida → `readApiError`; excepción → `fetchFailureCode`, que cuenta como
falla de ese pedido). Prioridad: si alguno dio `SESSION_REQUIRED`, gana y se llama `handle` una sola vez; si no, se
muestra el código del primer pedido de la lista que falló (préstamos pedidos antes que recibidos; herramientas antes
que historial). Si los dos se cancelaron (`AbortError`), no se muestra nada.
| `NavBar` | — | salir | §3.6 |

## 4. Data model & flow

**Entidades:** ninguna en la base. Sin migraciones, sin columnas, sin backfill. Los "datos" de este cambio son dos
tablas en código: el catálogo (código → status) y el mapa (código → texto).

**Flujo principal — sesión terminada en una pantalla privada (AC-11):**

1. La persona está en `/loans/42` y toca "Aceptar"; su cookie ya venció, el navegador no la manda.
2. `authMiddleware` no encuentra token → `sendErrorCode(res, 'SESSION_REQUIRED', 'Authentication required')` → 401
   `{ error: { code: 'SESSION_REQUIRED', message: 'Authentication required' } }`.
3. `LoanDetailPage` recibe `!res.ok` → `readApiError(res)` → `'SESSION_REQUIRED'` → `handle(code)`.
4. El hook navega (con `replace`) a `/login?returnTo=%2Floans%2F42` con state `{ notice: 'SESSION_REQUIRED' }` y
   llama `markSignedOut()`; con la navegación síncrona, las dos cosas se dibujan juntas y la barra pasa a mostrar
   "Iniciar sesión".
5. `LoginPage` muestra "Tu sesión terminó. Iniciá sesión para continuar." en su alerta.
6. La persona inicia sesión → `safeReturnTo('/loans/42')` → vuelve a `/loans/42`, reemplazando la entrada del login
   en el historial.

**Flujo secundario — búsqueda demasiado larga en el inicio (AC-5c):** `GET /api/tools?q=<61 caracteres>` →
`searchService` lanza `AppError('SEARCH_QUERY_TOO_LONG', …)` → 400 → `HomePage` muestra la fila 33 en su alerta, con
el formulario de búsqueda visible, y no muestra "no hay resultados".

**Tabla de status de referencia (AC-6, "el status no cambia"):** la columna de status de §3.1 es la que el server
responde hoy para cada situación, relevada del código el 2026-11-03. Una excepción a mirar: el origin check responde
hoy 403 (no 401 como dice la spec en *What it must respect*); se mantiene 403. La única excepción al "status no
cambia" es `ACCOUNT_NOT_FOUND` al cambiar la contraseña (§3.2).

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
| AC-5b | (a) estática (server) + (b) integración (Supertest) | (a) recorre `server/src` y falla si fuera de `errors/` aparece `error: {` dentro de un `.json(` **aunque estén en líneas distintas** (patrón multilínea), o una clave `code:` con un literal; evidencia: verla fallar contra una copia del `origin.ts` actual y del `rateLimit.ts` actual, y después pasar; (b) cada emisor no-ruta (rate limit, origin, body mal formado, body grande, ruta inexistente, error inesperado) responde JSON con código ∈ catálogo, usando `createApp()` real | (b) base de datos inalcanzable por URL, como en `originWiring.test.ts` |
| AC-5c | componente (`HomePage`) | 400 `SEARCH_QUERY_TOO_LONG` → fila 33; red caída → 36; 500 → 34; nunca "no hay resultados" junto al error; una respuesta vieja que llega después de la nueva no cambia lo que se ve | `fetch` |
| AC-6 | integración (Supertest), una tabla de casos | por cada situación de la spec: dispara el caso real → `{ status, code }` esperado de §3.1; incluye PATCH vacío sobre herramienta ajena → 403 `TOOL_NOT_OWNER`, y el caso de la excepción (`ACCOUNT_NOT_FOUND` 404) nombrado como tal | repos/servicios falsos donde hoy ya se simulan |
| AC-7 | integración | cuerpo = exactamente `{ error: { code, message } }` (sin campos extra) en los casos de AC-6 | ídem |
| AC-8 | integración | error lanzado no previsto → 500 `INTERNAL_ERROR`, cuerpo sin stack/SQL; cliente → fila 37 | servicio que lanza |
| AC-9 | componente | cada alerta de error tiene `role="alert"` | `fetch` |
| AC-9b | componente (`ToolDetailPage`) | pausar/eliminar con 409/403 → mensaje + nombre, estado y botones siguen en pantalla | `fetch` |
| AC-9c | unit (mapa) | `RATE_LIMITED` → texto con "Esperá un minuto" | nada |
| AC-10 | estática (cliente) | fuera de tests, ningún archivo de `client/src` contiene `error?.message`/`error.message` sobre datos de respuesta, ni los textos en inglés conocidos (`Network error`, `Login failed`, `Registration failed`, `Tool not found`, `Failed to`) | nada |
| AC-11 | componente con el `App` real (trae su propio `BrowserRouter`: no se le puede anidar un `MemoryRouter`); la ruta inicial se fija con `window.history.pushState`, como en `App.test.tsx` | desde `/loans/42` un 401 `SESSION_REQUIRED` → ruta `/login?returnTo=%2Floans%2F42`, aviso 8 visible, barra sin sesión; tras login OK → `/loans/42`, y "atrás" no vuelve a mostrar el aviso. Mismo recorrido desde `/tools/7` (pública). Perfil con los dos pedidos en 401 → una sola navegación; perfil con 401 + red caída → gana `SESSION_REQUIRED` | `fetch` |
| AC-12 | componente | login 401 `INVALID_CREDENTIALS` → fila 7, sigue en `/login`, el email escrito sigue en el campo | `fetch` |
| AC-13 | componente (`NavBar` en el `App` real, ruta inicial con `window.history.pushState`) | logout con red caída y con 429 → fila 10, la barra sigue con "Salir" y el nombre. Además, "Salir" que funciona **desde `/profile`** termina en `/` (no en el login); y después de "Salir", volver con "atrás" a una página privada (`/loans`, aunque esté repetida en el historial) lleva al login con `returnTo=%2Floans` y sin aviso | `fetch` |
| AC-14 | unit (cliente, entorno node) | lee `02-DOCS/wiki/sdd/specs/error-codes.md`, extrae las filas numeradas de la tabla (tolerando CRLF y quitando la nota en cursiva de la fila 8) y compara cada texto con `MESSAGES[código]` mediante un mapa fila → código fijado en el test | nada: lee el archivo real |

- **No hay e2e automático.** Los recorridos que dependen del entorno real (cookie que vence, limitador en memoria del
  proceso, superposición contra Postgres) se prueban a mano en staging, como pide la spec: respuestas de la API y
  capturas en `02-DOCS/wiki/sdd/verifications/error-codes-<fecha>.md`. La búsqueda demasiado larga (AC-5c) se prueba
  en staging **pegando** el texto de 61 caracteres, no tecleándolo: teclearlo dispara un pedido por letra y salta antes
  el límite de 30/min (fila 35).
- **Lectura de archivos en tests del cliente** (AC-10, AC-14): corren en entorno `node` de Vitest. Que `tsc -b` del
  cliente acepte `node:fs` (hoy `types` es solo `["vite/client"]`) se confirma en la tarea 7; si no, se agregan los
  tipos de Node solo para los tests.
- **Real, no simulado:** el archivo de la spec en AC-14 (es el oráculo); el catálogo en AC-5; el `errorHandler` y el
  orden real de middlewares de `createApp()` en AC-5b(b) (no un router aislado).
- **Tests existentes que afirman textos o códigos viejos** (`'BAD_REQUEST'`, `'Tool not found'`, "Solo podés editar
  tus propias herramientas.") se actualizan en la misma tarea que cambia el emisor: es el reemplazo a propósito que
  la spec permite. Ningún test se borra sin reemplazo.

## 6. Sequencing & dependencies

1. **Catálogo + `AppError` nuevo** (`errorCodes.ts`, `AppError(code, msg)`, `sendErrorCode`, `apiNotFound`; las
   subclases quedan como adaptadores y los códigos genéricos siguen en el catálogo) — depende de: nada — serial.
   *Done:* tests unit del catálogo (un status por código) y de `sendError`; `tsc -b` y la suite del server en verde.
2. **Emisores transversales del server:** `authMiddleware`, `originChecker`, `rateLimit`, `errorHandler`, montaje de
   `apiNotFound` — depende de: 1 — paralelizable con 3-5. *Done:* AC-5b(b). Tests: `middleware.test.ts`,
   `originWiring.test.ts`, `rateLimitIsolation.test.ts`, `securityAc.test.ts`, `errors.test.ts` (salvo el bloque
   `UserRepository.create`, que es de la 3), y la aserción `'TOO_MANY_REQUESTS'` de `authRoutes.test.ts:175-176` (la
   única línea de ese archivo que toca esta tarea: el código lo cambia el limitador).
3. **Módulo auth + me** (registro, login, `GET /me`, contraseña con `findActiveById`, eliminar cuenta,
   `accountDeletion`) — depende de: 1 — paralelizable. *Done:* filas 1-7, 11-16 en la tabla de AC-6. Tests:
   `authRoutes` (salvo la aserción del limitador, de la 2), `authService`, `authValidation`, `meAccountRoutes`,
   `accountDeletion`, `userRepo`, y el bloque `UserRepository.create` de `errors.test.ts` (hoy afirma
   `ConflictError`; pasa a `EMAIL_TAKEN`). La 2 y la 3 tocan bloques distintos de `errors.test.ts` y de
   `authRoutes.test.ts`: si corren en paralelo, se integran una después de la otra.
4. **Módulo tools + search** (crear, editar, pausar, eliminar, detalle, listado; `TOOL_EDIT_EMPTY` en el servicio) —
   depende de: 1 — paralelizable. *Done:* filas 17-22, 33 y casos "bug" de tools. Tests: `toolsRoutes`,
   `toolService`, `toolRepo`, `toolDetail`, `searchService`, `searchRepo`, `t030_routes` (también cubre `/api/me/*`:
   lo toma esta tarea entero).
5. **Módulo loans** (crear —incluye `TOOL_NOT_FOUND` y `TOOL_PAUSED` de `loansRoutes.ts`—, detalle, transición,
   listas) — depende de: 1 — paralelizable. *Done:* filas 23-32. Tests: `loansRoutes`, `loanService`, `loanRepo`.
6. **Guardia estática del server (AC-5b a) + AC-7/AC-8; se borran las subclases y los códigos genéricos** — depende
   de: 2-5 (falla mientras quede un emisor viejo) y de 7 (borra las entradas genéricas de `client/src/errors/messages.ts`,
   que crea la 7) — serial. Tests: reescribe los usos de subclases que quedan en `errors.test.ts` (el `it.each` con
   `ValidationError`/`ForbiddenError`/`NotFoundError`/`ConflictError` y el PATCH con `new NotFoundError`), y el mapa
   del cliente.
7. **Cliente: `errors/` (mapa, `readApiError`, `fetchFailureCode`)** — depende de: 1 (tipos) — paralelizable con 2-5.
   *Done:* AC-2, AC-3, AC-4 (unit), AC-5, AC-9c, AC-14; `npm run build` desde la raíz en verde (R1); `node:fs` en
   tests aceptado por `tsc -b`. Nota: mientras los códigos genéricos sigan en el catálogo (hasta la tarea 6), el mapa
   los apunta a la fila 37; la tarea 6 borra esas entradas del mapa junto con los códigos.
8. **Cliente: sesión** (`useTransitions={false}` en `App.tsx`, `AuthContext.markSignedOut` y `logout` que informa,
   `useApiError`, aviso 8 y `navigate(returnTo, { replace: true })` en `LoginPage`, `returnTo` en `ToolDetailPage`,
   "Salir" en `NavBar`) — depende de: 7 — serial. *Done:* AC-11, AC-12, AC-13; `App.test.tsx` y
   `authContext.test.tsx` actualizados y en verde.
9. **Cliente: pantallas de cuenta** (`RegisterPage`, `ProfilePage`) — depende de: 8 — paralelizable con 10-11.
10. **Cliente: pantallas de herramientas** (`HomePage`, `ToolDetailPage` carga/acción, `PublishForm`) — depende de: 8
    — paralelizable. *Done:* AC-5c, AC-9b.
11. **Cliente: pantallas de préstamos** (`RequestLoanPage`, `LoanDetailPage`, `MyLoansPage`) — depende de: 8 —
    paralelizable.
12. **Guardia estática del cliente (AC-10) + AC-1/AC-9 completos** — depende de: 9-11 — serial.
13. **Cierre:** verify de toda la rama, prueba en staging (sesión vencida → login → vuelta; demasiados pedidos;
    superposición), archivo de verificación — depende de: todo — serial.

- **Paralelizables (alcance disjunto, archivos y tests asignados arriba):** 2, 3, 4, 5 y 7 entre sí (2 y 3 con la
  salvedad de los dos archivos de test compartidos por bloques); 9, 10 y 11 entre sí. `ToolDetailPage` lo tocan la 8 (`returnTo`) y la 10 (carga/acción): por eso la 10 va después de la 8.
- **Orden duro:** 1 antes que todo (define los tipos que todo usa); 6 y 12 al final de su lado porque son las guardias
  que fallan mientras quede algo viejo; 6 después de 7 porque limpia el mapa que crea la 7; 8 antes que las pantallas
  porque todas usan el hook.
- **Cada tarea deja `tsc -b`, lint y las suites de server y client en verde.** Por eso las subclases y los códigos
  genéricos sobreviven hasta la tarea 6.
- **Presupuesto de revisión** (`config.yaml`: 400 líneas / 12 archivos por tarea): las tareas 3, 4, 5, 10 y 11 son las
  más grandes; `tasks` las parte si un módulo pasa el presupuesto.

## 7. Risks & open decisions

**Riesgos** (de más a menos probable/impactante)

| # | Riesgo | Disparador | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | El `import type` del cliente hacia `server/src` rompe el build | Railpack construye sin la carpeta `server`, o `tsc -b` del cliente rechaza el archivo fuera de `src` | El deploy falla | Tarea 7 corre `npm run build` desde la raíz como en Railway; el archivo del catálogo no tiene imports ni sintaxis no borrable (`erasableSyntaxOnly`). Plan B: un JSON generado en `client/src/errors/` + el test de AC-5 que lo compara con el catálogo |
| R2 | Carrera entre una navegación y `PrivateRoute` | React Router 7 aplica la navegación en un `startTransition`; `markSignedOut()` se dibuja antes | Llega al login sin el aviso 8, o "Salir" termina en el login | Confirmado en la revisión. Mitigado con `<BrowserRouter useTransitions={false}>` (§2, tercera decisión). Tests de AC-11 y AC-13 con el `App` real. Si en el futuro se agrega `lazy`/`Suspense`, revisar la decisión |
| R3 | Diff grande y tests viejos que afirman textos | Las tareas 3-5 y 9-11 tocan muchos archivos | Revisiones largas, tests borrados "porque fallaban" | Presupuesto por tarea; la regla de §5 (actualizar, nunca borrar sin reemplazo); el revisor de cada tarea lo controla |
| R4 | AC-14 frágil frente a la spec | Alguien edita la tabla (fila nueva, formato) | El test falla aunque el código esté bien | Es el comportamiento buscado: la tabla es la referencia. El parser solo toma filas `\| <n> \| … \| … \|` y el mensaje de falla dice qué fila difiere |
| R5 | `logout` cambia de comportamiento | "Salir" con 429 (5/min en `/api/auth`) | Antes cerraba en la app; ahora dice que falló | Es lo que pide AC-13; el mensaje explica qué hacer |
| R6 | `TOOL_EDIT_EMPTY` conserva un 404 incorrecto | PATCH sin campos | Status semánticamente equivocado | Solo lo produce un cliente roto; la spec deja los status para otro cambio (suposición "status no cambian"). Anotar en el backlog |
| R7 | Un `AbortError` se muestra como "sin conexión" | La pantalla se desmonta durante un `fetch` | Mensaje falso un instante | `fetchFailureCode` devuelve `null` para `AbortError` (§3.4) |
| R8 | Una ruta `/api/...` inexistente sin sesión responde `SESSION_REQUIRED` y lleva al login | `authMiddleware` está montado en `/api` antes que `apiNotFound` | Solo con un bug del cliente | Aceptado: es JSON del catálogo (AC-5b se cumple) |
| R9 | Teclear en la búsqueda agota el límite de 30/min | Un pedido por tecla en `HomePage` | La persona ve la fila 35 escribiendo una búsqueda larga | Cancelar el pedido anterior evita respuestas viejas, pero no reduce la cantidad de pedidos. El *debounce* va al backlog |
| R10 | La guardia estática no detecta nada | Patrón de una sola línea frente a emisores escritos en varias | AC-5b pasa en falso | Patrón multilínea y evidencia de que falla contra el `origin.ts` y el `rateLimit.ts` actuales (§5) |

**Rollback:** el cambio no toca la base. Revertir el merge (o redeployar el commit anterior en Railway) vuelve todo al
estado previo.

**Decisiones abiertas:** ninguna que bloquee `tasks`. Tomadas en este plan y registradas como D7: catálogo en un
archivo del server sin dependencias con el status de cada código; mapa del cliente tipado con `import type`; hook en
vez de envolver `fetch`; la tabla de la spec como oráculo de AC-14; aviso de sesión terminada en el state del router;
navegación síncrona (`useTransitions={false}`) para que navegar y olvidar al usuario se dibujen juntos;
`ACCOUNT_NOT_FOUND` como única excepción al "status no cambia".

**Para el backlog (fuera de este cambio):** validar que los ids sean UUID (hoy un id mal formado da 500); esperar
entre teclas en la búsqueda (*debounce*); el 404 de `TOOL_EDIT_EMPTY`.

## Revisions

- 2026-11-03 — Primera versión (`draft`).
- 2026-11-03 — Revisión de un agente con contexto limpio (pedida por Hernán). Veredicto: `Problemas encontrados`, 9
  hallazgos y 8 notas, todos verificados contra el código antes de cambiar el plan. Cambios: (1) la carrera con
  `PrivateRoute` es real (React Router 7 navega en un `startTransition`): el destino tras perder la sesión lo decide
  `PrivateRoute` según un motivo guardado en `AuthContext`, y "Salir" deja de navegar después del `await`; (2) la
  tarea 1 conserva las subclases como adaptadores y la 6 las borra, para no dejar el server sin compilar; (3) la fila
  23 pasa a la tarea 5 y cada test compartido tiene una sola tarea; (4) `TOOL_EDIT_EMPTY` se decide en el servicio,
  después de comprobar el dueño (una ajena sigue en 403); (5) cambiar la contraseña usa `findActiveById`: excepción
  registrada al "status no cambia"; (6) regla para dos pedidos en paralelo y la falla del historial del perfil;
  (7) `HomePage` cancela el pedido anterior y AC-5c se prueba pegando el texto; (8) el "id inválido" sale de
  `BAD_REQUEST`; (9) la guardia estática usa un patrón multilínea y se la ve fallar. Notas aplicadas: `replace` en
  las navegaciones con aviso, regla de §3.2 acotada a `error: {`/`code:`, `readApiError` sin códigos solo-cliente,
  correcciones de §1 y AC-5b(b), 2xx con forma inválida → `UNKNOWN_ERROR`, tipos de Node en tests a confirmar.
- 2026-11-03 — Hueco propio del arreglo (1), encontrado antes de la segunda revisión: el motivo del cierre quedaba
  pegado, y volver con "atrás" a otra página privada después de "Salir" llevaba al inicio en vez de al login. El motivo
  pasa a guardar la página donde ocurrió (`{ reason, from }`) y `PrivateRoute` solo lo usa en esa página. Test
  agregado en AC-13.
- 2026-11-03 — Segunda revisión de un agente con contexto limpio, acotada a lo que cambió (pedida por Hernán).
  Veredicto: `Problemas encontrados`, 8 hallazgos (1 alta, 4 media, 3 baja), todos verificados contra el código.
  Cambios: (1) se reasignan los tests que una tarea rompía a otra (`authRoutes.test.ts:175` → tarea 2; bloque
  `UserRepository.create` de `errors.test.ts` → tarea 3; la 6 reescribe los usos de subclases) y la 6 depende de la 7;
  (2) **se reemplaza el "motivo de cierre" por `<BrowserRouter useTransitions={false}>`**: con la navegación síncrona,
  navegar y olvidar al usuario se dibujan juntos, el hook y "Salir" navegan ellos mismos y `PrivateRoute` no cambia.
  Esto elimina `{ reason, from }`, la necesidad de saber qué pantallas son privadas y el caso de la ruta repetida en el
  historial; (3) la regla de dos pedidos usa `Promise.allSettled` y cuenta la falla de red como falla de ese pedido;
  (4) se corrige el porqué de la excepción de `ACCOUNT_NOT_FOUND`: hoy la persona caería en la fila 12, y la fila 15 ya
  se alcanza al eliminar la cuenta; (5) el login reemplaza su entrada del historial al entrar, y el aviso 8 solo se ve
  sin sesión abierta; (6-8, bajas) un pedido cancelado en el inicio no toca ningún estado, los tests de AC-11/AC-13
  fijan la ruta con `window.history.pushState`, el `state` del aviso es un objeto constante y `authContext.test.tsx`
  se actualiza en la tarea 8.
