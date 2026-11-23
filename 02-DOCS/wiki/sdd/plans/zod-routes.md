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
  aprobación de Hernán antes del push.
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
- **Archivos** en `server/tests/` (`.test.ts`), uno por paso: 1 `zodRoutesToday`, 2 `zodPreRoute`, 3 `zodValidation`,
  4 `zodAuth`, 5 `zodTools`, 6 `zodLoans`, 7 `zodPassword`, 8 `inputGuard`, 9 `zodSweep`. El nombre de cada prueba lleva el
  id de su AC.
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

- registro: falta/nombre · nombre/contraseña · contraseña/email · email/barrio · barrio/nulo · nulo/email ya usado
- login: falta/`remember` · falta/nulo · `remember`/credenciales · nulo/credenciales
- listado: página/`q` larga · tipo/`q` larga · `q` larga/nulo
- publicar: falta/nombre · nombre/descripción · descripción/categoría
- editar: `is_paused`/no existe · tipo/no existe · nulo/no existe · no existe/vacía · no existe/categoría · ajena/vacía · ajena/categoría ·
  categoría/nombre corto · condición/nombre corto · nombre corto/descripción vacía · nombre corto/descripción larga
- préstamo: tipo de nota/falta · falta/nota larga · nota larga/fecha · fecha/ya pasó · fecha/fin antes · ya pasó/fin
  antes · fin antes/no existe · fin antes/nulo · nulo/no existe
- estado: falta/no existe · tipo/no existe
- contraseña: falta/solo espacios · solo espacios/largo · largo/cuenta inexistente · largo/actual incorrecta

**Pares con el mismo código y distinto `message`** (por §0, también conservan el orden): página/tipo en el listado;
`remember`/nulo en el login; categoría/condición y condición/nulo al publicar; `is_paused`/tipo y tipo/nulo al editar;
categoría/condición al editar; falta/tipo en el estado; y la excepción (b) de §0, nulo/categoría al editar.

**Cuáles van en el paso 1** (pasan contra el código viejo) y cuáles no:

- **Nuevos, no van en el paso 1:** nulo/email ya usado · nulo/credenciales · nulo/no existe (editar y préstamo) ·
  nulo/categoría (editar) · fecha/ya pasó · fecha/fin antes · solo espacios/largo.
- **Con dos variantes** (la de hoy en el paso 1, la nueva en su paso): email/barrio (255 letras; `İ`), página/`q` larga y
  página/tipo (`page=0`; `page=1abc`).
- **Todos los demás van en el paso 1**, también los de igual código, que sin eso no tendrían referencia del `message` viejo.
- En "tipo/`q` larga" el parámetro repetido es `category` o `neighborhood` (`q` no puede ser repetida y larga a la vez).

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
  suite.**
- **Huecos heredados que se cubren en el paso 1** (hoy las 817 pruebas no los ven): préstamo con fin igual al inicio;
  `PATCH` que guarda `name` y `description` recortados; `q` de exactamente 60 por la ruta → 200.

## 6. Sequencing & dependencies

Un solo PR desde `main`, con un commit por paso. Cada paso termina con las suites en verde y `tsc -b` en 0.

0. **PR de documentos** (`docs/zod-routes-spec`: spec, plan con su tabla de tareas, `analysis/zod-routes.md`, decisiones y
   el cierre de `loan-date-test`) a `main`, **antes** de abrir la rama de código — depende de: `tasks` y `analyze` hechos —
   serial.

**En los pasos 4 a 7 entran, además de lo que lista cada uno:** las unitarias de su esquema y todos sus pares de AC-2,
también los nuevos y los de igual código. La evidencia de cada paso va en `progress/zod-routes.md`.

1. **Caracterización.** `server/tests/zodRoutesToday.test.ts`: AC-18 completo, los pares de AC-2 que no son respuestas
   nuevas (la lista está en §5), AC-6, AC-8, AC-10, AC-10b, AC-11, AC-12, AC-23, los campos exentos de AC-20, cada regla de
   *What it must respect* que ya vale hoy (sin cuerpo, `Content-Type` ajeno, JSON de nivel superior que no es objeto ni
   lista, parámetro repetido…) y los huecos heredados de §5. Verde contra el código de hoy, **sin tocar `src/`** — depende
   de: 0 — serial.
2. **Errores antes de la ruta** (§3.5): AC-21, AC-22 — depende de: 1 (usa la ayuda común) — paralelizable con 3 a 7.
3. **`validation/` y sus pruebas unitarias** (§3.1, §3.2) — depende de: 0 — paralelizable con 1 y 2.
4. **Registro y login**: AC-9, AC-20 y AC-24 de esas rutas — depende de: 1, 3 — paralelizable con 5, 6 y 7.
5. **Herramientas y búsqueda**, con `toolOptions.ts`: AC-7, AC-8, AC-9, AC-20 — depende de: 1, 3 — paralelizable.
6. **Préstamos y fila 40**, server + cliente + spec error-codes: AC-3 a AC-6, AC-9, AC-15, AC-19, AC-20 — depende de: 1,
   3 — paralelizable.
7. **Cambio de contraseña**: AC-9, AC-13 a AC-13f, AC-20 (nulo en una contraseña) — depende de: 1, 3 — paralelizable.
8. **Control de la suite** (§3.7): AC-14 — depende de: 4, 5, 6, 7 (antes está en rojo por las 15 lecturas) — serial.
9. **Barrido**: cada fila de la tabla de la spec y cada AC con su prueba por la app real; AC-16; mutantes. Control: para
   cada AC menos AC-15, AC-17 y AC-19, `grep -lE "AC-<n>\b" server/tests/zod*.test.ts server/tests/inputGuard.test.ts`
   devuelve algo (solo los archivos **nuevos**: los ids ya aparecen en pruebas de otras features) — depende de: 2, 8 —
   serial.
10. **Puerta de push de tier 2, en local** — depende de: 9:
    - `npm test` y `npx tsc -b` en `server/`; `npm test`, `npx tsc -b` y `npm run lint` en `client/`;
      `npx vitest run --coverage` en los dos, ≥ 80 % de líneas por archivo cambiado;
    - pruebas viejas: `git diff --diff-filter=MD --name-only origin/main -- server/tests client/src | grep "test\."` lista
      exactamente las de §0, y su diff no cambia ningún `expect` salvo los de la fila 40;
    - `npx @ericrisco/rsc@4.1.8 risk --base origin/main` → tier 2;
      `npx @ericrisco/rsc@4.1.8 spec gate 02-DOCS/wiki/sdd/specs/zod-routes.md` → PASS (la rama `feat/zod-routes` se enlaza con la
      spec por el nombre; no hace falta `branch:`);
    - panel de 3 y `npx @ericrisco/rsc@4.1.8 review ledger panel zod-routes --lenses correctness,security,tests`, **después del
      último commit de código**.
11. **Staging** (AC-17): se anota qué commit corre; **primero** se miden las entradas contra el código viejo; después
    `railway up` y se repiten; al final `node server/scripts/smoke.mjs <url de staging>` con salida 0, que recorre los
    caminos buenos con Postgres real (esperando el minuto de `/api/auth`). Queda en `verifications/zod-routes-<fecha>.md`.
    Si obliga a tocar código, se repite 10 — depende de: 10.
12. **Aprobación de Hernán** → push → PR → merge → lista de deploys de los dos entornos →
    `node server/scripts/smoke.mjs <url de producción>` con salida 0; después, cierre de documentos (F1 de `analyze` deja de
    aplicar) — depende de: 11.

**Receta de staging:**

- dos cuentas `qa-zod-*@example.com` (dueño y quien pide) y una herramienta; `Origin` de staging; dos registros, el login
  con nulo y el registro con `İ` son 4 de los 5 pedidos por minuto de `/api/auth`;
- **los cuerpos con `İ`, `ñ` o nulo van con escapes JSON** (`İ`, `ñ`, `\u0000`), desde un archivo
  (`--data-binary @archivo`) o un script de Node, **nunca** como argumento de `curl`: Git Bash manda `İ` como `I`
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
| R3. Las pruebas de caracterización se ajustan al código nuevo | alguien edita el paso 1 durante 4-7 | se pierde la referencia | el commit del paso 1 va solo; en cada paso, `git diff <commit del paso 1> -- server/tests/zodRoutesToday.test.ts server/tests/zodHelpers.ts` sale vacío |
| R4. El control de AC-14 se esquiva | cualquiera de los límites listados en §3.7; el más natural es una función que recibe `{ body: unknown }` | una ruta futura sin esquema | límite aceptado y escrito en la prueba; lo cubre la revisión |
| R5. TypeScript 7 cambia el compilador que usa el control | actualización mayor | la prueba deja de correr | fijado en `~6.0.2`; al subir se adapta solo esa prueba |
| R6. Las suposiciones sobre Postgres no se cumplen | fecha, página, nulo o email no dan 500 | cambia la columna "Hoy", no el resultado | AC-17 lo mide antes y después |
| R7. Datos raros en staging | medir "antes" crea un préstamo con fecha `infinity` | listados con una fecha inválida | cuentas `qa-zod-*@example.com`; cancelar ese préstamo enseguida; al final, borrarlo con `psql` por su id y borrar las cuentas |
| R8. Un 4xx propio se confunde con el del lector del cuerpo | `unreadableBody` montado más abajo | un bug queda oculto como 400 | va pegado a los lectores; una prueba simula un `sendFile` que falla con `status: 404` y exige 500 y log. Dentro de una ruta con `catch` no serviría: nunca llega a `errorHandler` |
| R9. La fila 40 llega a `main` sin su código | el hook de documentos la commitea sola, u otro PR de documentos la lleva | la suite del cliente queda en rojo (39 contra 40) | regla y control de §3.6 |
| R10. Quien tiene una contraseña guardada con espacios no puede cambiarla | 1 cuenta activa en producción | aceptado en la spec | ninguna |

**Open decisions:** ninguna. Decidido por Hernán el 2026-11-23:

- un solo PR, y el código va aislado en la rama `feat/zod-routes`, que sale de `main` después del PR de documentos (paso 0);
- AC-15 se prueba con un caso nuevo en C1 de `client/src/pages/requestLoan.test.tsx`;
- el préstamo `infinity` de staging se borra con `psql`, por su id;
- las dos celdas incompletas de la columna "Hoy" de la spec se completaron.

## Tasks
<!-- generated by tasks on 2026-11-23; IDs are stable, do not renumber -->

Siguen el §6 desde el paso 1 (T00*n* = paso *n*). El paso 0 (PR de documentos) queda fuera de la tabla: es previo a la rama
`feat/zod-routes`. Riesgo calculado con `npx @ericrisco/rsc@4.1.8 risk <rutas esperadas>` el 2026-11-23.

**VERDE** (parte del done-check de T001 a T009): `cd server && npm test && npx tsc -b` con salida 0; si la tarea tocó el
cliente, también `cd client && npm test && npx tsc -b && npm run lint`; y `git diff <commit de T001> --
server/tests/zodRoutesToday.test.ts server/tests/zodHelpers.ts` vacío (desde T002). Cada tarea es un commit de Hernán.
`V <archivo>` = `cd server && npx vitest run tests/<archivo>.test.ts`.

| ID | [P] | Task | Done-check | Depends-on | Trace | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| T001 |  | Write the characterization tests and the frozen helpers against today's code | `V zodRoutesToday` verde **sin cambios en `server/src`** (`git diff --stat origin/main -- server/src` vacío); cubre la lista del §6 paso 1 y los pares "de hoy" del §5; cada par afirma código y `message`; una prueba de control muestra que los espías ven un registro, un login y un cambio de contraseña válidos; VERDE | — | AC-1, AC-2, AC-6, AC-8, AC-10, AC-10b, AC-11, AC-12, AC-18, AC-20, AC-23 | 1 |
| T002 | [P] | Add `unreadableBody` and the malformed-URL case of `errorHandler` | `V zodPreRoute` visto en rojo antes del código y verde después; casos del §5 (AC-21, AC-22), `sendFile` simulado → 500 y log, `{ status: 500 }`, `{ status: 302 }` y `{ status: 400.5 }` sin tocar; VERDE | T001 | AC-16, AC-21, AC-22 | 1 |
| T003 | [P] | Implement `validation/rules.ts` and `validation/requestInput.ts` | `V zodValidation` rojo → verde: los cuatro casos de `.optional()`, primer problema, red de seguridad con `z.string()` sin regla, `errorCode` que no está en `ERROR_CODES`, lista y cuerpo ausente = objeto vacío, `abort` (una regla del objeto que no es la última); `V errorGuard` verde; VERDE | — | AC-16 | 1 |
| T004 | [P] | Validate register and login with `authSchemas.ts` | `V zodAuth` rojo → verde: unitarias de los dos esquemas, sus pares de AC-2, 0 llamadas a la base y a bcrypt por cada regla, nulos, `İ`; `grep -nE "req\.(body\|query\|params)" server/src/modules/auth/authRoutes.ts` vacío; VERDE | T001, T003 | AC-2, AC-9, AC-16, AC-20, AC-24 | 2 |
| T005 | [P] | Validate tools and search with `toolSchemas.ts` and unify the lists in `toolOptions.ts` | `V zodTools` rojo → verde: unitarias, pares, AC-7, AC-8, nulos, `PATCH` con pausa, `toStrictEqual` sobre el argumento de `repo.update`; `grep -rn "const VALID_CATEGORIES\|const VALID_CONDITIONS" server/src` da solo `toolOptions.ts`; `grep -n "as never" server/src/modules/tools/toolsRoutes.ts` vacío; el mismo `grep` de `req.` vacío en `toolsRoutes.ts`; VERDE | T001, T003 | AC-2, AC-7, AC-8, AC-9, AC-16, AC-20 | 1 |
| T006 | [P] | Validate loans with `loanSchemas.ts` and add row 40 on both sides | `V zodLoans` rojo → verde: unitarias (tabla de fechas), pares, AC-3 a AC-6, dos "hoy" en el mismo router, nulos; `cd client && npx vitest run src/errors/messages.test.ts src/pages/requestLoan.test.tsx` verde; el commit lista los seis archivos del §3.6; el mismo `grep` de `req.` vacío en `loansRoutes.ts`; VERDE con cliente | T001, T003 | AC-2, AC-3, AC-4, AC-4b, AC-4c, AC-5, AC-5b, AC-6, AC-9, AC-15, AC-16, AC-19, AC-20 | 1 |
| T007 | [P] | Validate and trim the password change with `meAccountSchemas.ts` | `V zodPassword` rojo → verde, con bcrypt real: cambio y login después, borrar la cuenta en AC-13e, pares, nulo en una contraseña no da `BAD_REQUEST`; el mismo `grep` de `req.` vacío en `meAccountRoutes.ts`; VERDE | T001, T003 | AC-2, AC-9, AC-13, AC-13b, AC-13c, AC-13d, AC-13e, AC-13f, AC-16, AC-20 | 2 |
| T008 |  | Add the suite control `inputGuard.test.ts` | `V inputGuard` verde sobre `server/src`; los 4 casos de AC-14 y las muestras del §3.7 marcados, las muestras legales no; los límites aceptados escritos en la prueba; visto en rojo con una lectura `req.body` puesta a mano en una ruta y quitada; ningún `writeFile` en la prueba; VERDE | T004, T005, T006, T007 | AC-14 | 1 |
| T009 |  | Sweep every row and criterion through the real app and run the mutants | `V zodSweep` verde; el `grep` de ids del §6 paso 9 devuelve algo para cada AC; AC-16 con un valor marcador en cada esquema y en los dos errores previos; la lista de mutantes del §5 corrida, cada uno con la prueba que lo mata, anotada en `progress/zod-routes.md`, y `git status` limpio al final; VERDE con cliente | T002, T008 | AC-1 a AC-16, AC-18 a AC-24 | 1 |
| T010 |  | Run the local tier-2 push gate | cada comando del §6 paso 10 con su salida en `progress/zod-routes.md`; cobertura ≥ 80 % de líneas por archivo cambiado; panel de 3 registrado después del último commit de código | T009 | todos menos AC-17 | 2 |
| T011 |  | Verify on staging, before and after | `verifications/zod-routes-<fecha>.md` con: el commit que corría, cada entrada de AC-17 **antes** y después, `railway up -e staging`, deploys de los dos entornos (producción sin cambios), `smoke.mjs` con salida 0, `DELETE 1` del préstamo `infinity` y 0 cuentas activas `qa-zod-*` | T010 | AC-17 | 2 |
| T012 |  | Ship to production | aprobación explícita de Hernán; push, PR, merge; deploys de los dos entornos; `smoke.mjs` de producción con salida 0 anotado en la verificación | T011 | todos | 2 |
| T013 |  | All done-checks pass, both suites green on `main` | cada fila de arriba con su evidencia en `progress/zod-routes.md`; VERDE con cliente sobre `main`; spec, plan e índice cerrados por rama + PR | T012 | todos | — |

T011 mide tier 0 por sus rutas (solo un documento) y T010 y T012 no tocan rutas propias; se tratan como tier 2 **por
decisión de este plan**, porque actúan sobre la rama entera, que es de auth.

**Cobertura de criterios:** los 33 criterios (AC-1 a AC-24, con 4b, 4c, 5b, 10b y 13b a 13f) tienen al menos una tarea, y
toda tarea tiene al menos un criterio. AC-15 y AC-19 se prueban en el cliente (T006); AC-17, solo en staging (T011).

### Interfaces por tarea (para quien implementa sin el resto del plan)

**T001 — Interfaces**
- Produce `server/tests/zodHelpers.ts`, congelado después:
  `ALLOWED_ORIGIN = 'http://localhost:5173'`; `SESSION_COOKIE: string` (`token=` y 43 caracteres base64url);
  `startApp() -> Promise<{ app, db: { query, connect }, hashes: { hash, compare } }>` (instala los espías de
  `Pool.prototype.query`, `Pool.prototype.connect`, bcrypt y `SessionRepository.prototype.touchActive`, que responde
  `{ userId: 'user-1', remember: false }`, **antes** de `createApp`); `handlerCalls(db) -> number` (consultas más conexiones).
- Consume: la app de hoy. Nada de `modules/validation`.

**T002 — Interfaces**
- Produce: `unreadableBody(err: unknown, req, res, next): void` exportado de `errors/AppError.ts`, montado en `index.ts` en
  la línea siguiente a `express.urlencoded(…)`; `errorHandler` con el caso `URIError` + `status === 400`.

**T003 — Interfaces**
- Produce `rules.ts`: `rule(code: ServerErrorCode, message: string)`, `text`, `optionalText(message: string)`,
  `hasNul(value: string | null | undefined): boolean`, `NUL_MESSAGE`, `idParams(message: string)`, `toolIdParams`,
  `loanIdParams`.
- Produce `requestInput.ts`: `type Input<T> = { ok: true; data: T } | { ok: false; code: ServerErrorCode; message: string }`;
  `readBody`, `readQuery` y `readParams`, los tres `<S extends z.ZodType>(req: Request, schema: S) => Input<z.output<S>>`.

**T004 a T007 — Interfaces**
- Consumen: todo lo de T003 (firmas de arriba) y las ayudas de T001.
- Uso en la ruta: `const input = readBody(req, schema); if (!input.ok) { sendErrorCode(res, input.code, input.message); return }`.
- Producen los esquemas del §3.3: T004 `registerBody`, `loginBody`; T005 `toolListQuery`, `publishToolBody`,
  `editToolBody`; T006 `loanRequestBody(getToday: () => string)`, `loanStatusBody`, `loanListQuery`; T007
  `passwordChangeBody`.
- T005 produce `toolOptions.ts` (§3.4) y cambia `ToolService.edit(id, userId, updates: { name?: string; description?: string;
  category?: unknown; condition?: unknown })`.
- T006 produce el código `LOAN_DATE_INVALID: { status: 400 }` y el texto de la fila 40 (§0).

**T008 — Interfaces**
- Consume: los lugares permitidos de §0 (lecturas: `requestInput.ts` y `req.path` en `index.ts`; `zod`:
  `modules/validation/`, `*Schemas.ts`, `modules/config/env.ts`).
- Produce: una función que recibe archivos en memoria y devuelve las lecturas prohibidas, usada por las muestras y por
  `server/src`.

### Reparto entre Qwen y Claude (opción D; cada brief se revisa y se muestra a Hernán antes de lanzar)

| Tarea | Quién |
| --- | --- |
| T001 a T009 | Qwen escribe código y pruebas desde un brief con requisitos, sin código para copiar; Claude revisa (T004 y T007, panel de 3) |
| T010 | Qwen corre y reporta; Claude repite los números clave y lanza el panel |
| T011, T012 | Claude + Hernán |
| T013 | Qwen corre y reporta; Claude confirma y cierra los documentos |

## Review Workload Forecast

| Dimension | Forecast | Why |
| --- | --- | --- |
| Estimated changed lines | ≈ 2 500-3 500 (≈ 500-700 de código, el resto pruebas) | 9 archivos de prueba nuevos; 7 archivos de código nuevos y 8 cambiados en el server |
| Files / areas | ≈ 30 (validation, auth, tools, loans, me, errors, tests, 3 del cliente, documentos) | una pieza por módulo |
| Risk | máximo tier 2; tier 2 en T004, T007 y T010 a T012 | `rsc risk` marca auth en T004 y T007: panel de 3 y aprobación de Hernán en cada una |
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
