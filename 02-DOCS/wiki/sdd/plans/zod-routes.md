---
type: plan
title: Plan — Toda entrada externa del server validada por un esquema declarado
description: El plan a nivel de estructura para zod-routes — esquemas por ruta, orden de las reglas, errores previos a la ruta, control de la suite, pruebas y orden de construcción.
tags: [sdd, plan, validation, server]
timestamp: 2026-11-23T19:30:00Z
topic: sdd
slug: zod-routes
status: draft
branch: docs/zod-routes-spec
---

# Plan — Toda entrada externa del server validada por un esquema declarado

> Spec: [../specs/zod-routes.md](../specs/zod-routes.md) (approved 2026-11-23) · Constitution:
> [../constitution.md](../constitution.md) v1.3.0 · Decisiones: D15, D16, D17 y D18 en [../decisions.md](../decisions.md)
> · Status: draft · Last updated: 2026-11-23

## 0. Global Constraints

Valores exactos que toda tarea respeta. El revisor de cada tarea los lee primero; violarlos es un hallazgo.

- **Nada cambia salvo la tabla de la spec** (*What result they get*): mismo status, mismo código, mismo `message` de
  desarrollo palabra por palabra, misma precedencia.
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
- **Carácter nulo:** `\u0000`. Es **la última regla** de cada esquema (pierde contra todas las anteriores a la base).
- **Recortar** = `String.prototype.trim`. El email se pasa a minúsculas y **después** se mide contra 254.
- **Zod 4.6.7. Reglas comprobadas el 2026-11-23, de cumplimiento obligatorio:**
  - una clave ausente declarada `z.unknown()` o `z.custom()` **falla** si no lleva `.optional()` (`expected nonoptional`);
  - `z.string().trim().catch('')` devuelve `''` ante ausencia o tipo equivocado, y nunca falla;
  - `.refine(…, { abort: true })` corta: la regla siguiente no corre;
  - los problemas de campo salen en el orden de las claves del esquema, y los `.refine` del objeto no corren si un campo
    abortó;
  - `z.iso.date()` coincide con el calendario en todos los días de los años 0000 a 2400 (0 diferencias).
- **Prohibido** `ctx.addIssue({ code: '…' })` y cualquier clave `code: '…'` fuera de `modules/errors`
  (`errorGuard.test.ts`). Las reglas se arman solo con `rule(…)`.
- **`zod` se importa solo** en `modules/validation/`, en los archivos `*Schemas.ts` y en `modules/config/env.ts`.
- **`req.body`, `req.query`, `req.params`, `req.url` y `req.originalUrl` se leen solo** en
  `modules/validation/requestInput.ts`.
- **Sin conversión de tipos** en el cuerpo; el mismo esquema para JSON y formulario; los campos desconocidos se ignoran.
- **Fuera de alcance, no tocar:** la cookie de sesión, `Origin`, límites de pedidos, `backup/`, formularios del cliente,
  formato UUID, formato de email.
- **Pruebas viejas:** ninguna expectativa cambia, salvo `client/src/errors/messages.test.ts` (39 → 40 filas) y
  `server/tests/errorCodes.test.ts` (suma `LOAN_DATE_INVALID: 400`).
- **Calidad:** `tsc -b` en 0 (server y cliente), oxlint del cliente en 0, TDD, cobertura de líneas ≥ 80 % por archivo
  cambiado. **Sin dependencias nuevas.**
- **Git:** rama + PR, autoría de Hernán, sin `Co-Authored-By` ni "generated with". Tier 2 (toca auth): panel de 3 y
  aprobación de Hernán antes del push.
- **Deploy a staging:** `railway up -e staging --service prestoteca --ci`; **nunca** `railway service source connect`.

## 1. Context & constraints

- **Qué fija el diseño:** gana el mismo error que hoy (AC-2); las reglas previas corren sin base ni hashes (AC-9); las de
  `PATCH /api/tools/:id` que corren después de la base quedan ahí (AC-10b); una ruta futura no puede leer entrada sin
  esquema (AC-14); ningún error repite el valor recibido (AC-16).
- **Lo que ya existe:** Zod 4.6.7 en el server (solo `env.ts`); 15 lecturas directas de `req.*` en 11 rutas; las pruebas
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
```

### 3.2 `validation/requestInput.ts`

```text
type Input<T> = { ok: true, data: T } | { ok: false, code: ServerErrorCode, message: string }

readBody(req, schema)   -> Input<T>   un cuerpo ausente, o que es una lista, cuenta como un objeto vacío
readQuery(req, schema)  -> Input<T>
readParams(req, schema) -> Input<T>
  - usa safeParse; si falla, responde el PRIMER problema: su errorCode y su message
  - un problema sin errorCode (un esquema mal escrito) -> BAD_REQUEST "Invalid request data", nunca el texto de Zod
  - no responde, no lanza, no registra: la ruta decide con sendErrorCode
```

Uso en toda ruta, en este orden: sesión (como hoy) → `readParams` → `readBody` o `readQuery` → servicio.

### 3.3 Esquemas: entrada → salida y orden de las reglas

El número es el orden en que ganan. "BR" = `BAD_REQUEST`. Los mensajes existentes se copian del código de hoy.

| Esquema | Salida | Reglas, en orden |
| --- | --- | --- |
| `registerBody` | `{ name, email, password, neighborhood }` recortados, email en minúsculas | 1 falta alguno → `REGISTER_MISSING_FIELDS` · 2 nombre 2-50 → `REGISTER_NAME_LENGTH` · 3 contraseña 8-72 → `REGISTER_PASSWORD_LENGTH` · 4 email en minúsculas > 254 → `REGISTER_EMAIL_TOO_LONG` · 5 barrio → `REGISTER_NEIGHBORHOOD_INVALID` · 6 nulo en `name` o `email` → BR |
| `loginBody` | `{ email, password, remember: boolean }` | 1 falta → `LOGIN_MISSING_FIELDS` · 2 `remember` presente y no booleano → BR · 3 nulo en `email` → BR |
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

### 3.4 `tools/toolOptions.ts`

```text
VALID_CATEGORIES, VALID_CONDITIONS
isValidCategory(value: unknown) -> boolean (y afina el tipo)
isValidCondition(value: unknown) -> boolean (y afina el tipo)
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

`errorCodes.ts` (sección Loans, `row 40`), `client/src/errors/messages.ts`, las dos pruebas de §0 y la spec
[error-codes](../specs/error-codes.md) (fila 40 después de la 27 y una entrada en *Revisions*). **Todo en el mismo
commit**: la prueba del cliente lee la tabla de la spec y se pone en rojo si llega por separado.

### 3.7 Control de la suite (`tests/inputGuard.test.ts`)

Recorre `server/src` con el compilador de TypeScript (ya es dependencia de desarrollo, 6.0.x) y falla si encuentra:

1. una lectura de `body`, `query`, `params`, `url` u `originalUrl` sobre un pedido de Express o sobre un valor `any`, por
   punto, por corchetes o desarmando el objeto, fuera de `requestInput.ts`;
2. un `.param(…)` de router o de app;
3. un import de `zod` fuera de los lugares de §0 (así una ruta no puede armar un `z.any()` en línea).

Usa los tipos y no el nombre de la variable: `pool.query(…)` no da falsa alarma, y `(anything) => anything.query` sí se
detecta. Probado en un borrador sobre el código de hoy: encuentra las 15 lecturas en 1,7 s, 7 de 7 formas de esquivarlo, y
ninguna falsa alarma. Las muestras malas se pasan **en memoria**: la prueba no escribe archivos en `src/`.

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
**staging** (Postgres real). Toda prueba de app espía `Pool.prototype.query` y `bcrypt`, para poder afirmar "no se llamó".

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
| AC-15, AC-19 | cliente | fila 40 con su texto; 40 filas | — |
| AC-16 | unit + app | por cada esquema y por los dos errores previos: un valor marcador enviado no aparece en `message` | — |
| AC-20 | app | cada campo con nulo; cada campo exento; `%00` → 404; `PATCH` con pausa no pausa | repositorios |
| AC-21, AC-22 | app | status y código; `console.error` sin llamadas en los 400; 413 sigue; un error propio da 500 y va al log; también sin `Origin` y con el límite agotado | — |
| AC-23 | app | campo desconocido en cada ruta con cuerpo o query | repositorios |
| AC-24 | unit + app | `İ` × 254 → `REGISTER_EMAIL_TOO_LONG`; una `İ` que entra en 254 se acepta | repositorios |
| AC-17 | staging | antes y después de cada entrada, escrito en el archivo de verificación | nada |

**Pares de AC-2, por ruta** (gana el primero):

- registro: falta/nombre · nombre/contraseña · contraseña/email · email/barrio · barrio/nulo
- login: falta/`remember` · falta/nulo
- listado: página/`q` larga · tipo/`q` larga · `q` larga/nulo
- publicar: falta/nombre · nombre/descripción · descripción/categoría
- editar: `is_paused`/no existe · tipo/no existe · nulo/no existe · no existe/categoría · ajena/vacía · ajena/categoría ·
  categoría/nombre corto · condición/nombre corto · nombre corto/descripción vacía · nombre corto/descripción larga
- préstamo: tipo de nota/falta · falta/nota larga · nota larga/fecha · fecha/ya pasó · fecha/fin antes · ya pasó/fin
  antes · fin antes/nulo · nulo/no existe
- estado: falta/no existe · tipo/no existe
- contraseña: falta/solo espacios · solo espacios/largo · largo/actual incorrecta

- **Línea e2e:** no hay pruebas de navegador nuevas. La pantalla solo suma un texto, y lo cubre la prueba de la tabla.
- **Real sí o sí:** bcrypt en AC-13 a AC-13f; Postgres en AC-17 (los 500 de hoy son deducidos); el lector del cuerpo y el
  router de Express en AC-21 y AC-22.
- **Mutantes mínimos:** sacar cada regla de cada esquema; intercambiar cada par de la lista; quitar `abort`; quitar un
  `.optional()`; medir el email antes de minúsculas; sacar el recorte de cada contraseña; `unreadableBody` para todo
  error; el `URIError` sin mirar el status; `readBody` sin tratar la lista como vacía. **Ninguno se deja en la suite.**
- **Hueco heredado que se cubre:** hoy ninguna prueba pide un préstamo con fin igual al inicio (cambiar `<` por `<=` deja
  las 817 en verde). Se suma a las pruebas del paso 1.

## 6. Sequencing & dependencies

Un solo PR desde `main`, con un commit por paso. Cada paso termina con las suites en verde y `tsc -b` en 0.

0. **PR de documentos** (`docs/zod-routes-spec`: spec, plan, decisiones y el cierre de `loan-date-test`) a `main`, **antes**
   de abrir la rama de código — depende de: nada — serial.
1. **Caracterización.** `server/tests/zodRoutesToday.test.ts`: AC-18 completo, los pares de AC-2 que no son respuestas
   nuevas, AC-10, AC-10b, AC-11, AC-12, AC-23 y fin = inicio. Verde contra el código de hoy, **sin tocar `src/`** —
   depende de: 0 — serial.
2. **Errores antes de la ruta** (§3.5): AC-21, AC-22 — depende de: 0 — paralelizable con 1 y 3.
3. **`validation/` y sus pruebas unitarias** (§3.1, §3.2) — depende de: 0 — paralelizable con 1 y 2.
4. **Registro y login**: AC-9, AC-20 y AC-24 de esas rutas — depende de: 1, 3 — paralelizable con 5, 6 y 7.
5. **Herramientas y búsqueda**, con `toolOptions.ts`: AC-7, AC-8, AC-20 — depende de: 1, 3 — paralelizable.
6. **Préstamos y fila 40**, server + cliente + spec error-codes: AC-3 a AC-6, AC-15, AC-19, AC-20 — depende de: 1, 3 —
   paralelizable.
7. **Cambio de contraseña**: AC-13 a AC-13f — depende de: 1, 3 — paralelizable.
8. **Control de la suite** (§3.7): AC-14 — depende de: 4, 5, 6, 7 (antes está en rojo por las 15 lecturas) — serial.
9. **Barrido**: cada fila de la tabla de la spec y cada AC con su prueba por la app real; AC-16; mutantes — depende de:
   2, 8 — serial.
10. **Puerta de push de tier 2**: `verify` con cobertura, `rsc risk`, `rsc spec gate`, panel de 3 registrado, aprobación de
    Hernán — depende de: 9.
11. **Staging** (AC-17): **primero** se miden las entradas contra el código viejo, que es lo que corre hoy en staging;
    después `railway up` y se repiten — depende de: 10.
12. **PR, merge y producción**; después, cierre de documentos — depende de: 11.

- **En paralelo, si se quiere:** 4, 5, 6 y 7 tocan archivos distintos. Con un solo agente local van en serie.
- **Orden duro:** 1 antes que 4-7 (sin eso no hay referencia del código viejo); 8 después de 4-7; la medición "antes" de
  11 antes de deployar.
- **Quién:** opción D (Qwen escribe código y pruebas desde un brief; Claude revisa). El reparto fino lo fija `tasks`.

## 7. Risks & open decisions

| Riesgo | Disparador | Impacto | Mitigación |
| --- | --- | --- | --- |
| R1. Un borde cambia sin que nada falle | un esquema más estricto o más laxo que el `if` de hoy | respuesta distinta en producción | paso 1 contra el código viejo, pares de AC-2, mutantes |
| R2. Un campo ausente falla por falta de `.optional()` | se escribe `z.unknown()` o `z.custom()` a secas | un pedido válido pasa a 400 | está en §0; mutante propio; la red "Invalid request data" se afirma **nunca** alcanzada en las pruebas de rutas |
| R3. Las pruebas de caracterización se ajustan al código nuevo | alguien edita el paso 1 durante 4-7 | se pierde la referencia | el commit del paso 1 va solo; en la revisión, `git diff` de ese archivo contra ese commit tiene que salir vacío |
| R4. El control de AC-14 se esquiva | un tipo propio (`req as unknown as { body: X }`) o leer el pedido a mano (`req.on('data')`) | una ruta futura sin esquema | límite aceptado y escrito en la prueba; lo cubre la revisión |
| R5. TypeScript 7 cambia el compilador que usa el control | actualización mayor | la prueba deja de correr | fijado en `~6.0.2`; al subir se adapta solo esa prueba |
| R6. Las suposiciones sobre Postgres no se cumplen | fecha, página, nulo o email no dan 500 | cambia la columna "Hoy", no el resultado | AC-17 lo mide antes y después |
| R7. Datos raros en staging | medir "antes" crea un préstamo con fecha `infinity` | listados con una fecha inválida | cuentas `qa-zod-*@example.com`; cancelar ese préstamo enseguida y borrar las cuentas al final |
| R8. Un 4xx propio se confunde con el del lector del cuerpo | `unreadableBody` montado más abajo | un bug queda oculto como 400 | va pegado a los lectores; una prueba hace fallar una ruta con un error que trae `status: 404` y exige 500 y log |
| R9. Quien tiene una contraseña guardada con espacios no puede cambiarla | 1 cuenta activa en producción | aceptado en la spec | ninguna |

**Open decisions:** ninguna bloquea. Cierran con la aprobación del plan: un solo PR (recomendado) y el nombre de la rama
de código (`feat/zod-routes`).

## Revisions

- **2026-11-23 — primera versión.** Antes de escribirla se probaron en una carpeta temporal: el orden de las reglas en Zod
  4.6.7, `z.iso.date()` contra el calendario, los errores del lector del cuerpo y del router, y un borrador del control de
  AC-14 sobre el código de hoy.
