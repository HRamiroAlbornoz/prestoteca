---
author: HRamiroAlbornoz
branch: fix/loan-date-test
status: in-progress
---
# La prueba de "fin antes que inicio" no vence con el calendario

## Intent

El test `returns 400 { code: LOAN_END_BEFORE_START } when end date is before start date` en
`server/tests/loansRoutes.test.ts` envía dos fechas fijas (`'2026-12-01'` y `'2026-11-01'`) y compara
el end con el start. La ruta valida que el start no sea anterior a "hoy", así que desde el
**2026-12-02** esa fecha fija queda en el pasado y la ruta responde `LOAN_START_IN_PAST` en vez de
`LOAN_END_BEFORE_START`, rompiendo el test aunque nadie haya tocado nada.

Hernán pidió el 2026-11-23 arreglarlo en su propia rama antes de `zod-routes`.

## Scope

**Entra:**
- Ese único test en `server/tests/loansRoutes.test.ts`: cambiar las dos fechas fijas por las
  constantes `START_DATE` y `END_DATE` (ya declaradas en el archivo con el comentario de que son
  relativas a hoy), intercambiadas para que el end siga siendo anterior al start.

**No entra:**
- La ruta, el cliente, ni ningún otro test.

## Checklist

- [x] **La prueba pasa con el reloj en el futuro y se vio fallando antes del fix.** Prueba: con
  `FAKE_NOW=2026-12-02T15:00:00Z` el test fallaba (`1 failed | 62 passed`); con `START_DATE`/
  `END_DATE` pasa a los 4 puntos de fecha (vacío, 2026-12-02, 2026-12-20, 2029-01-15).
- [x] **Suite completa y `tsc -b` verdes, y los dos mutantes caen.** Prueba: suite hoy
  (`37 passed, 817 passed`), suite en el futuro (`37 passed, 817 passed`), `tsc -b` exit 0;
  mutante 3.1 (`===` en la ruta) y mutante 3.2 (fechas intercambiadas en el test) fallan.
- [x] **Riesgo y revisión.** Prueba: `rsc risk` tier 1; Claude repitió los controles en una copia aparte y un
  revisor con contexto fresco aprobó sin hallazgos que bloqueen.
- [ ] **PR y merge.** Prueba: pendiente.

## Evidence

- Rojo (antes del fix): con `FAKE_NOW=2026-12-02T15:00:00Z` y `NODE_OPTIONS="--import ..."`
  (`shift-date.mjs`), `Tests  1 failed | 62 passed (63)` (el test `LOAN_END_BEFORE_START`).
- Verde (después del fix, 4 ejecuciones): `Tests  63 passed (63)` con `FAKE_NOW=` (vacío),
  `2026-12-02T15:00:00Z`, `2026-12-20T15:00:00Z` y `2029-01-15T15:00:00Z`.
- Suite completa hoy: `Test Files  37 passed (37)`, `Tests  817 passed (817)`.
- Suite completa en el futuro (`FAKE_NOW=2029-01-15T15:00:00Z`): `Test Files  37 passed (37)`,
  `Tests  817 passed (817)`.
- `tsc -b`: exit 0.
- Mutante 3.1 (`<` → `===` en la ruta): `Tests  1 failed | 62 passed (63)`.
- Mutante 3.2 (fechas intercambiadas en el test): `Tests  1 failed | 62 passed (63)`.
- Numstat: `1 1 server/tests/loansRoutes.test.ts`.
- Diferencia: se reemplazaron `'2026-12-01'` y `'2026-11-01'` por `END_DATE` y `START_DATE`
  (intercambiadas para mantener end < start).
- Risk tier: `tier 1`, `classes: default, docs`, `reviewers: 1`, `human approval: not required`,
  base: HEAD.
- Revisión (Claude, 2026-11-23): mismos resultados en rojo, verde, suites, `tsc -b` y mutante 3.2; además, el
  control de la ruta reemplazado por `false`: `Tests  1 failed | 62 passed (63)`. Lint: no corrido, el server no
  tiene comando de lint.
- Revisor tier 1 (2026-11-23): aprobado. 63 pruebas pasan con 13 relojes distintos (hasta 2040, con fin de año y
  29 de febrero) y con las zonas horarias UTC+14 y UTC-11. Nota fuera de alcance: ninguna prueba usa un préstamo
  con fin igual al inicio, así que cambiar `<` por `<=` en la ruta no hace fallar ninguna de este archivo.

## Next

Commit, PR y merge de Hernán.
