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
  A pedido de Hernán se miraron los valores (solo el barrio, sin nombres ni correos): `"Norte"` y `"Sur"`, una cuenta
  cada uno. No son de otra provincia: son formas cortas de «Barrio Norte» y «Barrio Sur», de San Miguel de Tucumán
  (toda la lista es de Tucumán: la capital y Yerba Buena). **Hernán decidió corregirlas en vez de sumarlas a la
  lista**, para no tener dos nombres para el mismo lugar.
- **Corrección hecha (2026-11-18)**, desde el contenedor de producción, en una transacción que se deshacía si alguna de
  las dos actualizaciones no tocaba exactamente 1 fila: `'Norte'` → `'Barrio Norte'` (1 fila) y `'Sur'` →
  `'Barrio Sur'` (1 fila), `COMMIT`. Antes: 2 cuentas fuera de la lista; después: **0**. Se puede volver atrás, porque
  los valores viejos son conocidos.

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
- Cambiar el barrio de cuentas que ya existen: la regla solo mira los registros nuevos. (Las 2 de producción que
  estaban fuera de la lista ya se corrigieron a mano, ver Intent.)
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
proyecto (N1a-N2b, 5 mutantes). **Revisado (2026-11-18, agente de contexto fresco): SEND AFTER FIXES, todo
aplicado:** (1) el helper de `authValidation.test.ts` no expone el repositorio falso → «no se creó la cuenta» se mira
con `usersByEmail.size`, y el correo se busca en minúsculas; (2) y (3) las cuentas esperadas estaban mal: cliente 484,
no 483, y servidor más los de N2, porque tests parametrizados que ya existen suman filas solos; (4) M1 y M5 hacen
protestar a `tsc`, se aclaró que son mutantes de ejecución y que no se silencia nada; (5) se listan los 3 archivos que
hay que copiar antes de los mutantes; (6) la spec suma una tercera edición: la lista de situaciones del registro en
*Behaviour* nombra también el barrio. Verificado sin cambios: el punto de inserción, los vecinos de cada línea nueva,
la tabla de la spec se lee bien con la fila 38 después de la 5, solo se rompen los 4 tests ya conocidos, la guarda N2b
lee bien `RegisterPage.tsx`, y los acentos están en la misma forma Unicode (NFC) en los dos archivos.
**Segunda revisión (2026-11-18, otro agente de contexto fresco, a pedido de Hernán):** simuló el cambio en una copia
fuera del proyecto y corrió las suites: con el pedido aplicado, `tsc` y las dos suites pasan (servidor 673, cliente 484).
SEND AFTER FIXES, todo aplicado: (1) **la cuenta del servidor estaba mal sumada** en el pedido: 654 + 4 + 13 = **671**,
no 667 (error de Claude); con un número equivocado, Qwen podía borrar tests para llegar a él → ahora dice 671 y que
nunca se borran tests para cuadrar; (2) el punto de inserción quedaba entre un comentario y su código → ahora va antes
del comentario; (3) M2 dice dónde va el cambio y que falla también N2a; (4) M5 rompe además unos 7 tests viejos, y se
avisa que es lo esperado; (5) de los 4 tests con `'Norte'`/`'Sur'`, 3 se rompen y el cuarto pasaría sin probar nada →
se cambian los 4, y se explica por qué; (6) la oración de la spec que dice que la pantalla no valida antes de enviar se
aclara para el barrio (la pantalla ofrece la lista). Verificado: cada texto donde se edita aparece una sola vez en su
archivo; finales de línea: la spec usa LF y los 4 archivos de código, CRLF.
**Tercera revisión (2026-11-18, otro agente de contexto fresco, a pedido de Hernán): hizo el trabajo de Qwen de punta
a punta** en una copia completa fuera del proyecto, siguiendo el pedido al pie de la letra. Todo salió como dice el
pedido: antes del arreglo fallan N1a y N2 y pasan N1b-N1d; al final, servidor 34 archivos y **673/673**, cliente 20 y
**484/484**, `tsc -b` y lint en 0; los 5 mutantes fallan donde dice. SEND AFTER FIXES, sin bloqueantes, todo aplicado:
(1) **una trampa real:** editar con `sed -i` en Git Bash convierte el archivo entero de CRLF a LF sin avisar → el pedido
prohíbe editar archivos existentes con `sed`, `awk` o heredoc, lista los 7 archivos CRLF y suma un control con `file`;
(2) N2b es un solo `it` con dos chequeos, así la cuenta es exactamente 673; (3) `createMockApp()` va dentro de cada test;
y detalles: qué tests viejos fallan a propósito mientras se trabaja (las guardas de los catálogos), cuándo usar
`it.each`, el lint no imprime nada si está limpio, M4 se corre en la suite del servidor, dónde mover el bloque en M5, y
la posición del `import`.
**Hernán mantuvo la autorización** de mandarle las correcciones a Qwen sin preguntar antes. Siguiente: lanzarlo en el
worktree nuevo `n-neighborhood` cuando Hernán diga que sí.
