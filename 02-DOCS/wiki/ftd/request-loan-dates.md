---
author: HRamiroAlbornoz
branch: fix/request-loan-dates
status: done
---
# Pedir préstamos: body, fechas de los tests y zona horaria

## Intent

Empezó como el punto 3 del backlog: 4 tests de `client/src/pages/requestLoan.test.tsx` fallan porque usan fechas
fijas (`'2026-10-15'`) que ya quedaron en el pasado. Al revisarlos aparecieron dos bugs reales en el mismo flujo.

1. **Nadie puede pedir un préstamo desde la app.** `RequestLoanPage.tsx:35-38` manda `start_date` y `end_date`.
   El server (`loansRoutes.ts:29`) lee `startDate` y `endDate`. Prueba en staging (2026-11-02, script
   `loan-body-check.mjs` del scratchpad, con una cuenta descartable que después se borró):
   - Body del cliente (`start_date`) → `400 {"code":"BAD_REQUEST","message":"Missing start or end date"}`.
   - Body que lee el server (`startDate`) → pasa la validación de fechas. Da `404 Tool not found` porque la
     herramienta era inventada a propósito.
   El test del cliente (`requestLoan.test.tsx:166`) exige el formato equivocado, y por eso nunca lo detectó.
2. **"Hoy" se calcula en UTC.** La spec pide `America/Argentina/Tucuman` para todas las comparaciones de fechas
   (`specs/prestoteca-mvp.md:74` y `:181`; `plans/prestoteca-mvp.md:24` y el riesgo R2). Hoy no se cumple en 3 lugares:
   - `RequestLoanPage.tsx:5-6`: `new Date().toISOString()` da la fecha UTC. Además se calcula una sola vez, cuando
     se carga el módulo, así que con la pestaña abierta pasada la medianoche "hoy" queda viejo.
   - `loansRoutes.ts:48-49`: usa la fecha local del proceso, y Railway corre en UTC.
   - `loanService.ts:103-108` (`autoVencido`): lo mismo. El comentario dice "Tucuman", pero el código no la usa.
   Efecto: entre las 21:00 y las 24:00 de Tucumán ya es el día siguiente en UTC. En esa franja no se puede pedir
   para hoy, y un préstamo que vence hoy se marca `vencido` antes de tiempo.

Alcance elegido por Hernán el 2026-11-02: arreglar los tres problemas en esta rama.

## Scope

**Entra:**
- `todayInAppTimeZone()` en el server (`server/src/modules/loans/appDate.ts`) y en el cliente
  (`client/src/utils/appDate.ts`). Da la fecha de hoy (`YYYY-MM-DD`) en `America/Argentina/Tucuman` con
  `Intl.DateTimeFormat`, sin importar la zona horaria de la máquina.
- El server la usa en `loansRoutes` y en `LoanService.autoVencido`. Las dos la reciben como parámetro opcional,
  así los tests pueden pasar un "hoy" fijo.
- El cliente la usa en `RequestLoanPage`, en cada render.
- El cliente manda `startDate` y `endDate`.
- `requestLoan.test.tsx` deja de depender del calendario: fija "hoy" en `2030-01-10` con un mock de `appDate`, y
  todas las fechas son relativas a ese día.
- Prueba de punta a punta en staging.

**No entra:**
- La validación de la nota y el resto del formulario.
- Las fechas que se muestran en otras pantallas (`created_at`, `updated_at`), que no comparan contra "hoy".

## Checklist

- [x] T1 — Rama `fix/request-loan-dates` desde `main` (`2fb0313`), creada por Hernán. Prueba: salida de `git switch -c`.
- [x] T2 — Tests en rojo: `todayInAppTimeZone` (server y cliente) a las 01:30 UTC da el día anterior; la ruta y
  `autoVencido` usan el "hoy" que reciben; el cliente manda `startDate` y `endDate` y usa el "hoy" de Tucumán.
  Prueba: salida de Vitest.
- [x] T3 — Arreglo: todo en verde, server y cliente, incluidos los 4 tests que fallaban. Prueba: salida de Vitest.
- [x] T4 — Lint, type-check y build sin regresiones. Prueba: salida de cada comando.
- [x] T5 — Staging con `railway up`: el body nuevo crea el préstamo (`201`) y la fecha de ayer da `400`. Prueba:
  respuestas HTTP.
- [x] T6 — PR mergeado y deploys de staging y production en `SUCCESS`. Prueba: deploys y `/api/health`.
- [x] T7 — Agregado el 2026-11-02: `autoVencido` vence los préstamos de verdad (rojo con un mock que imita a
  `node-postgres`, verde con `to_char`, y la prueba contra un Postgres real). Prueba: Vitest y la consulta en staging.

## Evidence

- **T1** (2026-11-02): Hernán corrió `git switch -c fix/request-loan-dates` → `Switched to a new branch 'fix/request-loan-dates'`.

- **T2** (2026-11-02): tests nuevos, todos en rojo por la razón esperada:
  - `server/tests/appDate.test.ts` (5 casos): falla porque el módulo `appDate` todavía no existe.
  - `loansRoutes.test.ts` → `returns 400 when the start date is the day before today` (con "hoy" fijo en
    `2030-01-10`): `expected 201 to be 400`, porque la ruta ignoraba `getToday`.
  - `loanService.test.ts` → `marks a loan that ended yesterday as vencido…`: `expected +0 to be 1`.
  - `client/src/utils/appDate.test.ts`: `Failed to resolve import "./appDate"`.
  - `requestLoan.test.tsx`, con "hoy" fijado por mock en `2030-01-10` y todas las fechas relativas a ese día: fallan
    3 tests. `today in the app time zone` da `expected '2026-11-02' to be '2030-01-10'` en `min`; `startDate is in
    the past` no encuentra el mensaje de error; y `with the keys the server reads` no recibe `startDate`/`endDate`.
- **T3** (2026-11-02): `appDate.ts` en el server y en el cliente (`Intl.DateTimeFormat` + `formatToParts`, zona
  `America/Argentina/Tucuman`). `loansRoutes` y `LoanService` reciben `getToday` como parámetro opcional (por defecto,
  `todayInAppTimeZone`). `RequestLoanPage` calcula "hoy" en cada render y manda `startDate`/`endDate`. Server:
  `Test Files 27 passed (27)`, `Tests 247 passed (247)`. Client: `Test Files 13 passed (13)`, **`Tests 154 passed
  (154)`**: los 4 rojos de siempre ya no están.
- **T4** (2026-11-02): `tsc -b` en `server` → exit 0. Lint del client → exit 0. `oxlint` en los archivos del server →
  solo el warning que ya estaba (`CreateLoanInput` sin usar). `npm run build` → exit 0.
- **T5** (2026-11-02): `railway up -s prestoteca -e staging --ci` → `Deploy complete`. Script `request-loan-e2e.mjs`
  a las 21:04 UTC (18:04 en Tucumán):
  1. inicio = ayer en Tucumán → `400 The start date cannot be in the past`
  2. inicio = hoy en Tucumán, body camelCase → `201 pendiente`
  3. el body viejo, en snake_case → `400 Missing start or end date`
  Limpieza: `200 / 204 / 204 / 204`.

### Corrección: el server no corría en UTC (2026-11-02)

`server/src/index.ts:16` hace `process.env.TZ = 'America/Argentina/Tucuman'` al arrancar. Por eso los
`getFullYear()`/`getDate()` de `loansRoutes` y `autoVencido` **ya daban la fecha de Tucumán en producción**. Lo que
dice el Intent sobre esos dos lugares estaba mal: en el server no había un bug de zona horaria. El cambio a
`todayInAppTimeZone()` queda igual: hace explícita la zona, no depende de una variable global que se setea en otro
archivo y los tests no dependen de la zona horaria de la máquina que los corre. Pero es un endurecimiento, no un
arreglo. El bug de zona horaria era solo del cliente (`toISOString()`).

### Hallazgo: `autoVencido` nunca marca préstamos como vencidos (2026-11-02)

La respuesta del paso 2 trajo `start_date: "2026-11-02T03:00:00.000Z"`, y eso llevó a esto:
- La columna es `DATE` (`003_create_loans.sql:9-10`). `node-postgres` convierte `DATE` en un objeto `Date` de JS a
  la medianoche local (`pg-types/lib/textParsers.js:174`, `register(1082, parseDate)`), aunque `loanRepo.ts:16-17`
  declara `start_date: string`.
- `autoVencido` compara `loan.end_date < todayStr`, o sea un `Date` contra un texto `'YYYY-MM-DD'`. JavaScript pasa
  los dos a número, y `Number('2026-11-02')` es `NaN`, así que la comparación **siempre da `false`**. Script
  `date-compare.mjs`: un préstamo que terminó el 2026-10-31 da `end_date < '2026-11-02' -> false`.
- Los tests no lo detectaron porque el mock de la consulta devuelve `end_date` como texto, y la base real devuelve un `Date`.

Consecuencia: en producción ningún préstamo `entregado` pasa a `vencido` solo.

Decisión (2026-11-02): Hernán eligió arreglarlo en esta rama.

- **T7, `autoVencido`** (2026-11-02):
  - Rojo: el mock de la consulta en `loanService.test.ts` ahora imita a la base real. Si la consulta pide `end_date`
    a secas, devuelve un `Date` a la medianoche local; solo con `to_char(end_date, 'YYYY-MM-DD')` devuelve texto.
    Resultado: `auto-vencido: entregado loan past end_date → vencido` y el test nuevo de "hoy" fallan con
    `expected +0 to be 1`. Es el mismo comportamiento que en producción.
  - Arreglo: `findAllDeliveredLoans` hace `SELECT id, to_char(end_date, 'YYYY-MM-DD') AS end_date …`. Así se comparan
    dos textos `YYYY-MM-DD`, que se ordenan igual que las fechas.
  - `loanScan.test.ts` tenía su propio mock con el texto exacto de la consulta vieja. Se le hizo el mismo cambio que al otro.
  - Verde: server `Test Files 27 passed (27)`, `Tests 247 passed (247)`. `tsc -b`, `oxlint` y `npm run build` → exit 0.
  - **Contra un Postgres real** (staging, con la rama deployada por `railway up`; script de solo lectura por
    `railway ssh`, borrado al terminar): `SELECT DATE '2026-10-31'` llega como `Date 2026-10-31T00:00:00.000Z` y
    `raw < '2026-11-02'` → **`false`**. Con `to_char(...)` llega como `"2026-10-31"` y `as_text < '2026-11-02'` →
    **`true`**. Staging tiene `{"delivered":0,"overdue":0}` préstamos entregados.
  - **Ojo para el merge:** el scan corre apenas arranca el server. Si production tiene préstamos `entregado` con
    `end_date` vencido, el primer deploy los pasa todos a `vencido` de una vez. Es lo que la spec quiere, pero conviene
    saber cuántos son. La consulta de solo lectura en production quedó bloqueada por los permisos de Claude Code y
    necesitó el OK de Hernán.
  - **Conteo en production** (2026-11-02, con autorización de Hernán, solo lectura por `railway ssh`, script borrado
    al terminar): `{"delivered":0,"will_become_vencido":0}`. No hay préstamos `entregado`, así que el merge no cambia
    ningún préstamo existente.

- **T6** (2026-11-02): PR #21 → `gh pr merge --squash --delete-branch` → commit `80d63c0` en `origin/main`. El
  `git pull` interno de `gh` falló (`Cannot fast-forward to multiple branches`), pero no tuvo efecto: el `git pull`
  siguiente dejó `main` en `80d63c0`, igual a `origin/main`. Staging y production deployaron `80d63c0` → `SUCCESS`
  los dos. Production `GET /api/health` → `200 {"status":"ok","db":"connected"}`. El log muestra `Server running on
  port 8080 (production)`, sin errores de `[loan-scan]`. Staging, ya con `main`, repitió `request-loan-e2e.mjs`:
  ayer → `400`, hoy → `201 pendiente`, body snake_case → `400`. Limpieza: `200 / 204 / 204 / 204`.

## Next

Feature cerrada (2026-11-02).

Queda anotado, sin arreglar:
- La API devuelve las columnas `DATE` como timestamps ISO (`"start_date": "2026-11-02T03:00:00.000Z"`), porque
  `node-postgres` las convierte en `Date`. Falta revisar cómo las muestra el cliente: si alguna pantalla hace
  `new Date(...)` en otra zona horaria, podría mostrar el día anterior. La solución de fondo sería
  `types.setTypeParser(1082, (value) => value)` en el pool, para que `DATE` llegue siempre como texto.
- `server/src/modules/loans/appDate.ts` y `client/src/utils/appDate.ts` son copias: si cambia la zona horaria, hay que
  cambiar las dos.

Siguiente en el backlog: el punto 4, `npm audit` (15 vulnerabilidades, todas en dependencias de `server`).
