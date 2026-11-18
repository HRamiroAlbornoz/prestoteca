---
author: HRamiroAlbornoz
branch: main
spec: error-codes
status: in-progress
---
# El servidor valida el barrio del registro contra la lista fija

## Intent

Ítem 6 del backlog. La spec del MVP dice (línea 108): «Dado que un usuario se registra con un barrio no presente en la
lista fija, entonces el registro se rechaza». Hoy no pasa: la lista de 8 barrios existe solo en la app
(`client/src/pages/RegisterPage.tsx`, en un menú desplegable), y `POST /api/auth/register` acepta cualquier texto.
Con la app no se puede elegir otro barrio, pero un pedido hecho a mano sí.

**Decisiones de Hernán (2026-11-17):**
- Un barrio fuera de la lista se rechaza con un **código nuevo y su propio mensaje**: `REGISTER_NEIGHBORHOOD_INVALID`
  (400), mensaje «Elegí un barrio de la lista.». Es una fila nueva en la tabla de mensajes de la spec `error-codes`,
  que Hernán aprobó fila por fila; esta fila la aprueba con esta decisión.
- Antes se miró producción, solo leyendo y solo el número: **9 cuentas activas, 2 con un barrio fuera de la lista**.

## Scope

**Entra:**
- **La lista en el servidor:** un módulo nuevo y chico, `server/src/modules/auth/neighborhoods.ts`, con los mismos 8
  barrios que la app, en el mismo orden y con los mismos acentos.
- **La regla:** en `POST /api/auth/register`, después de los chequeos que ya existen, un barrio (ya recortado) que no
  está en la lista → 400 `REGISTER_NEIGHBORHOOD_INVALID`. Se compara el texto exacto: «centro» o «Villa Lujan» sin
  acento no son de la lista (la app manda siempre el texto exacto).
- **El código nuevo en los dos catálogos:** `server/src/modules/errors/errorCodes.ts` (fila 38) y
  `client/src/errors/messages.ts` (el mensaje). La app toma los códigos del catálogo del servidor, así que sin el
  mensaje no compila.
- **La spec `error-codes`:** la fila 38 en la tabla de *What result they get*, dentro de **Registro**, y una entrada en
  *Revisions*.
- **Una guarda contra la deriva:** un test del servidor que lee `RegisterPage.tsx` y comprueba que sus barrios son
  exactamente los del servidor. Si alguien cambia una lista y no la otra, falla.
- Tests de cada caso, con el ID en el nombre.

**No entra:**
- **Las 2 cuentas de producción con un barrio fuera de la lista.** Siguen funcionando igual; la regla solo mira los
  registros nuevos. Qué hacer con ellas (dejarlas, corregirlas a mano) es una decisión aparte.
- El filtro por barrio de la búsqueda: es un texto libre con coincidencia parcial, y la spec no lo pide de la lista.
- Cambiar la lista o permitir editarla (la spec lo deja como suposición tomada).
- Editar el barrio desde el perfil: hoy no hay ninguna ruta que lo haga.

**Quién:** el código lo escribe Qwen (OpenCode vía Orca), lanzado después de preguntarle a Hernán. Claude corre los
checks, revisa el diff, prueba mutantes y aplica la revisión que pida `rsc risk` (tier 2 esperado: toca
`authRoutes.ts`).

## Checklist

- [ ] **N1 — La regla en el registro.** Tests en `server/tests/authValidation.test.ts` (o el archivo de tests del
  registro que corresponda):
  - N1a: registrarse con un barrio que no está (`'Palermo'`), con otra mayúscula (`'centro'`) y sin acento
    (`'Villa Lujan'`) → 400 `REGISTER_NEIGHBORHOOD_INVALID` y no se crea la cuenta.
  - N1b: registrarse con cada uno de los 8 barrios de la lista → 201.
  - N1c: un barrio de la lista con espacios alrededor (`'  Centro  '`) → 201 (se recorta, como hoy).
  - N1d: un barrio vacío sigue dando `REGISTER_MISSING_FIELDS`, como hoy (la regla nueva no lo pisa).
- [ ] **N2 — La lista.** Tests en `server/tests/neighborhoods.test.ts` (nuevo):
  - N2a: la lista del servidor tiene exactamente los 8 barrios, en orden.
  - N2b: la guarda: los barrios de `client/src/pages/RegisterPage.tsx` son exactamente los del servidor.
- [ ] **N3 — El código nuevo.** `errorCodes.test.ts` (servidor) suma `REGISTER_NEIGHBORHOOD_INVALID: 400`;
  `messages.test.ts` (app) suma la fila 38 y pasa de «37 filas» a «38 filas». Los dos leen el catálogo o la spec de
  verdad, así que comprueban que todo coincida.
- [ ] **Controles:** `npx vitest run` y `npx tsc -b` en `server/` y en `client/`, más `npm run lint` en `client/`; `rsc
  risk` y la revisión que pida.
- [ ] **Staging:** registrarse con `'Palermo'` → 400 `REGISTER_NEIGHBORHOOD_INVALID`; con `'Centro'` → 201 (la cuenta se
  borra al final); en la app, el registro sigue funcionando eligiendo un barrio del menú.

## Evidence

**Base (2026-11-17, `8f6e8c3`):** servidor 33 archivos, 654/654, `tsc -b` exit 0; cliente 20 archivos, 482/482,
`tsc -b` exit 0, lint sin avisos.

**Encontrado al armar el pedido:** 4 tests viejos registran con `'Norte'` o `'Sur'`, que en la lista son
`'Barrio Norte'` y `'Barrio Sur'` (`authValidation.test.ts` y `authRoutes.test.ts`); el pedido permite cambiar solo
ese valor. El límite de registros no molesta: los dos archivos llaman a `resetRateLimiter()` antes de cada test.

## Next

Pedido para Qwen armado (2026-11-17): `C:\Users\hralb\AppData\Local\Temp\claude\prestoteca-briefs\N-brief.md`, fuera del
proyecto (N1a-N2b, 5 mutantes). En revisión con un agente de contexto fresco. Después: corregirlo si hace falta y
preguntarle a Hernán antes de lanzarlo.
