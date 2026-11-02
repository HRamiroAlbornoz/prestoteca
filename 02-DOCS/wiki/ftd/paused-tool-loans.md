---
author: HRamiroAlbornoz
branch: fix/paused-tool-loans
status: in-progress
---
# Rechazar pedidos de herramientas pausadas

## Intent

La spec dice: *"Dado que una herramienta está pausada, entonces no acepta pedidos nuevos (el intento retorna
error 409)"* (`02-DOCS/wiki/sdd/specs/prestoteca-mvp.md:131`, también en las líneas 75 y 95).

Hoy eso no se cumple. `POST /api/tools/:id/loans` (`server/src/modules/loans/loansRoutes.ts:62`) busca la
herramienta con `WHERE id = $1 AND deleted_at IS NULL`. Esa consulta descarta las borradas, pero no mira
`is_paused`. La búsqueda sí oculta las pausadas (`searchRepo.ts:24`), así que desde la interfaz normal no se ve
el problema. Pero con el link directo, o llamando a la API, se puede pedir una herramienta pausada y el pedido se
crea con estado `pendiente`.

Es el punto 2 del backlog que se acordó el 2026-10-24.

## Scope

**Entra:**
- Un test en `server/tests/loansRoutes.test.ts` que reproduce el bug: pedir una herramienta pausada devuelve 409
  y no se crea ningún préstamo. Tiene que fallar antes del arreglo.
- El arreglo en `loansRoutes.ts`: la consulta también trae `is_paused`. Si la herramienta está pausada, el
  endpoint lanza `ConflictError` (409, código `CONFLICT`), el mismo error que ya se usa para las fechas
  superpuestas. El mensaje va en español, como el de fechas superpuestas.
- Una prueba de punta a punta en staging.
- **Agregado el 2026-11-02, con el OK de Hernán:** que pausar funcione de verdad (ver el Hallazgo).
  `PATCH /api/tools/:id` acepta `is_paused: true` y llama a `ToolService.pause()`, que chequea que seas el dueño.
  Cualquier otro valor de `is_paused` da 400, porque la spec no tiene "reactivar". El botón "Pausar" muestra el
  error del servidor si la pausa falla, en lugar de no hacer nada.

**No entra:**
- Reactivar una herramienta pausada: la spec no lo pide y no hay botón para eso.
- La pantalla de pedido: ya muestra el mensaje de error que manda el servidor.
- La carrera entre pausar y pedir. Si el dueño pausa la herramienta justo entre el `SELECT` y el `INSERT`, el
  pedido entra igual. Es una ventana de milisegundos. Cerrarla del todo pide un `SELECT … FOR UPDATE` dentro de una
  transacción, que este endpoint hoy no tiene. Queda anotado.
- Los pedidos que ya existen sobre herramientas pausadas: pausar no cancela los pedidos que ya están en curso.

## Checklist

- [x] T1 — Rama `fix/paused-tool-loans` desde `main` (`4a94bf9`), creada por Hernán. Prueba: salida de `git switch -c`.
- [x] T2 — Test en rojo: `returns 409 when the tool is paused` falla con el código actual (recibe 201). Prueba:
  salida de Vitest.
- [x] T3 — Arreglo: el mismo test pasa a verde y el resto del server sigue en verde. Prueba: salida de Vitest.
- [x] T4 — Lint, type-check y build sin regresiones. Prueba: salida de cada comando.
- [x] T5 — Staging, con la rama deployada por `railway up` antes del PR: pedir una herramienta pausada → 409 con el
  mensaje nuevo, y pedir una herramienta activa → 201. Prueba: las respuestas HTTP.
- [x] T6 — Pausar: tests en rojo y después en verde para `PATCH { is_paused: true }` (dueño → 200; no dueño → 403;
  `false`, `"true"` o `1` → 400), y para el error visible en el cliente. Prueba: salida de Vitest.
- [ ] T7 — PR mergeado. Después del deploy de `main`: production `/api/health` 200, y staging vuelve a tener el código
  de `main`. Prueba: deploys y respuesta HTTP.

## Evidence

- **T1** (2026-11-02): Hernán corrió `git switch -c fix/paused-tool-loans` → `Switched to a new branch 'fix/paused-tool-loans'`.

- **T2** (2026-11-02): test nuevo `returns 409 when the tool is paused and creates no loan`. Comprueba el status, que
  `error.code` sea `CONFLICT`, que el mensaje diga `pausada` (así un 409 por fechas superpuestas no lo hace pasar) y
  que `repo.create` no se llame. El mock de la consulta ahora responde a `FROM tools WHERE id` y devuelve
  `is_paused` (si no se indica, `false`), así los tests anteriores no cambian. `npx vitest run
  tests/loansRoutes.test.ts` → `Tests 1 failed | 19 passed (20)`, `expected 201 to be 409`: el bug está reproducido.
- **T3** (2026-11-02): `loansRoutes.ts` ahora hace `SELECT owner_id, is_paused`. Si la herramienta está pausada,
  lanza `ConflictError('La herramienta está pausada y no acepta pedidos')`, que `sendError` convierte en 409. El
  chequeo va después del 404 (una herramienta pausada existe) y antes de `service.create`. `npx vitest run` en
  `server` → `Test Files 26 passed (26)`, `Tests 234 passed (234)` (233 de antes + 1 nuevo). Las líneas
  `[loan-scan] Error during scan: DB connection failed` vienen de un test de `loanScan` que simula esa falla a
  propósito.
- **T4** (2026-11-02): `npx tsc -b` en `server` → exit 0. `oxlint` sobre `server/src/modules/loans` y el test →
  exit 0, con un solo warning que ya estaba: `CreateLoanInput` se importa y no se usa en `loansRoutes.test.ts:6`.

- **Deploy a staging antes del PR** (2026-11-02, con autorización de Hernán): `railway up -s prestoteca -e staging
  --ci` desde la rama → `$ cd server && npm start`, `Deploy complete`.

### Hallazgo: pausar no funciona (2026-11-02)

El script `pause-check.mjs` (scratchpad) corrió contra staging. Registró una cuenta descartable, creó una
herramienta y le mandó `PATCH /api/tools/:id { is_paused: true }`, que es lo mismo que manda el botón "Pausar"
(`client/src/pages/ToolDetailPage.tsx:72-76`). Resultado: **`404`**, y un `GET` posterior → `is_paused: false`.
Al final se borraron la herramienta y la cuenta (`204` y `204`).

Por qué pasa:
- `toolsRoutes.ts:113` solo lee `name`, `description`, `category` y `condition` del body. `is_paused` se ignora.
- Con el body vacío, `toolRepo.update` llega a `fields.length === 0` y devuelve `null` (`toolRepo.ts:196`). La ruta
  traduce ese `null` como un `404 Tool not found`.
- `ToolService.pause()` (`toolService.ts:74`, con el chequeo de dueño) existe, pero ninguna ruta lo llama.
- El cliente solo actualiza la pantalla si `res.ok`. Con el 404 no muestra nada: el botón parece no hacer nada.

Consecuencia: desde la app **no se puede pausar ninguna herramienta**. Por eso el bug original (pedir una pausada)
hoy solo se da si alguien pone `is_paused = true` directamente en la base. El arreglo de T3 sigue siendo correcto,
pero para probarlo de punta a punta, y para que la función exista de verdad, hace falta que pausar funcione.

Decisión (2026-11-02): Hernán eligió arreglar la pausa en esta misma rama.

- **T6, server** (2026-11-02): 5 tests nuevos en `toolsRoutes.test.ts`, dentro de `pausing with { is_paused: true }`.
  El mock de `repo.pause` ahora sí marca `is_paused = true`. Rojo: `Tests 4 failed | 10 passed (14)`. El caso del
  dueño dio `expected false to be true`, y los tres de valores inválidos dieron `expected 200 to be 400`. El de no
  dueño ya pasaba, porque `edit` también chequea al dueño. Ojo: el mock de `update` devuelve la herramienta aunque no
  haya campos, y por eso en el test da 200 donde el repo real da 404.
  Arreglo en `toolsRoutes.ts`: si `is_paused` viene y no es `true` → 400. Si es `true`, primero se aplica la edición
  (si hay otros campos, así una edición inválida falla antes de pausar), después `service.pause()` y la respuesta es
  `service.getDetail()`. Verde: `Test Files 26 passed (26)`, `Tests 239 passed (239)`. `tsc -b` → exit 0.
- **T6, cliente** (2026-11-02): test `shows the server error when pausing fails` en `toolPages.test.tsx`. Se sacó el
  arreglo a propósito y el test falló (`Tests 1 failed | 15 passed (16)`). Con el arreglo de nuevo: client
  `Tests 4 failed | 145 passed (149)`, y los 4 rojos son los de siempre en `requestLoan.test.tsx`. `ToolDetailPage`
  ahora, si `!res.ok`, muestra `data.error?.message`, igual que ya hacía "Eliminar". Lint → exit 0. `npm run build`
  → exit 0.
- **T5** (2026-11-02): segundo `railway up` a staging con todo el arreglo → `Deploy complete`. Script
  `paused-e2e.mjs` (scratchpad) con dos cuentas descartables:
  1. crear herramienta → `201`, `is_paused: false`
  2. pedir la herramienta activa → `201 pendiente`
  3. el dueño pausa → `200`, `is_paused: true`
  4. otro usuario intenta pausar → `403 You can only pause your own tools`
  5. pedir la herramienta pausada → **`409 {"code":"CONFLICT","message":"La herramienta está pausada y no acepta pedidos"}`**
  6. `is_paused: false` → `400 is_paused only accepts true`
  Limpieza: préstamo cancelado `200`, herramienta borrada `204`, las dos cuentas borradas `204`.
  Antes, `pause-check.mjs` había dejado lo suyo limpio también.

## Next

T7: Hernán commitea, abre el PR y mergea. Después se verifican los deploys de staging y de production.
