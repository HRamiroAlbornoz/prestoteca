---
author: HRamiroAlbornoz
branch: main
status: done
---
# Cuentas de prueba en producción: limpiar y dejar una fija

## Intent

Ítem 7 del backlog. Producción tiene cuentas de pruebas manuales viejas (`security-hardening.md:451`: 3 del seed y 6
manuales) y no tiene una cuenta fija para probar la vista con sesión (`navigation.md:75`). Hasta hoy, cada prueba en
producción crea una cuenta temporal y la borra al final.

**Decisión de Hernán (2026-11-18):** limpiar las cuentas de prueba viejas y dejar **una** cuenta de prueba fija. Para
elegir cuáles borrar se puede leer producción, pero solo datos no personales: fecha de creación, si el dominio del
correo es de prueba y cuántas herramientas y préstamos tiene cada cuenta. Nunca nombres ni correos.

## Scope

**Entra:**
- Borrar las cuentas de prueba viejas con la misma función que usa la app (`deleteAccount`,
  `server/src/modules/me/accountDeletion.ts`). Esa función no elimina la fila: le borra el nombre, el correo y la
  contraseña, y da de baja las herramientas de la cuenta. Así, el historial de préstamos de los demás sigue entero.
- Crear una cuenta de prueba fija por `POST /api/auth/register`, con un barrio de la lista.
- Anotar en la wiki cómo se usa esa cuenta (sin la contraseña).

**No entra:**
- Cambiar código de la app.
- Las cuentas de staging.

## Checklist

- [x] **P1 — Relevamiento de solo lectura.** Se prueba con la salida de la consulta (Evidence).
- [x] **P2 — Decisiones de Hernán:** qué hacer con las cuentas del seed, con los préstamos abiertos y cómo se crea la
  cuenta fija.
- [x] **P3 — Borrado.** Se prueba contando de nuevo, en solo lectura, las cuentas activas antes y después.
- [x] **P4 — Cuenta fija.** Se prueba contando en solo lectura: exactamente 1 cuenta activa, creada por Hernán. El
  login y la vista con sesión los prueba Hernán, porque solo él conoce la contraseña.
- [x] **P5 — Wiki.** El índice de la wiki actualizado.

## Evidence

**P1 (2026-11-18).** Script de solo lectura (`BEGIN READ ONLY`, después `ROLLBACK`) corrido por `railway ssh` en el
contenedor de producción. No imprime nombres, correos ni ids. **9 cuentas activas** (y 9 ya borradas). **Las 9 usan
un dominio de prueba**: producción no tiene ningún usuario real.

| # | Creada | Seed | Contraseña del repo funciona | Herramientas | Préstamos (pide / presta) | Préstamos abiertos |
|---|---|---|---|---|---|---|
| 1 | 2026-10-09 | sí | **sí** | 2 | 1 / 1 | 2 |
| 2 | 2026-10-09 | sí | **sí** | 5 | 3 / 1 | 2 |
| 3 | 2026-10-09 | sí | **sí** | 2 | 1 / 1 | 1 |
| 4 | 2026-10-09 | no | — | 0 | 0 / 0 | 0 |
| 5 | 2026-10-09 | no | — | 1 | 0 / 1 | 0 |
| 6 | 2026-10-10 | no | — | 1 | 0 / 1 | 1 |
| 7 | 2026-10-10 | no | — | 0 | 0 / 0 | 0 |
| 8 | 2026-10-20 | no | — | 0 | 0 / 0 | 0 |
| 9 | 2026-10-20 | no | — | 0 | 0 / 0 | 0 |

Préstamos abiertos son los que están `pendiente`, `aceptado`, `entregado` o `vencido`. Con alguno de esos,
`deleteAccount` rechaza el borrado (`ACCOUNT_HAS_ACTIVE_LOANS`).

**Riesgo encontrado:** las contraseñas de las 3 cuentas del seed están escritas en el repo
(`server/src/modules/seed/index.ts:7-9`) y funcionan en producción. Cualquiera que lea el repo puede entrar con esas
cuentas. Entre las 3 tienen 9 de las 11 herramientas del catálogo público.

El seed no se carga al arrancar el servidor (solo lo usan los tests), así que una cuenta del seed borrada no vuelve a
aparecer.

**P2 (2026-11-18), decisiones de Hernán:** (1) borrar también las 3 cuentas del seed, aunque el catálogo público quede
vacío (no hay usuarios reales); (2) cerrar los préstamos abiertos con la API, como lo haría un usuario, sin SQL; (3) la
cuenta fija la crea Hernán desde la pantalla de registro, con su correo y su contraseña. Claude nunca la ve.

Préstamos abiertos (segunda lectura, también de solo lectura; las cuentas van con su número de la tabla):

| Préstamo | Estado | Dueño → pide | Lo cierra |
|---|---|---|---|
| `32033f2b…` | pendiente | 2 → 1 | la cuenta 1 → `cancelado` |
| `ceb133a4…` | aceptado | 1 → 3 | la cuenta 3 → `cancelado` |
| `289bbbb6…` | pendiente | 6 → 2 | la cuenta 2 → `cancelado` |

Quien pide puede cancelar un préstamo `pendiente` o `aceptado` (`loanService.ts:25-26`). No hay ninguno `vencido`, el
único estado que no tiene salida.

**P3 (2026-11-18), con el OK de Hernán:**
- **Paso 1, por la API:** login de las cuentas 1, 2 y 3 → 200 las tres. Préstamos `32033f2b…` (cuenta 1),
  `ceb133a4…` (cuenta 3) y `289bbbb6…` (cuenta 2) → 200 `cancelado`. `DELETE /api/me/account` → 204 las tres. El login
  después: 401, 401 y 429. El 429 lo dio el límite de 5 logins por minuto (era el sexto pedido); repetido más tarde → 401.
- **Paso 2, en el contenedor:** la guarda vio `{"active":6,"allTestDomain":true,"openLoans":0}` y borró las 6
  (`deleted 6/6`). Después: `{"activeAfter":0,"activeToolsAfter":0}`.
- **Paso 3, solo lectura:** `{"active":0,"deleted":18}` (las 9 borradas antes, más estas 9). `GET /api/tools` →
  `{"items":[],"total":0}`: el catálogo público quedó vacío, como se esperaba. `/api/health` → 200, base conectada.
- Los scripts quedaron fuera del repo, en la carpeta temporal de la sesión. Los que corrieron en el contenedor no
  dejaron archivos ahí: se pasaron por `node -e`.

**P4 (2026-11-18):** Hernán registró la cuenta fija desde `/register` en producción. Lectura de solo lectura:
`{"active":1,"deleted":18}`. La cuenta es de hoy, su dominio no es de prueba (es el correo de Hernán), y tiene 0
herramientas y 0 préstamos. Claude no vio ni el correo ni la contraseña.

**Cómo se usa la cuenta fija:**
- Es la única cuenta de prueba de producción. Sus datos los tiene Hernán en su gestor de contraseñas y no se escriben
  en el repo ni en la wiki.
- Sirve para probar la vista con sesión en producción después de un deploy.
- Una prueba que necesite **dos** cuentas (por ejemplo, un préstamo entre dueño y quien pide) sigue creando una cuenta
  temporal y la borra al terminar (`DELETE /api/me/account` → 204, y después el login da 401).
- Lo que se cree con la cuenta fija para probar (herramientas, préstamos) se borra al terminar la prueba, así el
  catálogo público no muestra datos de prueba.

**P5 (2026-11-18):** fila nueva en `02-DOCS/wiki/index.md`.

## Next

**FTD cerrado.** Queda en el backlog el ítem 5g (token corto + token de refresco, ASDD).

**Plan de escritura en producción (aprobado y hecho, pasos 1 a 3):**
1. **Por la API, cuentas del seed (1, 2 y 3):** login con la contraseña del repo, cancelar los 3 préstamos de la tabla,
   `DELETE /api/me/account` → 204 y, después, el login da 401.
2. **En el contenedor, cuentas 4 a 9:** sus contraseñas no se conocen, así que no se puede entrar por la API. Un script
   llama a la misma `deleteAccount` de la app (el código compilado en `dist/`), con una contraseña de reemplazo al azar
   para cada cuenta. Antes de borrar, el script comprueba que queden exactamente 6 cuentas activas, todas con dominio
   de prueba y sin préstamos abiertos. Si algo no coincide, no borra nada.
3. Contar de nuevo en solo lectura: 0 cuentas activas.
4. Hernán crea la cuenta fija desde la app; Claude comprueba que haya 1 cuenta activa y prueba la vista con sesión
   solo si Hernán se la presta.
