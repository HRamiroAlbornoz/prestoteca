---
type: plan
title: Plan — Toda entrada externa del server validada por un esquema declarado
description: El plan a nivel de estructura para zod-routes — esquemas por ruta, orden de las reglas, errores previos a la ruta, control de la suite, pruebas y orden de construcción.
tags: [sdd, plan, validation, server]
timestamp: 2026-11-23T19:30:00Z
topic: sdd
slug: zod-routes
status: approved
approved: 2026-11-23
approved_by: Hernán — "Apruebo el plan, con las tres recomendaciones." (ítem por ítem, no en autopiloto, tras tres revisiones con ojos frescos)
branch: docs/zod-routes-spec
---

# Plan — Toda entrada externa del server validada por un esquema declarado

> Spec: [../specs/zod-routes.md](../specs/zod-routes.md) (approved 2026-11-23) · Constitution:
> [../constitution.md](../constitution.md) v1.3.0 · Decisiones: D15, D16, D17 y D18 en [../decisions.md](../decisions.md)
> · Status: approved (2026-11-23) · Last updated: 2026-11-23

## 0. Global Constraints

Valores exactos que toda tarea respeta. El revisor de cada tarea los lee primero; violarlos es un hallazgo.

- **Nada cambia salvo la tabla de la spec** (*What result they get*): mismo status, mismo código, mismo `message` de
  desarrollo palabra por palabra, misma precedencia. También entre dos reglas con el mismo código. Dos excepciones de
  `message`, que salen de filas de la spec y no cambian status ni código: (a) una página que hoy se acepta (`1abc`) junto
  con otro parámetro repetido pasa de `Search parameters must be text` a `Page must be a positive integer`; (b) un `PATCH`
  a una herramienta propia con un nulo en `name` o `description` **y** categoría o condición inválida pasa de `Invalid
  category` / `Invalid condition` a `Text cannot contain a null character`.
- **Forma de error (sin cambios):** `{ "error": { "code", "message" } }`, siempre por `sendErrorCode` / `AppError`.
- **Código nuevo:** `LOAN_DATE_INVALID`, status 400, fila 40. Texto al usuario, exacto:
  `Las fechas tienen que ser días reales del calendario, con el formato AAAA-MM-DD.`
- **Mensajes de desarrollo nuevos, exactos** (ninguno repite el valor recibido):
  - carácter nulo: `Text cannot contain a null character`
  - fecha mal formada: `Dates must be real calendar days in YYYY-MM-DD format`
  - cuerpo ilegible: `Unreadable request body`
  - id mal codificado: `Malformed URL`
  - red de seguridad de un esquema sin regla: `Invalid request data`
- **Página:** `^[0-9]+$` y valor entre 1 y `Number.MAX_SAFE_INTEGER` (9007199254740991). Ausente o `''` = 1.
- **Carácter nulo:** `\u0000`. Es **la última regla** de los seis esquemas que la llevan (registro, login, listado,
  publicar, editar y préstamo): pierde contra todas las anteriores a la base. Los demás no la llevan.
- **Recortar** = `String.prototype.trim`. El email se pasa a minúsculas y **después** se mide contra 254.
- **Zod 4.6.7. Reglas comprobadas el 2026-11-23, de cumplimiento obligatorio:**
  - **clave que puede faltar, con regla de campo** (`is_paused`, `name` y `description` de la edición, `page`, `q`,
    `category` y `neighborhood` del listado, la nota): lleva `.optional()` y su regla acepta `undefined`. Sin
    `.optional()`, una clave ausente falla con un error de Zod sin código (`expected nonoptional`);
  - **clave requerida con regla de campo** (`status`, `type`, `id`): **no** lleva `.optional()`. Con `.optional()` Zod ignora
    los problemas de una clave ausente y la deja pasar (`{}` valdría);
  - **clave cuya regla compite con las de otros campos** (categoría y condición al publicar, las dos contraseñas del cambio,
    y `remember`, que se revisa **después** de "falta"): el campo no falla (`z.unknown().optional()`) y la regla es un
    `.refine` **del objeto**. Con una regla de campo, `{ "remember": "x" }` sin email daría `BAD_REQUEST` en vez de
    `LOGIN_MISSING_FIELDS`;
  - **clave sin regla** (categoría y condición de la edición): `z.unknown().optional()`;
  - `z.string().trim().catch('')` devuelve `''` ante ausencia o tipo equivocado, y nunca falla;
  - `.refine(…, { abort: true })` corta: la regla siguiente no corre;
  - los problemas de campo salen en el orden de las claves del esquema, y los `.refine` del objeto no corren si un campo
    abortó;
  - `z.iso.date()` coincide con el calendario en todos los días de los años 0000 a 2400 (0 diferencias).
- **Prohibido** `ctx.addIssue({ code: '…' })` y cualquier clave `code: '…'` fuera de `modules/errors`
  (`errorGuard.test.ts`). Las reglas se arman solo con `rule(…)`. El código de la red de seguridad va en una constante
  (`FALLBACK_CODE`), no como `code: 'BAD_REQUEST'`.
- **`zod` se importa solo** en `modules/validation/`, en los archivos `*Schemas.ts` y en `modules/config/env.ts`.
- **`req.body`, `req.query`, `req.params`, `req.url`, `req.originalUrl`, `req.path` y `req.baseUrl` se leen solo** en
  `modules/validation/requestInput.ts`. Única excepción: `req.path` en `server/src/index.ts` (la página de la app).
- **Sin conversión de tipos** en el cuerpo; el mismo esquema para JSON y formulario; los campos desconocidos se ignoran.
- **Fuera de alcance, no tocar:** la cookie de sesión, `Origin`, límites de pedidos, `backup/`, formularios del cliente,
  formato UUID, formato de email.
- **Pruebas viejas:** ninguna expectativa cambia, salvo la fila 40 en tres archivos: `client/src/errors/messages.test.ts`
  (39 → 40 filas), `server/tests/errorCodes.test.ts` (suma `LOAN_DATE_INVALID: 400`) y
  `client/src/pages/requestLoan.test.tsx` (C1 suma el caso `LOAN_DATE_INVALID`, por AC-15, y su comentario pasa de 8 a 9
  códigos).
- **Calidad:** `tsc -b` en 0 (server y cliente), oxlint del cliente en 0, TDD, cobertura de líneas ≥ 80 % por archivo
  cambiado. **Sin dependencias nuevas.**
- **rsc:** siempre la versión fijada en `.rsc.json` (`npx @ericrisco/rsc@4.1.8`), nunca `@latest` ni sin versión.
- **Git:** rama + PR, autoría de Hernán, sin `Co-Authored-By` ni "generated with". Tier 2 (toca auth): panel de 3 y
  aprobación de Hernán en **cada tarea** que mida tier 2 (sus dependientes esperan), y otra vez sobre la rama entera antes
  del push.
- **Deploy a staging:** `railway up -e staging --service prestoteca --ci`; **nunca** `railway service source connect`.

## 1. Context & constraints

- **Qué fija el diseño:** gana el mismo error que hoy (AC-2); las reglas previas corren sin base ni hashes (AC-9); las de
  `PATCH /api/tools/:id` que corren después de la base quedan ahí (AC-10b); una ruta futura no puede leer entrada sin
  esquema (AC-14); ningún error repite el valor recibido (AC-16).
- **Lo que ya existe:** Zod 4.6.7 en el server (solo `env.ts`); 15 lecturas directas de `req.*` en 12 rutas (la spec
  muestra 11 filas porque junta `GET` y `DELETE` de una herramienta); las pruebas
  montan los routers **sin** el manejador de errores, así que un esquema que falle tiene que responder en la misma ruta.
- **Constitución:** principios 4, 5, 6, 8, 10, 13 y 16. Ninguno se dobla.
- **No funcional:** sin medida de latencia. Validar un objeto de a lo sumo 5 campos es despreciable frente a la base.

## 2. Architecture

```text
 pedido ─▶ helmet ─▶ express.json / urlencoded ──error──▶ unreadableBody ─┐ (traduce y pasa)
                            │                                             │
                            ▼                                             ▼
        límites ⇄ Origin ─▶ sesión ─▶ ruta ──id %zz (URIError)──▶ errorHandler ─▶ { error: { code, message } }
                                       │
                                       ▼
                 readBody / readQuery / readParams (requestInput) ──▶ esquema de la ruta (*Schemas.ts)
                                       │                                   usa rule() y piezas (rules)
                      ok: datos limpios │ no ok: code + message ─▶ sendErrorCode
                                       ▼
                             servicio / repositorio ─▶ Postgres (external)
```

Todo es interno salvo Postgres.

- **`modules/validation/rules.ts`** (nuevo) — `rule(code, message)` y las piezas repetidas de campo. No conoce Express.
- **`modules/validation/requestInput.ts`** (nuevo) — único lugar que lee cuerpo, query e id. Aplica un esquema y devuelve
  datos o el primer error.
- **`*Schemas.ts`** (nuevos: `auth/authSchemas.ts`, `tools/toolSchemas.ts`, `loans/loanSchemas.ts`,
  `me/meAccountSchemas.ts`) — las reglas de cada ruta, de arriba a abajo en el orden en que ganan.
- **`tools/toolOptions.ts`** (nuevo) — las listas de categorías y condiciones, hoy copiadas en el servicio y el
  repositorio.
- **Rutas** — pierden los chequeos a mano. Conservan la sesión primero, el servicio y las respuestas.
- **`errors/AppError.ts`** — suma `unreadableBody` y un caso en `errorHandler` (id mal codificado).
- **`tests/inputGuard.test.ts`** (nuevo) — el control de AC-14.

**Top architectural decision: un esquema por ruta, con las reglas en cadena y la primera que falla gana.** Cada esquema
hace dos cosas: primero normaliza los campos sin fallar (recorta; lo ausente o de otro tipo queda en `''`) y después
revisa reglas con `.refine(…, { abort: true })`, cada una con su código y su mensaje. El archivo se lee de arriba a abajo
en el mismo orden que hoy tienen los `if`, así que la precedencia (AC-2) queda a la vista. Se descartaron:

- **el esquema "natural"** (`z.string().min(…)` por campo): junta los errores por campo, y hoy gana "falta cualquiera"
  antes que "largo de cualquiera". Cambiaría respuestas sin que una prueba lo note;
- **un middleware por ruta** (`validate(schema)`): correría antes del chequeo de sesión del manejador y obligaría a
  guardar los datos en `req`. La spec descarta además el middleware genérico;
- **lanzar `AppError` desde el lector**: las pruebas montan routers sin `errorHandler`, y recibirían HTML en vez del JSON.

## 3. Interfaces & contracts

### 3.1 `validation/rules.ts`

```text
rule(code: ServerErrorCode, message: string) -> opciones de una regla de Zod
  - lleva error = message, params = { errorCode: code }, abort = true
text            -> campo: texto recortado; ausente u otro tipo = ''; nunca falla
optionalText(message) -> campo: ausente o texto (sin recortar); otro tipo (null incluido) = BAD_REQUEST con ese message
hasNul(value: string | null | undefined) -> boolean
idParams(message) -> esquema { id: string }; si no es texto, BAD_REQUEST con ese message
```

`rules.ts` exporta también `toolIdParams` y `loanIdParams`, hechos con `idParams` (`Invalid tool ID` / `Invalid loan ID`).
Viven acá para que herramientas y préstamos no dependan uno del otro.

### 3.2 `validation/requestInput.ts`

```text
type Input<T> = { ok: true, data: T } | { ok: false, code: ServerErrorCode, message: string }

readBody(req, schema)   -> Input<T>   un cuerpo ausente, o que es una lista, cuenta como un objeto vacío
readQuery(req, schema)  -> Input<T>
readParams(req, schema) -> Input<T>
  - usa safeParse; si falla, responde el PRIMER problema: su errorCode y su message
  - comprueba en ejecución que errorCode es una clave propia de ERROR_CODES (para Zod, params es `any`)
  - un problema sin errorCode válido (un esquema mal escrito) -> BAD_REQUEST "Invalid request data", nunca el texto de Zod
  - no responde, no lanza, no registra: la ruta decide con sendErrorCode
```

Uso en toda ruta, en este orden: sesión (como hoy) → `readParams` → `readBody` o `readQuery` → servicio.

### 3.3 Esquemas: entrada → salida y orden de las reglas

El número es el orden en que ganan. "BR" = `BAD_REQUEST`. Los mensajes existentes se copian **de la
ruta** de hoy, no del servicio ni del repositorio, que tienen otros para el mismo código. Los tres casos ambiguos: `The tool
name must be between 3 and 60 characters`, `The tool description must be at most 500 characters` y `Page must be a positive
integer`. `Search query must be at most 60 characters`, `Invalid category` e `Invalid condition` se copian del servicio
(la ruta no los tiene).

| Esquema | Salida | Reglas, en orden |
| --- | --- | --- |
| `registerBody` | `{ name, email, password, neighborhood }` recortados, email en minúsculas | 1 falta alguno → `REGISTER_MISSING_FIELDS` · 2 nombre 2-50 → `REGISTER_NAME_LENGTH` · 3 contraseña 8-72 → `REGISTER_PASSWORD_LENGTH` · 4 email en minúsculas > 254 → `REGISTER_EMAIL_TOO_LONG` · 5 barrio → `REGISTER_NEIGHBORHOOD_INVALID` · 6 nulo en `name` o `email` → BR |
| `loginBody` | `{ email, password, remember: boolean }`, textos recortados, email en minúsculas | 1 falta → `LOGIN_MISSING_FIELDS` · 2 `remember` presente y no booleano → BR · 3 nulo en `email` → BR |
| `toolListQuery` | `{ page: number, q?, category?, neighborhood? }` sin recortar | 1 página → BR · 2 `q`, `category`, `neighborhood` no texto → BR · 3 `q` > 60 → `SEARCH_QUERY_TOO_LONG` · 4 nulo en cualquiera de los tres → BR |
| `toolIdParams`, `loanIdParams` | `{ id: string }` | 1 no es texto → BR `Invalid tool ID` / `Invalid loan ID` |
| `publishToolBody` | `{ name, description, category, condition }` | 1 falta (los "falsos" en categoría y condición cuentan) → `TOOL_MISSING_FIELDS` · 2 nombre 3-60 → `TOOL_NAME_LENGTH` · 3 descripción > 500 → `TOOL_DESCRIPTION_TOO_LONG` · 4 categoría fuera de la lista → BR `Invalid category` · 5 condición → BR `Invalid condition` · 6 nulo en `name` o `description` → BR |
| `editToolBody` | `{ is_paused?, name?, description?, category?: unknown, condition?: unknown }`, textos recortados | 1 `is_paused` presente y no `true` → BR · 2 `name` o `description` no texto → BR · 3 nulo en `name` o `description` → BR. Categoría y condición pasan **sin revisar**: las decide el servicio después de la base |
| `loanRequestBody(getToday)` | `{ startDate, endDate, note: string \| null }` | 1 nota ni ausente, ni `null`, ni texto → BR · 2 falta una fecha → `LOAN_DATES_MISSING` · 3 nota recortada > 300 → `LOAN_NOTE_TOO_LONG` · 4 fecha que no pasa `z.iso.date()` → `LOAN_DATE_INVALID` · 5 inicio < hoy → `LOAN_START_IN_PAST` · 6 fin < inicio → `LOAN_END_BEFORE_START` · 7 nulo en la nota → BR. Nota `''` o de espacios → `null` |
| `loanStatusBody` | `{ status: string }` sin recortar | 1 falta o "falso" → BR `Missing status` · 2 no texto → BR `Status must be text` |
| `loanListQuery` | `{ type: 'pedidos' \| 'recibidos' }` | 1 otro valor → BR |
| `passwordChangeBody` | `{ currentPassword, newPassword }` recortadas | 1 alguna no es texto o es `''` (sin recortar) → `PASSWORD_CHANGE_MISSING_FIELDS` · 2 nueva de solo espacios → `NEW_PASSWORD_BLANK` · 3 nueva recortada fuera de 8-72 → `NEW_PASSWORD_LENGTH` |

- `loanRequestBody` es una función porque "hoy" se inyecta en las pruebas. Se arma **una vez por router**; llama a
  `getToday()` en cada pedido.
- `editToolBody` tiene que conservar **qué campos llegaron**: la ruta arma `updates` solo con los definidos. `{}` sigue
  llegando al servicio y da `TOOL_EDIT_EMPTY` después de la base.
- **Tipos, sin casts** (comprobado con `tsc` estricto):
  - `publishToolBody` termina en un `.pipe(z.object(…))` con `z.custom<ToolCategory>(isValidCategory, rule(…))` (lo mismo
    con la condición), y la regla 6 va después del `pipe`. El tipo va **escrito**: `z.custom` no lo toma del predicado y sin
    él da `unknown`;
  - `ToolService.edit` recibe `category?: unknown` y `condition?: unknown`. Las **saca a variables**, las afina con
    `isValidCategory` / `isValidCondition` en el mismo lugar de hoy y llama a `repo.update` con esas variables; afinar
    `updates.category` no afina el objeto. Las claves que no llegaron **no aparecen** en lo que recibe `repo.update`, ni con
    valor `undefined`; se prueba con `toStrictEqual` sobre ese argumento (`toHaveBeenCalledWith` ignora `undefined`). Se va
    el `as never` de la ruta;
  - `passwordChangeBody`: la regla 1 sobre `z.unknown().optional()`, después `.pipe(…)` con dos `z.string().trim()`, y
    recién ahí las reglas 2 y 3.
- Los chequeos de `SearchService` (`page < 1`, `q` > 60) **se quedan**: los fijan sus pruebas unitarias.
- Cada esquema se prueba también suelto (§5): hay reglas que por la ruta no se distinguen o no se alcanzan.

### 3.4 `tools/toolOptions.ts`

```text
VALID_CATEGORIES, VALID_CONDITIONS
tipos ToolCategory y ToolCondition (los valores de cada lista)
isValidCategory(value: unknown) -> boolean (afina a ToolCategory)
isValidCondition(value: unknown) -> boolean (afina a ToolCondition)
```

Los usan el esquema, `ToolService` y `ToolRepository`. Los chequeos del servicio y del repositorio **se quedan** (los
fijan sus pruebas unitarias, y el de `edit` es el que corre después de la base); solo dejan de tener copia de la lista.
Cierra la primera decisión diferida de la spec (D18).

### 3.5 Errores antes de la ruta

```text
unreadableBody(err, req, res, next)      manejador de errores, justo después de express.urlencoded
  - status entero 400-499 y type distinto de 'entity.parse.failed' y 'entity.too.large'
      -> next(AppError BAD_REQUEST "Unreadable request body")
  - cualquier otro -> next(err) sin tocar (los dos tipos de arriba los sigue resolviendo errorHandler, como hoy)

errorHandler: caso nuevo
  - err es URIError Y err.status === 400 -> BAD_REQUEST "Malformed URL", sin log
  - un URIError sin status (un bug propio) sigue siendo 500 y va al log
```

Por qué un manejador pegado a los lectores y no una regla general por `err.status`: un gzip corrupto trae status 400 y
**ningún** `type`, y el 404 de servir un archivo también trae status. El lugar donde se monta es lo que dice de quién es
el error. Comprobado el 2026-11-23: charset y `Content-Encoding` 415, gzip y br corruptos 400 sin `type`, anidado 400,
1100 campos 413 `parameters.too.many` (pasa a 400), más de 10 kb 413 `entity.too.large` (también comprimido).

### 3.6 `LOAN_DATE_INVALID`

`errorCodes.ts` (sección Loans, `row 40`), `client/src/errors/messages.ts`, las tres pruebas de §0 y la spec
[error-codes](../specs/error-codes.md) (fila 40 después de la 27 y una entrada en *Revisions*). **Todo en el mismo
commit**: la prueba del cliente lee la tabla de la spec y se pone en rojo si llega por separado.

**El hook de documentos de rsc** commitea `02-DOCS/` por su cuenta cuando no hay código sin commitear. Por eso la fila 40 se
escribe en la spec **solo con el código del paso 6 ya en el mismo árbol, sin commitear**, y entre ese commit y el merge no
se mergea otro PR de documentos que la lleve (ya pasó con la fila 39, PR #48). Control: `git show --stat` de ese commit
lista `errorCodes.ts`, `errorCodes.test.ts`, `messages.ts`, `messages.test.ts`, `requestLoan.test.tsx` y
`specs/error-codes.md`.

### 3.7 Control de la suite (`tests/inputGuard.test.ts`)

Recorre `server/src` con el compilador de TypeScript (ya es dependencia de desarrollo, 6.0.x) y falla si encuentra:

1. una lectura de las siete propiedades de §0, fuera de los lugares permitidos: por punto (también `?.`), por corchetes
   (también con una constante), desarmando el objeto al declarar o al asignar, o con clave calculada;
2. un `.param(…)` o `['param'](…)` de router o de app;
3. un `import`, `export … from` o `import()` de `zod` o de una subruta (`zod/v4`, `zod/mini`) fuera de los lugares de §0 (así una ruta no puede armar un `z.any()`
   en línea).

Reconoce el pedido por **dónde está declarada la propiedad** (la interfaz `Request` de `@types/express-serve-static-core` o
`IncomingMessage` de Node), sobre el tipo sin `undefined`; no por el nombre de la variable ni por la forma del tipo. Cuenta
también si la propiedad se **vuelve a declarar** en un tipo que hereda de esos dos o se cruza con ellos (`interface LoginReq
extends Request { body: X }`, `Request & { body: X }`). Sobre un valor `any` solo cuentan `body`, `query` y `params`. Las muestras malas se pasan **en memoria**, todas en **un solo**
programa, con un tiempo máximo propio: la prueba no escribe archivos en `src/`.

Borrador probado el 2026-11-23 con TypeScript 6.0.3: encuentra las 15 lecturas de hoy en ~1 s, más las dos permitidas
(`req.path` en `index.ts`, `zod` en `env.ts`), detecta 21 de 21 muestras y no da falsas alarmas con `pool.query(…)`, un objeto
propio con `params` y `path`, ni una fila `any` con `.url`. **Límites aceptados (R4), escritos en la prueba:**
`Reflect.get(req, 'body')`, `Object.entries(req)` y `Object.values(req)`; `(req as any)._parsedUrl`; desarmar al asignar en
forma anidada, en una lista o en un `for…of`; un tipo propio que no hereda del pedido, con o sin cast (parámetro o variable `{ body: … }`,
`Omit<Request, 'body'> & …`); una clave `string` o `url`/`path` sobre `any`; `.param` por `.call`, `.bind` o desarmado; leer
el pedido a mano (`req.on('data')`, `for await`); `require` de `zod`; y reexportar `z` desde `rules.ts`.

## 4. Data model & flow

**Entidades:** ninguna nueva. **Migración:** ninguna; no cambia ninguna tabla ni dato guardado.

**Flujo principal** (pedido de préstamo, `endDate: "mañana"`)

1. `express.json` lee el cuerpo; límites, `Origin` y sesión pasan como hoy.
2. La ruta llama a `readParams` y después a `readBody` con `loanRequestBody`.
3. El esquema recorta, ve que no falta nada y que la nota entra, y falla en la regla 4.
4. La ruta responde 400 `LOAN_DATE_INVALID`. No hubo consultas después de la sesión.

- **Consistencia:** sin cambios. El cambio de contraseña sigue dentro de su transacción.
- **Vuelta atrás:** revertir el PR. Lo único que queda distinto son contraseñas cambiadas mientras estuvo activo, que se
  guardaron recortadas; con el código viejo se entra igual, porque el login ya recorta.

## 5. Testing strategy

Niveles: **unit** (esquema o función), **app** (la app real con `createApp`, sesión y repositorios espiados, sin base) y
**staging** (Postgres real).

- **Espías de la base:** `Pool.prototype.query` **y** `Pool.prototype.connect` (usuarios y transacciones usan `connect`),
  instalados **antes** de `createApp` (`wireRoutes` hace `pool.query.bind`), más `bcrypt`. Se descuenta la consulta de la
  sesión. Una prueba de control muestra que los espías **sí** ven un registro, un login y un cambio de contraseña válidos.
- **"Hoy" fijo en la app real:** `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime`, como en `server-sessions`,
  con `2027-01-01T12:00:00Z`. A medianoche UTC en Tucumán todavía es 2026-12-31.
- **Límites de pedidos:** `/api/auth` da 5 por minuto, y `POST /api/tools/:id/loans` pasa **dos veces** por el límite
  general (`routes.ts:44` y `:52`), así que el pedido 16 de una misma prueba da 429. Un `it.each` por entrada, o
  `resetRateLimiter()` entre pedidos.
- **Toda prueba afirma código y `message`.** Con solo el código no se ven los pares de igual código.
- **Unitarias por esquema:** `safeParse` directo sobre cada regla, afirmando `errorCode` y `message` del **primer**
  problema. Se afirma además **un solo** problema cuando la regla rota es la única o es del objeto. No cuando se rompen dos
  reglas de campo a la vez (listado, edición, categoría y condición al publicar): ahí Zod junta 2 o 3 y vale el primero.
  Cubren lo que por la ruta no se distingue: `abort`, `idParams`, condición al publicar (el servicio la repite).
- **Archivos** en `server/tests/` (`.test.ts`): paso 1 `zodTodayAuth` (registro, login, contraseña), `zodTodayTools` y
  `zodTodayLoans`; después uno por paso: 2 `zodPreRoute`, 3 `zodValidation`, 4 `zodAuth`, 5 `zodTools`, 6 `zodLoans`,
  7 `zodPassword`, 8 `inputGuard`, 9 `zodSweep`.
- **Ids en el nombre de cada prueba**, entre corchetes: `[AC-n]`, `[P-…]` (pares), `[B-n]` (bordes de AC-18), `[M-n]` (reglas
  de hoy) y `[FILA-n]` (filas de respuestas nuevas), según las listas de abajo. Se comprueban sobre el **informe JSON** de la
  corrida, donde solo cuentan las pruebas que pasaron (un comentario o una prueba salteada no valen).
- **Qué se simula en `PATCH /api/tools/:id`:** se espía `findById`; `ToolRepository.update` queda **real**, porque ahí viven
  el largo del nombre y de la descripción. Solo se espía en la prueba del `toStrictEqual`.
- **Ayuda común** (base falsa, sesión, espías): `server/tests/zodHelpers.ts`, creada en el paso 1 y **congelada** después.
  Si un paso posterior necesita más, va en otro archivo: editarla cambiaría la caracterización sin que se note.

| Criterio | Nivel | Qué afirma | Qué simula |
| --- | --- | --- | --- |
| AC-1, AC-18 | app | cada borde de la spec, todos; **se escribe y pasa contra el código viejo antes del refactor** | repositorios |
| AC-2 | app | una prueba por par consecutivo con código distinto (lista abajo); los pares de hoy pasan también en el código viejo | repositorios |
| AC-3, AC-4, AC-4b, AC-4c, AC-5, AC-5b, AC-6 | unit (tabla de fechas) + app | código exacto por entrada; "hoy" fijo en 2027-01-01 con inicio 2027-01-10; 4b: la base no se consulta | `getToday`, repositorios |
| AC-7, AC-8 | app | 400 o 200 por valor, y la página que recibe el repositorio | `ToolRepository.findAll` |
| AC-9 | app | por cada regla previa de cada ruta: 0 consultas después de la sesión y 0 llamadas a bcrypt | sesión |
| AC-10, AC-10b | app | 404 por entidad (error 22P02 simulado); `TOOL_NOT_OWNER` con categoría inválida | repositorios |
| AC-11 | app | sin sesión: campos inválidos → `SESSION_REQUIRED`; JSON mal formado → `BAD_REQUEST` | — |
| AC-12 | app | registro y login por formulario: mismos códigos; `remember=true` → `BAD_REQUEST` | repositorios |
| AC-13, 13b, 13c, 13d, 13e, 13f | app, con bcrypt **real** (costo 4 al sembrar) | login con la contraseña recién cambiada; códigos de cada caso; borrar la cuenta sigue en 204 | repositorios con un hash real |
| AC-14 | unit (control) | los 4 casos de la spec más los alias fallan; `server/src` pasa | — |
| AC-15, AC-19 | cliente | AC-15: la pantalla del pedido muestra el texto de la fila 40 ante `LOAN_DATE_INVALID` (caso nuevo en C1 de `requestLoan.test.tsx`); AC-19: 40 filas | `fetch` |
| AC-16 | unit + app | por cada esquema y por los dos errores previos: un valor marcador enviado no aparece en `message` | — |
| AC-20 | app | cada campo con nulo; cada campo exento; `%00` → 404; `PATCH` con pausa no pausa | repositorios |
| AC-21, AC-22 | app | status y código; `console.error` sin llamadas en los 400; 413 sigue. **Solo AC-22:** también sin `Origin`, sin sesión y con el límite agotado. **AC-21:** con `Origin` y sin agotar el límite (si no, ganan 403 y 429, como hoy); afirma `Malformed URL`. Un error propio que **llega** a `errorHandler` (`sendFile` simulado que falla con `status: 404`) da 500 y va al log; `{ status: 500 }`, `{ status: 302 }` y `{ status: 400.5 }` pasan por `unreadableBody` sin tocar | `sendFile` solo en ese caso |
| AC-23 | app | campo desconocido en cada ruta con cuerpo o query | repositorios |
| AC-24 | unit + app | `İ` × 254 → `REGISTER_EMAIL_TOO_LONG`; una `İ` que entra en 254 se acepta | repositorios |
| AC-17 | staging | antes y después de cada entrada, escrito en el archivo de verificación | nada |

**Pares de AC-2, por ruta** (gana el primero):

Son 51. **N** = nuevo: no va en el paso 1. **2** = dos variantes: la de hoy en el paso 1 y la nueva en su paso. **=** = mismo
código y distinto `message` (por §0, también conserva el orden). Todo lo que no es **N** va en el paso 1: 43.

| Ruta | Pares (id: gana / pierde) |
| --- | --- |
| registro `P-reg` | 1 falta/nombre · 2 nombre/contraseña · 3 contraseña/email · 4 email/barrio **2** (255 letras; `İ`) · 5 barrio/nulo · 6 nulo/email ya usado **N** |
| login `P-log` | 1 falta/`remember` · 2 falta/nulo · 3 `remember`/credenciales · 4 nulo/credenciales **N** · 5 `remember`/nulo **=** |
| listado `P-lis` | 1 página/`q` larga **2** (`page=0`; `page=1abc`) · 2 tipo/`q` larga (se repite `category` o `neighborhood`) · 3 `q` larga/nulo · 4 página/tipo **2** **=** |
| publicar `P-pub` | 1 falta/nombre · 2 nombre/descripción · 3 descripción/categoría · 4 categoría/condición **=** · 5 condición/nulo **=** |
| editar `P-edi` | 1 `is_paused`/no existe · 2 tipo/no existe · 3 nulo/no existe **N** · 4 no existe/vacía · 5 no existe/categoría · 6 ajena/vacía · 7 ajena/categoría · 8 categoría/nombre corto · 9 condición/nombre corto · 10 nombre corto/descripción vacía · 11 nombre corto/descripción larga · 12 `is_paused`/tipo **=** · 13 tipo/nulo **=** · 14 categoría/condición **=** · 15 nulo/categoría **N** **=** (excepción (b) de §0) |
| préstamo `P-pre` | 1 tipo de nota/falta · 2 falta/nota larga · 3 nota larga/fecha · 4 fecha/ya pasó **N** · 5 fecha/fin antes **N** · 6 ya pasó/fin antes · 7 fin antes/no existe · 8 fin antes/nulo · 9 nulo/no existe **N** |
| estado `P-est` | 1 falta/no existe · 2 tipo/no existe · 3 falta/tipo **=** |
| contraseña `P-con` | 1 falta/solo espacios · 2 solo espacios/largo **N** · 3 largo/cuenta inexistente · 4 largo/actual incorrecta |

**Bordes de AC-18, `B-1` a `B-14`:** los 14 puntos de la lista de bordes de la spec, en su orden. Cada uno lleva todos los
casos de su punto.

**Reglas de *What it must respect* que ya valen hoy:** `M-1` un tipo inesperado en un texto cuenta como "falta" (registro,
login, publicar, fechas del préstamo, contraseñas); `M-2` sin cuerpo, o con un `Content-Type` ajeno = cuerpo vacío; `M-3` JSON
mal formado, o de nivel superior que no es objeto ni lista, → 400 antes de la sesión; `M-4` `q`, `category` o `neighborhood`
repetido → 400; `M-5` descripción vacía al editar → 400 `TOOL_MISSING_FIELDS`; `M-6` id que no es UUID → 404; `M-7` la regla
de `remember`; `M-8` lo que cada ruta recorta (registro y login con email en minúsculas, fechas, nota); `M-9` las mismas
reglas por formulario.

**Filas de respuestas nuevas, `FILA-1` a `FILA-21`:** las 21 filas de *What result they get*, en su orden. Cada una lleva
todos los casos de su fila, también los que no tienen AC propio (fechas ya pedidas, `İ` con barrio inválido, `"  abcdef  "`
con la actual incorrecta o la cuenta borrada).

- **Línea e2e:** no hay pruebas de navegador nuevas. La pantalla solo suma un texto, que cubren la prueba de la
  tabla y la de AC-15.
- **Real sí o sí:** bcrypt en AC-13 a AC-13f; Postgres en AC-17 (los 500 de hoy son deducidos); el lector del cuerpo y el
  router de Express en AC-21 y AC-22.
- **Mutantes mínimos:** sacar el esquema de una ruta (lo mata el control); sacar cada regla de cada esquema; intercambiar cada par de la lista; quitar `abort` de `rule()` (lo
  mata una regla **del objeto** que no sea la última; en `z.custom` es equivalente, porque ya corta solo); quitar un
  `.optional()`; **agregarlo** a `status`, `type` o `id`; medir el email antes de minúsculas; sacar el recorte de cada
  contraseña; `unreadableBody` para todo error, para 5xx, para menos de 400, sin exigir entero, o montado al final; el `URIError` sin mirar el status; `readBody`
  sin tratar la lista como vacía; devolver el texto de Zod en la red de seguridad (una prueba con `z.string()` sin regla);
  llamar a `getToday()` una sola vez por router (una prueba con dos "hoy" en el mismo router). **Ninguno se deja en la
  suite.** Reparto: cada paso corre los suyos (2, 3: su código; 4 a 7: las reglas y los pares de sus esquemas, y sus
  `.optional()`); el 9, los que cruzan todo (sacar el esquema de una ruta, `abort`, `readBody`, la red de seguridad,
  `unreadableBody` montado al final). Uno que sobrevive se justifica por escrito como equivalente, o se agrega la prueba.
- **Huecos heredados que se cubren en el paso 1** (hoy las 817 pruebas no los ven): préstamo con fin igual al inicio;
  `PATCH` que guarda `name` y `description` recortados; `q` de exactamente 60 por la ruta → 200.

## 6. Sequencing & dependencies

Un solo PR desde `main`, con un commit por paso. Cada paso termina con las suites en verde y `tsc -b` en 0.

0. **PR de documentos** (`docs/zod-routes-spec`: spec, plan con su tabla de tareas, `analysis/zod-routes.md`, decisiones y
   el cierre de `loan-date-test`) a `main`, **antes** de abrir la rama de código — depende de: `tasks` y `analyze` hechos —
   serial.

**En los pasos 4 a 7 entran, además de lo que lista cada uno:** las unitarias de su esquema y todos sus pares de AC-2,
también los nuevos y los de igual código. La evidencia de cada paso va en `progress/zod-routes.md`.

1. **Caracterización**, en los tres archivos `zodToday*`: `B-1` a `B-14`, los 43 pares que no son **N**, `M-1` a `M-9`, AC-6,
   AC-8, AC-10, AC-10b, AC-11, AC-12, AC-23, los campos exentos de AC-20 (menos la fecha del préstamo, que hoy da otra cosa:
   va en el paso 6) y los huecos heredados de §5. Verde contra el código de hoy, **sin tocar `src/`** — depende de: 0 —
   serial.
2. **Errores antes de la ruta** (§3.5): AC-21, AC-22 — depende de: 1 (usa la ayuda común) — paralelizable con 3 a 7.
3. **`validation/` y sus pruebas unitarias** (§3.1, §3.2) — depende de: 1 (si entra antes, el paso 1 deja de poder mostrar
   `src/` sin cambios) — paralelizable con 2.
4. **Registro y login**: AC-9, AC-20 y AC-24 de esas rutas — depende de: 1, 3 — paralelizable con 5, 6 y 7.
5. **Herramientas y búsqueda**, con `toolOptions.ts`: AC-7, AC-8, AC-9, AC-20 — depende de: 1, 3 — paralelizable.
6. **Préstamos y fila 40**, server + cliente + spec error-codes: AC-3 a AC-6, AC-9, AC-15, AC-19, AC-20 — depende de: 1,
   3 — paralelizable.
7. **Cambio de contraseña**: AC-9, AC-13 a AC-13f, AC-20 (nulo en una contraseña) — depende de: 1, 3 — paralelizable.
8. **Control de la suite** (§3.7): AC-14 — depende de: 4, 5, 6, 7 (antes está en rojo por las 15 lecturas) — serial.
9. **Barrido**: lo que falte de `FILA-1` a `FILA-21` y de cada AC con su prueba por la app real; AC-16; los mutantes que
   cruzan todo. Control de ids sobre los archivos **nuevos** (los AC ya aparecen en pruebas de otras features) — depende de:
   2, 8 — serial.
10. **Puerta de push de tier 2, en local** — depende de: 9:
    - `npm test` y `npx tsc -b` en `server/`; `npm test`, `npx tsc -b` y `npm run lint` en `client/`;
      `npm run build` en la raíz; `npx vitest run --coverage --coverage.reporter=json-summary` en los dos y, en
      `coverage/coverage-summary.json`, ≥ 80 % de líneas por archivo cambiado (la tabla de texto recorta nombres y omite
      archivos);
    - seguridad: skill `security-audit` sobre el diff (toca entrada y auth);
    - pruebas viejas: `git diff --no-renames --diff-filter=MD --name-only origin/main -- server/tests client/src | grep "test\."` lista
      exactamente las de §0, y su diff no cambia ningún `expect` salvo los de la fila 40;
    - `npx @ericrisco/rsc@4.1.8 risk --base origin/main` → tier 2;
      `npx @ericrisco/rsc@4.1.8 spec gate 02-DOCS/wiki/sdd/specs/zod-routes.md` → PASS (la rama `feat/zod-routes` se enlaza con la
      spec por el nombre; no hace falta `branch:`);
    - panel de 3 y `npx @ericrisco/rsc@4.1.8 review ledger panel zod-routes/closing --lenses correctness,security,tests`, **después del
      último commit de código**.
11. **Staging** (AC-17): **primero** se despliega `main` (para saber qué código es el "antes") y se miden las entradas;
    después se despliega la rama y se repiten; al final `node server/scripts/smoke.mjs <url de staging>` con salida 0, que recorre los
    caminos buenos con Postgres real (esperando el minuto de `/api/auth`). Queda en `verifications/zod-routes-<fecha>.md`.
    Si obliga a tocar código, se repite 10 — depende de: 10.
12. **Aprobación de Hernán** → push → PR → merge → lista de deploys de los dos entornos →
    `node server/scripts/smoke.mjs <url de producción>` con salida 0; después, cierre de documentos (F1 de `analyze` deja de
    aplicar) — depende de: 11.

**Receta de staging:**

- dos cuentas `qa-zod-*@example.com` (dueño y quien pide) y una herramienta; `Origin` de staging; dos registros, el login
  con nulo y el registro con `İ` son 4 de los 5 pedidos por minuto de `/api/auth`;
- **los cuerpos con `İ`, `ñ` o nulo van con escapes JSON** (una barra invertida seguida de `u0130`, `u00f1` o `u0000`), desde
  un archivo (`--data-binary @archivo`) o un script de Node, **nunca** como argumento de `curl`: Git Bash manda `İ` como `I`
  (comprobado), y el registro daría 201 sin probar nada. Un 201 con `İ` es un error de medición: se revisa el byte enviado
  antes de seguir, y si la cuenta se creó, se borra;
- `startDate: "2099-02-30"` va con `endDate: "2099-03-01"`; `endDate: "infinity"` va al final, con `startDate:
  "2099-01-10"`, y se anota el id del préstamo al crearlo. Mientras existe, los listados muestran esa fecha como `null`; se
  cancela enseguida;
- al terminar se borra el préstamo `infinity` con `psql` en staging, **por su id** (`DELETE FROM loans WHERE id = '<id>' AND
  end_date = 'infinity'`, se espera `DELETE 1`), y después se borran las cuentas desde la app.

- **En paralelo, si se quiere:** 4, 5, 6 y 7 tocan archivos distintos. Con un solo agente local van en serie.
- **Orden duro:** 1 antes que 4-7 (sin eso no hay referencia del código viejo); 8 después de 4-7; la medición "antes" de
  11 antes de deployar.
- **Quién:** opción D (Qwen escribe código y pruebas desde un brief; Claude revisa). El reparto fino lo fija `tasks`.

## 7. Risks & open decisions

| Riesgo | Disparador | Impacto | Mitigación |
| --- | --- | --- | --- |
| R1. Un borde cambia sin que nada falle | un esquema más estricto o más laxo que el `if` de hoy | respuesta distinta en producción | paso 1 contra el código viejo, pares de AC-2, mutantes |
| R2. Un `.optional()` de menos o de más | se escribe sin mirar cuál de los cuatro casos de §0 es | de menos: un pedido válido pasa a 400. De más: un requerido ausente **pasa** (`GET /api/loans` sin `type` daría 200) | los cuatro casos están en §0; mutantes propios en los dos sentidos; la red "Invalid request data" se afirma **nunca** alcanzada en las pruebas de rutas |
| R3. Las pruebas de caracterización se ajustan al código nuevo | alguien edita el paso 1 durante 4-7 | se pierde la referencia | el commit del paso 1 va solo; en cada paso, `git diff <commit del paso 1> -- ':/server/tests/zodToday*' ':/server/tests/zodHelpers.ts'` sale vacío |
| R4. El control de AC-14 se esquiva | cualquiera de los límites listados en §3.7; el más natural es una función que recibe `{ body: unknown }` | una ruta futura sin esquema | límite aceptado y escrito en la prueba; lo cubre la revisión |
| R5. TypeScript 7 cambia el compilador que usa el control | actualización mayor | la prueba deja de correr | fijado en `~6.0.2`; al subir se adapta solo esa prueba |
| R6. Las suposiciones sobre Postgres no se cumplen | fecha, página, nulo o email no dan 500 | cambia la columna "Hoy", no el resultado | AC-17 lo mide antes y después |
| R7. Datos raros en staging | medir "antes" crea un préstamo con fecha `infinity` | listados con una fecha inválida | cuentas `qa-zod-*@example.com`; cancelar ese préstamo enseguida; al final, borrarlo con `psql` por su id y borrar las cuentas |
| R8. Un 4xx propio se confunde con el del lector del cuerpo | `unreadableBody` montado más abajo | un bug queda oculto como 400 | va pegado a los lectores; una prueba simula un `sendFile` que falla con `status: 404` y exige 500 y log. Dentro de una ruta con `catch` no serviría: nunca llega a `errorHandler` |
| R9. La fila 40 llega a `main` sin su código | el hook de documentos la commitea sola, u otro PR de documentos la lleva | la suite del cliente queda en rojo (39 contra 40) | regla y control de §3.6 |
| R10. Quien tiene una contraseña guardada con espacios no puede cambiarla | 1 cuenta activa en producción | aceptado en la spec | ninguna |

**Open decisions** (de Hernán, antes de lanzar T001): T001 son unas 140 pruebas en tres archivos. O Qwen la hace en **tres
entregas** (`zodTodayAuth` con la ayuda y el control, `zodTodayTools`, `zodTodayLoans`) dentro de un solo commit
(recomendado), o en una sola. Lo mismo con T006: dos entregas (esquemas y rutas; fila 40) o una.

Decidido por Hernán el 2026-11-23:

- un solo PR, y el código va aislado en la rama `feat/zod-routes`, que sale de `main` después del PR de documentos (paso 0);
- AC-15 se prueba con un caso nuevo en C1 de `client/src/pages/requestLoan.test.tsx`;
- el préstamo `infinity` de staging se borra con `psql`, por su id;
- las dos celdas incompletas de la columna "Hoy" de la spec se completaron.

## Tasks
<!-- generated by tasks on 2026-11-23; IDs are stable, do not renumber -->

Siguen el §6 desde el paso 1 (T00*n* = paso *n*). El paso 0 (PR de documentos) queda fuera de la tabla: es previo a la rama
`feat/zod-routes`, que crea Hernán desde `main` actualizado. Riesgo calculado con `npx @ericrisco/rsc@4.1.8 risk <rutas
esperadas>` el 2026-11-23.

**Comandos** (cada uno arranca en la **raíz** del árbol; los paréntesis hacen que el `cd` no siga valiendo después):

- **VERDE** (parte del done-check de T001 a T009): `(cd server && npm test && npx tsc -b)` con salida 0 y, desde T002,
  `git diff <commit de T001> -- ':/server/tests/zodToday*' ':/server/tests/zodHelpers.ts'` vacío. **VERDE con cliente** suma
  `(cd client && npm test && npx tsc -b && npm run lint)` con salida 0.
- **`V <nombre>`**: `(cd server && npx vitest run tests/<nombre> --reporter=json --outputFile=<tmp>/<nombre>.json)`, salida 0.
- **`IDS <nombre>: <lista>`**: `node <briefs>/check-test-ids.mjs <tmp>/<nombre>.json <lista>` → `todos: <n>`, salida 0. El
  script vive fuera del repo, lo escribe Qwen en T001, y su contrato es: lee el informe JSON de Vitest, mira solo las pruebas
  con `status: 'passed'` y busca cada id entre corchetes en `fullName`; si falta alguno imprime `faltan: …` y sale con 1. En
  las listas, `{1..5}` es la expansión de Bash. `<briefs>` es la carpeta de briefs de Hernán, fuera del repo, y `<tmp>` una
  carpeta temporal; cada brief escribe las dos rutas completas.
- **`SIN-REQ <archivo>`**: `grep -nE -e "req\.body" -e "req\.query" -e "req\.params" <archivo>` sin salida. Los comentarios
  "Express 5 leaves req.body undefined…" también se borran.

Cada tarea es un commit de Hernán; Qwen deja sus cambios sin commitear en su worktree. `progress/zod-routes.md` lo crea Claude
en T001 (con su fila en `index.md`) y lo escribe Claude al integrar cada tarea, de a una; Qwen entrega la evidencia en su
informe.

| ID | [P] | Task | Done-check | Depends-on | Trace | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| T001 |  | Write the characterization tests and the frozen helpers against today's code | `V zodToday` verde con el código de hoy: `git status --short -- server/src` **y** `git diff --stat origin/main -- server/src` vacíos; `IDS zodToday: P-reg-{1..5} P-log-{1,2,3,5} P-lis-{1..4} P-pub-{1..5} P-edi-{1,2} P-edi-{4..14} P-pre-{1,2,3,6,7,8} P-est-{1..3} P-con-{1,3,4} B-{1..14} M-{1..9} AC-6 AC-8 AC-10 AC-10b AC-11 AC-12 AC-20 AC-23`; los tres huecos heredados; el control de los espías (registro 201, login 200 y cambio 204, con `handlerCalls` > 0 y bcrypt llamado); VERDE | — | AC-1, AC-2, AC-6, AC-8, AC-10, AC-10b, AC-11, AC-12, AC-18, AC-20, AC-23 | 1 |
| T002 | [P] | Add `unreadableBody` and the malformed-URL case of `errorHandler` | `V zodPreRoute` rojo antes del código y verde después; `IDS zodPreRoute: AC-16 AC-21 AC-22 FILA-14 FILA-15`; `sendFile` simulado → 500 y log; `{ status: 500 }`, `{ status: 302 }` y `{ status: 400.5 }` sin tocar; sus mutantes mueren; VERDE | T001 | AC-16, AC-21, AC-22 | 1 |
| T003 | [P] | Implement `validation/rules.ts` and `validation/requestInput.ts` | `V zodValidation` rojo → verde: los cuatro casos de `.optional()`, primer problema, red de seguridad con `z.string()` sin regla, `errorCode` que no está en `ERROR_CODES`, lista y cuerpo ausente = objeto vacío, `abort` (una regla del objeto que no es la última), `idParams`; `V errorGuard`; sus mutantes mueren; VERDE | T001 | AC-16 | 1 |
| T004 | [P] | Validate register and login with `authSchemas.ts` | `V zodAuth` rojo → verde; `IDS zodAuth: P-reg-{1..6} P-log-{1..5} AC-9 AC-16 AC-20 AC-24 FILA-13`; unitarias de los dos esquemas; 0 llamadas a la base y a bcrypt por cada regla; `SIN-REQ server/src/modules/auth/authRoutes.ts`; sus mutantes mueren; VERDE; **cierre de tier 2** | T001, T003 | AC-2, AC-9, AC-16, AC-20, AC-24 | 2 |
| T005 | [P] | Validate tools and search with `toolSchemas.ts` and unify the lists in `toolOptions.ts` | `V zodTools` rojo → verde; `IDS zodTools: P-lis-{1..4} P-pub-{1..5} P-edi-{1..15} AC-7 AC-8 AC-9 AC-16 AC-20 FILA-{8..11}`; unitarias; `PATCH` con pausa; `toStrictEqual` sobre el argumento de `repo.update`; `grep -rln -e "const VALID_CATEGORIES" -e "const VALID_CONDITIONS" server/src` da solo `server/src/modules/tools/toolOptions.ts`; `grep -n "as never" server/src/modules/tools/toolsRoutes.ts` sin salida; `SIN-REQ server/src/modules/tools/toolsRoutes.ts`; sus mutantes mueren; VERDE | T001, T003 | AC-2, AC-7, AC-8, AC-9, AC-16, AC-20 | 1 |
| T006 | [P] | Validate loans with `loanSchemas.ts` and add row 40 on both sides | `V zodLoans` rojo → verde; `IDS zodLoans: P-pre-{1..9} P-est-{1..3} AC-3 AC-4 AC-4b AC-4c AC-5 AC-5b AC-6 AC-9 AC-16 AC-20 FILA-{1..7}`, con la fecha con nulo → `LOAN_DATE_INVALID`; unitarias (tabla de fechas); dos "hoy" en el mismo router; `(cd client && npx vitest run src/errors/messages.test.ts src/pages/requestLoan.test.tsx)` verde; antes del commit `git status --short` lista los seis archivos del §3.6, y después los lista `git show --stat`; la entrada de *Revisions* de error-codes dice "de 39 a 40 mensajes"; `SIN-REQ server/src/modules/loans/loansRoutes.ts`; sus mutantes mueren; VERDE con cliente | T001, T003 | AC-2, AC-3, AC-4, AC-4b, AC-4c, AC-5, AC-5b, AC-6, AC-9, AC-15, AC-16, AC-19, AC-20 | 1 |
| T007 | [P] | Validate and trim the password change with `meAccountSchemas.ts` | `V zodPassword` rojo → verde, con bcrypt real; `IDS zodPassword: P-con-{1..4} AC-9 AC-13 AC-13b AC-13c AC-13d AC-13e AC-13f AC-16 AC-20 FILA-{16..21}`; cambio y login después; borrar la cuenta en AC-13e; nulo en una contraseña no da `BAD_REQUEST`; `SIN-REQ server/src/modules/me/meAccountRoutes.ts`; sus mutantes mueren; VERDE; **cierre de tier 2** | T001, T003 | AC-2, AC-9, AC-13, AC-13b, AC-13c, AC-13d, AC-13e, AC-13f, AC-16, AC-20 | 2 |
| T008 |  | Add the suite control `inputGuard.test.ts` | `V inputGuard` verde sobre `server/src`; `IDS inputGuard: AC-14`; los 4 casos de AC-14 y las muestras del §3.7 marcados, las legales no; los límites aceptados escritos en la prueba; visto en rojo con una lectura `req.body` puesta a mano en una ruta y quitada; `grep -nE -e "writeFile" -e "appendFile" server/tests/inputGuard.test.ts` sin salida; VERDE | T004, T005, T006, T007 | AC-14 | 1 |
| T009 |  | Sweep every row and criterion through the real app and run the cross-cutting mutants | `V zod` (todos los archivos `zod*`) verde; `IDS zod: FILA-{1..21} AC-{3..13} AC-16 AC-{20..24} AC-4b AC-4c AC-5b AC-10b AC-13b AC-13c AC-13d AC-13e AC-13f` (AC-1, AC-2 y AC-18 se comprueban con `B`, `M` y `P`); AC-16 con un valor marcador en cada esquema y en los dos errores previos; los mutantes que cruzan todo, cada uno con la prueba que lo mata o su justificación; `git status --short -- server/src client/src` vacío; VERDE con cliente | T002, T008 | AC-1 a AC-16, AC-18 a AC-24 | 1 |
| T010 |  | Run the local tier-2 push gate | cada comando del §6 paso 10 con su salida en `progress/zod-routes.md`; panel `zod-routes/closing` registrado después del último commit de código | T009 | todos menos AC-17 | 2 |
| T011 |  | Verify on staging, before and after | los comandos de **Staging y producción** (abajo), con sus salidas en `verifications/zod-routes-<fecha>.md`: cada entrada de AC-17 antes y después, deploys de los dos entornos (producción sin cambios), `smoke.mjs` con salida 0, `DELETE 1` del préstamo `infinity` y 0 cuentas activas `qa-zod-*` | T010 | AC-17 | 2 |
| T012 |  | Ship to production | aprobación explícita de Hernán anotada; push, PR y merge; deploys de los dos entornos en SUCCESS; `smoke.mjs` de producción con salida 0 en la verificación. Vuelta atrás: revertir el PR (§4) | T011 | todos | 2 |
| T013 |  | All done-checks pass, both suites green on `main` | cada fila de arriba con su evidencia en `progress/zod-routes.md`; VERDE con cliente sobre `main` (sin el `git diff` contra T001: el squash lo deja fuera de `main`); por rama + PR: spec, plan e índice cerrados, D15 y F1 anotados como cerrados | T012 | todos | — |

**Cierre de tier 2** (T004 y T007): `npx @ericrisco/rsc@4.1.8 risk --base <commit anterior>` → tier 2; revisión de las tres
lentes; `npx @ericrisco/rsc@4.1.8 review ledger panel zod-routes/<tarea> --lenses correctness,security,tests` sobre el commit; y
la aprobación de Hernán anotada en *Decision queue* de `progress/zod-routes.md`. T008 espera a las dos.

T011 mide tier 0 por sus rutas (solo un documento) y T010 y T012 no tocan rutas propias; se tratan como tier 2 **por
decisión de este plan**, porque actúan sobre la rama entera, que es de auth.

**Cobertura de criterios:** los 33 criterios (AC-1 a AC-24, con 4b, 4c, 5b, 10b y 13b a 13f) tienen al menos una tarea, y
toda tarea tiene al menos un criterio. AC-15 y AC-19 se prueban en el cliente (T006); AC-17, solo en staging (T011).

### Staging y producción (T011, T012)

Desde `E:/Trabajo/prestoteca`, con `RW=/c/Users/hralb/.railway/bin/railway.exe` (nunca `npx railway`: es otro programa).
Claude prepara y lee; Hernán corre los de git y `gh`, y da el OK antes de cada deploy y de cada `psql` que escribe.

1. Antes: Hernán `git switch main && git pull`; `$RW up -e staging --service prestoteca --ci`; se mide cada entrada (receta
   del §6).
2. Después: Hernán `git switch feat/zod-routes`; `$RW up -e staging --service prestoteca --ci`; se repite cada entrada.
3. `$RW deployment list -s prestoteca -e staging --limit 3 --json` y lo mismo con `-e production` (producción sin cambios).
4. `node server/scripts/smoke.mjs <url de staging>` → salida 0.
5. Limpieza, por la entrada estándar de `$RW ssh -s Postgres -e staging -- sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
   -v ON_ERROR_STOP=1 -1'` (primero un `SELECT` de esa fila): el `DELETE` de la receta → `DELETE 1`. Después se borran las
   cuentas desde la app, y `SELECT count(*) FROM users WHERE email LIKE 'qa-zod-%' AND deleted_at IS NULL` → 0.
6. Producción, con la aprobación: Hernán `git push -u origin feat/zod-routes`, `gh pr create` y
   `gh pr merge <n> --squash --delete-branch`; después, el paso 3 con los dos entornos y
   `node server/scripts/smoke.mjs <url de producción>` → salida 0.

### Interfaces por tarea (para quien implementa sin el resto del plan)

En T004 a T007, el brief copia además entera la fila del §3.3 de cada esquema, su lista de pares y el §0.

**T001 — Interfaces**
- Produce `server/tests/zodHelpers.ts`, congelado después: `ALLOWED_ORIGIN = 'http://localhost:5173'`; `SESSION_COOKIE:
  string` (`token=` y 43 caracteres base64url); `handlerCalls(db) -> number` (consultas más conexiones); y
  `startApp() -> Promise<{ app, db: { query, connect, answer }, hashes: { hash, compare } }>`.
- `startApp` pone con `vi.stubEnv` `PORT`, `DATABASE_URL` (inválida y con "test" en el nombre) y `NODE_ENV=test`; instala los
  espías **antes** de `createApp`; y hace que `SessionRepository.prototype.touchActive` responda
  `{ userId: 'user-1', remember: false }` (por eso la consulta de la sesión no aparece en `handlerCalls`).
- `answer(sql, values) -> Promise<{ rows, rowCount }>` es una sola función falsa programable que responden `pool.query` y el
  cliente de `connect` (que trae `release`); por defecto, `{ rows: [], rowCount: 0 }`.
- `hash` y `compare` son espías que **llaman al bcrypt real**.
- Cada archivo de prueba hace en `afterEach`: `vi.useRealTimers()`, `vi.restoreAllMocks()` y `vi.unstubAllEnvs()`.
- Consume: la app de hoy. Nada de `modules/validation`.

**T002 — Interfaces**
- Produce: `unreadableBody(err: unknown, req: Request, res: Response, next: NextFunction): void` exportado de
  `errors/AppError.ts`, montado en `index.ts` en la línea siguiente a `express.urlencoded(…)`; `errorHandler` con el caso
  `URIError` + `status === 400`. Mensajes: `Unreadable request body` y `Malformed URL`.
- Consume: las ayudas de T001.

**T003 — Interfaces**
- Produce `rules.ts`: `rule(code: ServerErrorCode, message: string) -> { error: string; params: { errorCode: ServerErrorCode };
  abort: true }`; `text` (recorta; ausente u otro tipo = `''`; nunca falla); `optionalText(message: string)` (ausente o
  texto, **sin** recortar; otro tipo = `BAD_REQUEST`); `hasNul(value: string | null | undefined): boolean`; `NUL_MESSAGE =
  'Text cannot contain a null character'`; `idParams(message: string)`, `toolIdParams` (`Invalid tool ID`), `loanIdParams`
  (`Invalid loan ID`).
- Produce `requestInput.ts`: `type Input<T> = { ok: true; data: T } | { ok: false; code: ServerErrorCode; message: string }`;
  `readBody`, `readQuery` y `readParams`, los tres `<S extends z.ZodType>(req: Request, schema: S) => Input<z.output<S>>`.
  Cuerpo ausente o lista = `{}`. Red: `BAD_REQUEST` / `Invalid request data`, con `FALLBACK_CODE`.

**T004 — Interfaces**
- Consume: T003 y las ayudas de T001. En la ruta: `const input = readBody(req, schema); if (!input.ok) { sendErrorCode(res,
  input.code, input.message); return }`.
- Produce `authSchemas.ts`: `registerBody -> { name, email, password, neighborhood }` y `loginBody -> { email, password,
  remember: boolean }`.

**T005 — Interfaces**
- Consume: T003 (`toolIdParams` incluido) y las ayudas de T001. Mismo uso en la ruta que T004, con `readParams` antes que
  `readBody`.
- Produce `toolSchemas.ts`: `toolListQuery`, `publishToolBody`, `editToolBody`.
- Produce `toolOptions.ts`: `VALID_CATEGORIES`, `VALID_CONDITIONS`, `ToolCategory`, `ToolCondition`,
  `isValidCategory(value: unknown): value is ToolCategory`, `isValidCondition(value: unknown): value is ToolCondition`.
- Cambia `ToolService.edit(id, userId, updates: { name?: string; description?: string; category?: unknown; condition?: unknown
  })`. Las claves que no llegaron no aparecen en lo que recibe `repo.update`.

**T006 — Interfaces**
- Consume: T003 (`toolIdParams` y `loanIdParams` incluidos) y las ayudas de T001. Mismo uso en la ruta.
- Produce `loanSchemas.ts`: `loanRequestBody(getToday: () => string)`, armado una vez por router; `loanStatusBody`;
  `loanListQuery`.
- Produce `LOAN_DATE_INVALID: { status: 400 }` (sección Loans, `row 40`); el texto de la fila 40 en `messages.ts`; la fila 40
  en la sección **Préstamos** de error-codes, después de la 27; y una entrada en sus *Revisions* ("la tabla pasa de 39 a 40
  mensajes"). **Todo en un commit**; la fila 40 se escribe con el código ya en el mismo árbol, sin commitear (§3.6).

**T007 — Interfaces**
- Consume: T003 y las ayudas de T001. Mismo uso en la ruta.
- Produce `meAccountSchemas.ts`: `passwordChangeBody -> { currentPassword, newPassword }`, recortadas.

**T008 — Interfaces**
- Consume: los lugares permitidos de §0 (lecturas: `requestInput.ts` y `req.path` en `index.ts`; `zod`:
  `modules/validation/`, `*Schemas.ts`, `modules/config/env.ts`).
- Produce: una función que recibe archivos en memoria y devuelve las lecturas prohibidas, usada por las muestras y por
  `server/src`.

### Reparto entre Qwen y Claude (opción D; cada brief se revisa y se muestra a Hernán antes de lanzar)

| Tarea | Quién |
| --- | --- |
| T001 a T009 | Qwen escribe código y pruebas desde un brief con requisitos, sin código para copiar, y corre sus mutantes; Claude revisa (T004 y T007, panel de 3). T001 y T006 son las más grandes: ver *Open decisions* |
| T010 | Qwen corre y reporta; Claude repite los números clave y lanza el panel |
| T011, T012 | Claude + Hernán |
| T013 | Qwen corre y reporta; Claude confirma y cierra los documentos |

## Review Workload Forecast

| Dimension | Forecast | Why |
| --- | --- | --- |
| Estimated changed lines | ≈ 2 500-3 500 (≈ 500-700 de código, el resto pruebas) | 11 archivos de prueba nuevos y la ayuda común; en el server, 7 archivos de código nuevos y 9 cambiados |
| Files / areas | ≈ 35 (validation, auth, tools, loans, me, errors, tests, 3 del cliente, documentos) | una pieza por módulo |
| Risk | máximo tier 2; tier 2 en T004, T007 y T010 a T012 | `rsc risk` marca auth en T004 y T007: panel de 3 y aprobación de Hernán en cada una, y otra vez sobre la rama entera |
| Suggested delivery | **un solo PR, excepción aprobada por Hernán** (2026-11-23); supera `line_budget` 400 y `file_budget` 12 | se revisa por tarea, un commit cada una; partirlo exigiría dos pasadas por staging y dos paneles |

## Revisions

- **2026-11-23 — primera versión.** Antes de escribirla se probaron en una carpeta temporal: el orden de las reglas en Zod
  4.6.7, `z.iso.date()` contra el calendario, los errores del lector del cuerpo y del router, y un borrador del control de
  AC-14 sobre el código de hoy.
- **2026-11-23 — revisión con ojos frescos 1** (0 bloqueos, 7 should-fix y 8 nits, todos aplicados). El revisor implementó
  el plan entero en una copia: la suite vieja pasa tocando solo `errorCodes.test.ts` y `messages.test.ts`, su
  caracterización da 138 de 138 en el código viejo y en el nuevo, y 240 000 entradas comparadas viejo/nuevo no dan
  diferencias fuera de la tabla de la spec (informado por el revisor; Claude no repitió esa corrida). Cambios: (1) la
  regla de `.optional()` estaba incompleta y dejaba pasar un requerido ausente (§0, R2; confirmado por Claude); (2) los
  espías no veían `connect` (confirmado por Claude); (3) pruebas unitarias por esquema y afirmar `message`; (4) dos huecos
  heredados más; (5) el control reconoce el pedido por el símbolo y suma `path` y `baseUrl`, que AC-14 exige (borrador
  nuevo probado por Claude); (6) `idParams` en `rules.ts` y AC-9 en cada paso; (7) la prueba de R8 usa un error que sí
  llega a `errorHandler`. Nits: 12 rutas, chequeos de `SearchService`, tipos sin casts, "hoy" fijo, `FALLBACK_CODE` y
  verificación de `errorCode`.
- **2026-11-23 — revisión con ojos frescos 2** (pedida por Hernán; 0 bloqueos, 8 should-fix y 10 nits; aplicados todos menos
  los dos puntos que quedan en *Open decisions*). El revisor escribió los esquemas solo con el texto del plan y los comparó
  con un oráculo propio: casi 511 000 entradas, 0 diferencias (informado por el revisor). Cambios: (1) "sin casts" no
  compilaba como estaba escrito (§3.3; confirmado por Claude con `tsc`); (2) `remember` estaba en el caso equivocado de
  `.optional()`; (3) "un solo problema" no vale con dos reglas de campo rotas; (4) panel → staging → aprobación → push, como
  en `server-sessions`; (5) cómo convive la fila 40 con el hook de documentos (R9); (6) unitarias y pares asignados a sus
  pasos, un archivo de prueba por paso, reglas de *What it must respect* y diff de pruebas viejas; (7) AC-15 en la pantalla;
  (8) el control suma los tipos que heredan del pedido y el resto queda escrito como límite (borrador 3 probado por Claude:
  21 de 21). Nits: mensajes copiados de la ruta, segunda excepción de `message`, hora de "hoy", doble límite de pedidos,
  pares que faltaban, receta de staging, documentos del paso 0 y el mutante de `abort`.
- **2026-11-23 — revisión con ojos frescos 3** (pedida por Hernán; 0 bloqueos, 8 should-fix y 9 nits; aplicados todos menos
  los puntos de *Open decisions*). El revisor construyó los pasos 1 a 8 uno por uno, todos en verde, y los pasos 2 y 4 a 7
  también en otro orden; 128 de 130 mutantes mueren y 60 000 entradas comparadas viejo/nuevo no dan diferencias inesperadas
  (informado por el revisor). Cambios: (1) AC-21 y AC-22 tenían las condiciones mezcladas; (2) `İ` no llega por `curl` en
  Git Bash (confirmado por Claude); (3) las reglas de hoy pasan todas al paso 1; (4) qué pares son de hoy y cuáles nuevos;
  (5) un archivo de prueba por paso y la ayuda común congelada; (6) `smoke.mjs` en staging; (7) comandos literales en los
  pasos 9 a 12; (8) la razón de AC-15 en *Open decisions*. Nits: los dos mutantes que sobrevivían, `toStrictEqual`, límites
  del control, numeración de riesgos y datos de la receta.
- **2026-11-23 — aprobado.** Hernán: "Apruebo el plan, con las tres recomendaciones." *Open decisions* queda vacía.
- **2026-11-23 — `tasks`.** T001 a T013. Dos ajustes al armarlas: el paso 2 depende del 1 (usa la ayuda común) y los comandos
  de `rsc` llevan la versión fijada, 4.1.8 (sin versión, `npx` buscaba la 4.1.9, que el proyecto no adoptó).
- **2026-11-23 — revisión con ojos frescos de `tasks`** (pedida por Hernán; 2 bloqueos, 10 should-fix y 9 nits, aplicados;
  el tamaño de las entregas queda en *Open decisions*). Bloqueos, confirmados por Claude: el `grep` de `req.` daba verde con
  el código de hoy, y `review ledger panel zod-routes` no corre sin `/<tarea>`. Cambios: comandos que no dependen de la
  carpeta; ids en los nombres de las pruebas (51 pares, 14 bordes, 9 reglas, 21 filas) comprobados sobre el informe JSON
  (probado por Claude: un comentario, una prueba salteada o una en rojo no cuentan); `startApp` completa; `update` real en
  `PATCH`; T003 depende de T001; un bloque de interfaces por tarea; mutantes repartidos; cierre de tier 2 en T004 y T007;
  comandos de staging y producción. También se corrigió la receta de staging, que mostraba las letras en vez de sus escapes.
