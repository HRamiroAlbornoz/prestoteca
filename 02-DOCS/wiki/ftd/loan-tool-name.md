---
author: HRamiroAlbornoz
branch: fix/loan-tool-name
status: done
merged: 2026-11-03
pr: #35
---
# "Mis préstamos" muestra el nombre de la herramienta

## Intent

Punto 4 del backlog. En "Mis préstamos" cada tarjeta debería decir qué herramienta se pidió, pero el título sale
vacío. El cliente (`MyLoansPage.tsx`) muestra `loan.tool_name`, y la API nunca lo manda: `GET /api/loans` usa
`findAllByBorrower`/`findAllByOwner` de `loanRepo.ts`, que hacen `SELECT * FROM loans`. El nombre vive en la
tabla `tools`.

Las mismas dos consultas alimentan `GET /api/me/tools` (perfil, pestañas "Pedidos recibidos" y "Pedidos
hechos"), que por eso muestra "Herramienta #1e5f8444" en vez del nombre. El arreglo corrige las dos pantallas.

## Scope

**Entra:**
- `findAllByBorrower` y `findAllByOwner` traen `tools.name AS tool_name` con un `JOIN` a `tools`
  (`loans.tool_id` es `NOT NULL REFERENCES tools(id)`, y las herramientas eliminadas son borrado lógico: la fila
  sigue, así que el préstamo siempre tiene nombre).
- Tipo `LoanWithTool` en el servidor para esas dos consultas.
- Tests del repositorio: la base simulada agrega `tool_name` solo si el SQL une `tools`, como haría Postgres.

**No entra:**
- Ordenar los préstamos (hoy salen sin orden definido; anotado para después).
- Fechas: el servidor fija `TZ=America/Argentina/Tucuman` al arrancar (`server/src/index.ts:16`), así que en
  Tucumán se ven bien. No se toca.

## Checklist

- [x] T1 — Tests que fallan: los préstamos por quien pide y por dueño traen el nombre de la herramienta.
  Prueba: Vitest en rojo.
- [x] T2 — `JOIN` en `loanRepo.ts`. Prueba: tests en verde.
- [x] T3 — Suites de server y client, type-check, lint y build en verde. Prueba: salida de cada comando.
- [x] T4 — El SQL contra un Postgres real: en staging (sin base local), un préstamo entre dos cuentas de prueba
  aparece con su nombre en "Mis préstamos" (las dos pestañas) y en el perfil. Prueba: respuesta de la API y capturas.
- [ ] T5 — PR mergeado y staging/production en `SUCCESS`.

## Evidence

- **T1** (2026-11-03): en `server/tests/loanRepo.test.ts`, la base simulada guarda los nombres de `tool-1` y `tool-2`
  y solo agrega `tool_name` si el SQL contiene `JOIN tools ON tools.id = loans.tool_id`, como haría Postgres. Dos
  tests nuevos ("brings the name of the tool with each loan the user asked for / the owner received") →
  `Tests 2 failed | 14 passed (16)`.
- **T2** (2026-11-03): `SELECT loans.*, tools.name AS tool_name FROM loans JOIN tools ON tools.id = loans.tool_id`
  en `findAllByBorrower` y `findAllByOwner`, tipo `LoanWithTool` → `Tests 16 passed (16)`.
- **T3** (2026-11-03): server `Test Files 27 passed (27)`, `Tests 268 passed (268)`; `tsc --noEmit` → exit 0;
  client `Tests 181 passed (181)`; lint → los mismos 2 avisos de siempre; `npm run build -w client` → exit 0.
  Límite: la base simulada no ejecuta SQL; que el `JOIN` funcione en Postgres lo prueba T4.
- **T4** (2026-11-03, con autorización de Hernán, solo staging): `railway up -s prestoteca -e staging --ci` desde
  el árbol de trabajo → `Deploy complete`, deploy `3061987d` en `SUCCESS`. Chrome DevTools, dos contextos aislados:
  - Dueña: `register 201`, `login 200`, publica "QA Amoladora" (`201`). Vecino: `register 201`, `login 200`, pide
    la herramienta del 2030-01-10 al 2030-01-15 (`POST /api/tools/:id/loans` → `201`).
  - `GET /api/loans?type=pedidos` (vecino) → `200`, `tool_name: "QA Amoladora"`: el `JOIN` corre en Postgres.
  - Pantallas a 375 px: vecino, "Mis préstamos" → "Pedí (1)" con la tarjeta "QA Amoladora · Pendiente ·
    10/1/2030 — 15/1/2030 · Prueba QA". Dueña, "Me pidieron (1)" → la misma tarjeta. Dueña, perfil →
    "Pedidos recibidos (1)" con "QA Amoladora" (antes mostraba "Herramienta #…").
  - Las fechas se ven como se pidieron: confirma lo dicho en "No entra".
  - Limpieza: el vecino cancela (`PATCH /api/loans/:id/status` → `200`, `cancelado`; un primer intento a
    `/api/loans/:id` dio `404` porque esa ruta no existe), borra su cuenta (`204`); la dueña borra la herramienta
    (`204`, después `GET` → `404`) y su cuenta (`204`, después `/api/me` → `401`). Staging queda con este código
    hasta el próximo deploy de `main`.

## Next
Fusionado en main el 2026-11-03 (aa412ff).
