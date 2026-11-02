---
author: HRamiroAlbornoz
branch: fix/loan-transition-roles
status: done
merged: 2026-11-02
pr: #24
---
# Cambios de estado de un préstamo: cada uno solo por quien corresponde

## Intent

`LoanService.transition` (`server/src/modules/loans/loanService.ts:77-98`) solo comprueba que quien hace el cambio
sea parte del préstamo (dueño **o** solicitante) y que el cambio exista en `VALID_TRANSITIONS`. **Nunca mira quién lo
hace.** Por eso, llamando a la API, el solicitante puede aceptar su propio pedido, rechazarlo, marcarlo entregado o
devuelto. La pantalla no ofrece esos botones, pero la API los acepta igual. Se encontró el 2026-11-02, al revisar la
spec `error-codes` contra el código.

Reglas de la spec del MVP (`02-DOCS/wiki/sdd/specs/prestoteca-mvp.md`):

| Desde | Hacia | Quién | Fuente |
|---|---|---|---|
| pendiente | aceptado | dueño | línea 64 |
| pendiente | rechazado | dueño | líneas 64 y 137 |
| pendiente | cancelado | dueño o solicitante | líneas 66 y 141 |
| aceptado | entregado | dueño | líneas 65 y 138 |
| aceptado | cancelado | dueño o solicitante | líneas 66, 140 y 142 |
| entregado | devuelto | dueño | líneas 65 y 139 |

`vencido` lo pone el sistema solo (`autoVencido`); nadie lo elige.

## Scope

**Entra:**
- El server rechaza un cambio válido hecho por quien no corresponde: **403** (prohibido). Quien hace el pedido ya sabe
  que el préstamo existe, así que no hace falta ocultarlo con un 404. Un cambio que no existe para nadie sigue dando
  **409**, y alguien ajeno al préstamo sigue recibiendo **404**.
- Tests en rojo primero: servicio (cada combinación de cambio y rol) y ruta (el 403 llega al cliente).
- La pantalla del préstamo muestra "Cancelar" al solicitante mientras el pedido está **pendiente**. La spec lo permite
  (línea 66: "puede cancelar mientras no se entregó") y hoy el botón solo aparece cuando está aceptado.
- Prueba de punta a punta en staging.

**No entra:**
- Los textos de los errores: son parte de la spec `error-codes`.
- Revisar en production si alguien ya usó el agujero. Ver *Next*.

## Checklist

- [x] T1 — Rama `fix/loan-transition-roles` desde `main` (`f777007`), creada por Hernán.
- [x] T2 — Tests en rojo: el solicitante no puede aceptar, rechazar, marcar entregado ni devuelto (403, y el estado no
  cambia); el dueño y el solicitante sí pueden lo que les toca. La ruta responde 403. La pantalla muestra "Cancelar" al
  solicitante con el pedido pendiente.
- [x] T3 — Arreglo: todo en verde, server y cliente. Type-check, lint y build sin errores.
- [x] T4 — Staging con `railway up`: el solicitante intenta aceptar su pedido → 403; el dueño acepta → 200; el
  solicitante cancela un pedido pendiente → 200.
- [ ] T5 — PR mergeado y deploys en `SUCCESS`.

## Evidence

- **T1** (2026-11-02): `git switch -c fix/loan-transition-roles` → `Switched to a new branch 'fix/loan-transition-roles'`.
  El hook de sincronización de rsc trajo a esta rama la spec `error-codes` (commit `eb9d26d`, solo documentos).
- **Lectura del código** (2026-11-02): `transition()` hace `findById` → chequeo de participante → chequeo de
  `VALID_TRANSITIONS[loan.status].includes(newStatus)` → `updateStatus`. No hay ninguna comprobación de rol. La ruta
  `PATCH /api/loans/:id/status` (`loansRoutes.ts:114-141`) solo valida que haya sesión y un `status`.
  `LoanDetailPage.tsx:113-191` muestra los botones según el rol, así que el agujero solo se usa desde fuera de la app.

- **T2** (2026-11-02): tests nuevos.
  - `loanService.test.ts`, en `who may make each status change`: 8 casos permitidos (cada cambio con el rol que
    corresponde), 4 prohibidos (el solicitante acepta, rechaza, marca entregado o devuelto → 403 `FORBIDDEN`, el estado
    no cambia y `updateStatus` no se llama) y 1 que sigue siendo 409 (de `rechazado` a `aceptado`).
  - `loansRoutes.test.ts`: `returns 403 when the borrower tries to accept their own request`.
  - `loanPages.test.tsx`: `shows only the cancel button to the borrower when status is pendiente`.
  - Rojo: server `Tests 5 failed | 45 passed (50)` (los 4 prohibidos y la ruta: hoy los acepta); client `1 failed`
    (no hay botón "Cancelar"). **El bug quedó reproducido.**
- **T3** (2026-11-02): `loanService.ts` reemplaza `VALID_TRANSITIONS` por `TRANSITIONS`, una tabla con quién puede
  hacer cada cambio. `transition()` primero comprueba que el cambio exista (si no, 409, como antes) y después que el
  rol esté permitido (si no, `ForbiddenError` → 403). `LoanDetailPage.tsx` muestra "Cancelar" al solicitante con el
  pedido pendiente. Server `Test Files 27 passed (27)`, `Tests 261 passed (261)`; `tsc -b` → exit 0; client
  `Tests 155 passed (155)`; lint → exit 0; `npm run build` → exit 0. `oxlint` en el server: solo el warning que ya
  estaba (`CreateLoanInput` sin usar).
- **T4** (2026-11-02): `railway up -s prestoteca -e staging --ci` → `Deploy complete`. `transition-roles-e2e.mjs`
  (scratchpad), con dos cuentas descartables:
  1. el solicitante pide → `201 pendiente`
  2. el solicitante acepta su pedido → **`403 FORBIDDEN`**
  3. el solicitante rechaza su pedido → **`403 FORBIDDEN`**
  4. el solicitante cancela con el pedido pendiente → `200 cancelado`
  5. vuelve a pedir → `201 pendiente`
  6. el dueño acepta → `200 aceptado`
  7. el solicitante marca entregado → **`403 FORBIDDEN`**
  8. el dueño marca entregado → `200 entregado`
  9. el solicitante marca devuelto → **`403 FORBIDDEN`**
  10. el dueño marca devuelto → `200 devuelto`
  Limpieza: herramienta `204`, cuentas `204` y `204`.

## Next
Fusionado en main el 2026-11-02 (c1e647a).
