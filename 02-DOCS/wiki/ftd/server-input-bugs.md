---
author: HRamiroAlbornoz
branch: main
spec: error-codes
status: in-progress
---
# Bugs del servidor: datos de tipo incorrecto, contraseña en una cuenta borrada y estados con nombre raro

## Intent

Tres bugs viejos del servidor que encontraron las revisiones de error-codes (ítem 5b del backlog, aprobados por
Hernán el 2026-11-10). Ninguno lo provoca la app: hace falta mandar el pedido a mano. Pero hoy dos de ellos terminan
en un 500 `INTERNAL_ERROR` («algo salió mal») en vez de un error claro, y el otro deja un hueco de seguridad chico.

1. **(a) Un dato que no es texto.** Si un campo que debería ser texto llega como número, lista u objeto (por ejemplo
   `{"email": 5}`), el servidor llama a `.trim()` sobre él y explota → 500. Pasa a responder un 400 con el código que
   esa ruta ya tiene para «faltan datos».
2. **(b) Cambio de contraseña en una cuenta recién borrada.** Si la misma persona borra la cuenta en una pestaña y
   cambia la contraseña en otra al mismo tiempo, el cambio puede guardarse **después** del borrado. Así la fila
   anonimizada (`deleted-<id>@invalid`) queda con una contraseña conocida. Pasa a no tocar nunca una cuenta borrada.
3. **(c) Un estado de préstamo con nombre de JavaScript.** Pedir el estado `"constructor"` (o `"toString"`) hace que
   la tabla de cambios permitidos «encuentre» algo que no es una lista → 500. Una lista como `["aceptado"]` hoy hasta
   pasa la tabla. Pasa a responder 400 si no es texto, y 409 `LOAN_TRANSITION_INVALID` si el nombre no está en la tabla.

## Scope

**Entra:**
- **(a)** La regla, en cada ruta que hoy recorta o mide un campo del body:
  - Campo **obligatorio** presente pero que no es texto → cuenta como faltante: el mismo código de «faltan datos» de
    la ruta (no hay códigos ni mensajes nuevos para el cliente).
  - Campo **opcional** presente pero que no es texto → `BAD_REQUEST` (400).
  - Rutas: `POST /api/auth/register` (`name`, `email`, `password`, `neighborhood` → `REGISTER_MISSING_FIELDS`),
    `POST /api/auth/login` (`email`, `password` → `LOGIN_MISSING_FIELDS`), `PATCH /api/me/password`
    (`currentPassword`, `newPassword` → `PASSWORD_CHANGE_MISSING_FIELDS`; hoy `bcrypt` explota con un número),
    `POST /api/tools` (`name`, `description` → `TOOL_MISSING_FIELDS`), `PATCH /api/tools/:id` (`name`,
    `description`, opcionales → `BAD_REQUEST`), `POST /api/tools/:id/loans` (`startDate`, `endDate` →
    `LOAN_DATES_MISSING`; `note`, opcional → `BAD_REQUEST`).
  - Esto amplía lo anotado en el backlog (solo registro y login, más el PATCH de herramientas): es el mismo bug en
    cada ruta, con el mismo arreglo.
- **(a') Pedido sin body** (sumado por Hernán el 2026-11-13, a partir de Q1 del panel de A1). Sin body o con
  `text/plain`, Express 5 deja `req.body` en `undefined`, y `const { … } = req.body` explota → 500. Cada ruta que lee
  el body pasa a leer `req.body ?? {}`, así cae en el 400 de «faltan datos» que ya tiene. Va en la tarea de cada
  ruta: auth en A1 (ronda 2); herramientas y pedir préstamo en A2; estado del préstamo en C.
- **(b)** `userRepo.updatePassword` y `userRepo.findByEmail` filtran `AND deleted_at IS NULL`. `updatePassword`
  devuelve si cambió una fila; si no cambió ninguna, la ruta responde `ACCOUNT_NOT_FOUND`, como ya hace cuando la
  cuenta no está al empezar.
- **(c)** En `PATCH /api/loans/:id/status`, un `status` que no es texto → `BAD_REQUEST`. En `loanService.transition`,
  la tabla se consulta con `Object.hasOwn`, así un nombre heredado (`constructor`, `toString`, `__proto__`) da
  `LOAN_TRANSITION_INVALID`.
- Cada arreglo, con un test que falla hoy y pasa después, con el ID en el nombre.

**No entra:**
- **(d)** Que TypeScript revise los tests del servidor: va aparte, después de medir cuántos errores destapa.
- `category` y `condition` con un tipo raro: no se recortan; el servicio ya los compara con la lista fija.
- Validar `neighborhood` contra la lista fija de barrios (ítem 6 del backlog).
- Una librería de validación (Zod) en el servidor: alcanza con `typeof`, sin dependencias nuevas.

**Quién:** el código lo escribe Qwen (OpenCode vía Orca), un pedido por ítem, lanzado después de preguntarle a
Hernán. Claude corre los checks, revisa el diff, prueba mutantes y aplica la revisión que pida `rsc risk`. Las rutas
de auth probablemente den **tier 2** (como F3): se vincula a la spec `error-codes` por `spec:` en este documento.

## Checklist

- [x] **A1 — Tipo incorrecto en auth.** (Hecho, commit `9342dd8` en `main`, sin push: ver Evidence, A1 y ronda 2;
  536/536, rojo observado, 18 mutantes de Claude detectados, 2 paneles de 3, tier 2 aprobado por Hernán.) Tests en `authRoutes.test.ts` y `meAccountRoutes.test.ts`:
  - A1a: registro con cada uno de los 4 campos como número → 400 `REGISTER_MISSING_FIELDS` (un caso por campo).
  - A1b: registro con un campo como lista y como objeto → 400 `REGISTER_MISSING_FIELDS`.
  - A1c: login con `email` y con `password` como número → 400 `LOGIN_MISSING_FIELDS`.
  - A1d: cambio de contraseña con `currentPassword` y con `newPassword` como número → 400
    `PASSWORD_CHANGE_MISSING_FIELDS`, y no se llamó a `updatePassword`.
  - Ronda 2 (del panel): A1e, registro con cada uno de los 4 campos como lista y como objeto (T-N1); A1f, login con
    `email` y `password` como lista y como objeto (T-N3); A1g, cambio de contraseña con cada campo como lista y como
    objeto (T-N2); A1h, registro, login y cambio de contraseña sin body y con `text/plain` → el 400 de faltan datos
    de cada ruta (Q1).
  - Prueba: los tests nuevos fallan hoy (500) y pasan después; suite del servidor en verde.
- [x] **A2 — Tipo incorrecto en herramientas y préstamos.** (Hecho, commit `4b266ab` en `main`, sin push:
  ver Evidence, A2; 581/581, rojo observado, 16 mutantes de Claude detectados, 1 revisor, nits cerrados con A2h-A2j.)
  Tests en `toolsRoutes.test.ts` y `loansRoutes.test.ts`.
  Cada tipo incorrecto se prueba con los 4 valores `5`, `['x']`, `{}` y `true` (lección de los paneles de A1):
  - A2a: publicar con `name` o `description` de tipo incorrecto → 400 `TOOL_MISSING_FIELDS`, no se crea nada (8 filas).
  - A2b: editar con `name` o `description` de tipo incorrecto o `null` → 400 `BAD_REQUEST`, la herramienta no
    cambia (10 filas).
  - A2c: editar con `name` de tipo incorrecto y `is_paused: true` → 400 y la herramienta no queda pausada.
  - A2d: pedir préstamo con `startDate` o `endDate` de tipo incorrecto → 400 `LOAN_DATES_MISSING`, no se crea (8 filas).
  - A2e: pedir préstamo con `note` de tipo incorrecto → 400 `BAD_REQUEST`, no se crea (4 filas).
  - A2f: pedir préstamo con `note: null` → 201, como hoy (`null` sigue siendo «sin nota»).
  - A2g: publicar, editar y pedir préstamo sin body y con `text/plain` → publicar `TOOL_MISSING_FIELDS`, pedir
    préstamo `LOAN_DATES_MISSING`, editar 404 `TOOL_EDIT_EMPTY` (lo mismo que hoy da un body `{}`) (6 filas).
  - Prueba: los tests nuevos fallan hoy y pasan después; suite del servidor en verde.
- [x] **B — Contraseña en una cuenta borrada.** (Hecho, commit `01ed430` en `main`, sin push: ver
  Evidence, B; 587/587, rojo observado, 8 mutantes de Claude detectados, panel de 3, tier 2 aprobado por Hernán.)
  Tests en `userRepo.test.ts` y `meAccountRoutes.test.ts`:
  - B1a/B1b: el SQL de `findByEmail` incluye `deleted_at IS NULL`; sin filas (lo que responde Postgres para una
    cuenta borrada) devuelve `null`, así que el login da el mismo 401 que un correo desconocido.
  - B2a/B2b: el SQL de `updatePassword` incluye `deleted_at IS NULL`; devuelve `true` si cambió una fila y `false`
    si no (cuenta borrada).
  - B3: la cuenta se borra entre la lectura y la escritura → la ruta responde 404 `ACCOUNT_NOT_FOUND`, no 204, y la
    contraseña guardada no cambia.
  - B4: el cambio normal sigue dando 204 y guarda la contraseña nueva.
  - Cambio permitido en un helper de test: el `updatePassword` falso de `meAccountRoutes.test.ts` pasa a respetar
    `deleted_at` y a devolver `true`/`false`, como el real.
  - Prueba: los tests nuevos fallan hoy y pasan después; suite del servidor en verde.
- [x] **C — Estado de préstamo con nombre heredado o que no es texto.** (Hecho y pasado a `main`, esperando el
  commit de Hernán: ver Evidence, C; 604/604, rojo observado, 8 mutantes de Claude detectados, 1 revisor, nits
  cerrados con C5 y C6.) Tests en `loanService.test.ts` y
  `loansRoutes.test.ts`:
  - C1: `transition` con `constructor`, `toString`, `hasOwnProperty` y `__proto__` → 409
    `LOAN_TRANSITION_INVALID` y no se llamó a `updateStatus` (4 filas).
  - C2: la ruta con `status` como `5`, `['aceptado']`, `{}` o `true` → 400 `BAD_REQUEST` (`Status must be text`),
    el préstamo no cambia (4 filas). **Peor que lo anotado:** hoy `['aceptado']` da **200**, porque JavaScript
    convierte la lista en el texto `"aceptado"`, la tabla lo encuentra y se guarda una lista como estado.
  - C3: la ruta sin body y con `text/plain` → 400 `BAD_REQUEST` (`Missing status`) (2 filas).
  - C4: la ruta con `{ status: 'constructor' }` → 409 `LOAN_TRANSITION_INVALID`, de punta a punta (1 fila).
  - Prueba: C1 y C2 fallan hoy y pasan después; suite del servidor en verde.
- [ ] **D — Cambiar la contraseña vuelve a funcionar** (sumada el 2026-11-13, bug S1 encontrado en staging). Se quita
  `updated_at = now()` de `userRepo.updatePassword` y de `userRepo.update`: la tabla `users` no tiene esa columna, así
  que hoy el cambio de contraseña responde 500 siempre, también en producción. Sin migración. Tests en
  `userRepo.test.ts`:
  - D1: el SQL de `updatePassword` no menciona `updated_at` y sigue con `WHERE id = $2 AND deleted_at IS NULL`.
  - D2: el SQL de `update` no menciona `updated_at`.
  - D3: cada columna que `userRepo` escribe en `users` existe en las migraciones (lee `001_create_users.sql` y
    `004_add_users_deleted_at.sql`): la guarda que habría atrapado este bug.
  - Prueba real: en staging, un cambio de contraseña válido → 204; después, el login con la contraseña vieja → 401 y
    con la nueva → 200.
- [ ] **Controles:** en `server/`, `npx vitest run`, `npx tsc -p .` y el lint que tenga, en verde; `rsc risk` del diff
  y la revisión que pida.
- [ ] **Staging:** los cuatro casos a mano contra staging con `curl` (un número en el login, `"constructor"` como
  estado, una lista como estado), con la respuesta copiada. (b) no se puede provocar a mano a tiempo; en su lugar,
  contra el Postgres de staging: crear una cuenta, borrarla y comprobar que la consulta de `findByEmail` con su
  correo anonimizado da 0 filas y que el `UPDATE` de `updatePassword` sobre su `id` cambia 0 filas.

## Evidence

### A1 (2026-11-13)

- **Hecho por:** Qwen, en el worktree `a1-auth-types` (base `927ccf6`), en una sola entrega con `worker_done`. Tocó
  solo sus 4 archivos, no borró ni aflojó ningún `it(` y no usó `vi.mock`, `writeFileSync`, `execSync`,
  `spawnSync` ni esperas fijas. El código es el del pedido: `typeof x === 'string' ? x.trim() : undefined` en
  registro y login, y `typeof … !== 'string'` en el cambio de contraseña.
- **Faltó:** A1d no afirmaba que no se escribiera nada. Claude lo agregó (la contraseña guardada sigue siendo la
  vieja) y aclaró un comentario.
- **Incidente (Claude):** al probar el segundo mutante, Claude deshizo con `git checkout -- src`, y eso volvió a
  HEAD y borró los cambios de Qwen, que no estaban commiteados. Se restauraron a mano desde el diff ya leído (mismo
  `--stat`: 11 líneas agregadas y 7 quitadas en `src/`), y los mutantes se repitieron deshaciendo desde una copia.
  Regla: en un worktree sin commit, deshacer un mutante desde una copia, nunca con `git checkout`.
- **Rojo (Claude):** los 10 tests nuevos contra el `src/` de `927ccf6` → los 10 fallan (500).
- **Mutantes (Claude), todos detectados, uno por guarda:** registro `name`, `email`, `password` y `neighborhood`
  vueltos a `?.trim()` → falla su fila de A1a (con `email`, también las 2 de A1b); login `email` y `password` → su
  fila de A1c; sin `typeof currentPassword` y sin `typeof newPassword` → su fila de A1d.
- **Controles en el worktree:** servidor 30 archivos, **516/516**; `npx tsc -b` exit 0.
- **Riesgo:** `rsc risk` → **tier 2** (clase `auth`, por `authRoutes.ts`): 3 revisores y aprobación de Hernán.
- **Panel de 3 (2026-11-13):**
  - Seguridad, APPROVE: ningún dato que no es texto llega a `bcrypt`, a SQL ni a la búsqueda de la cuenta. El 400
    sale antes de buscar la cuenta, así que no revela si existe. El límite de pedidos lo sigue contando.
  - Corrección, APPROVE WITH NITS: `true`, `false`, `0`, `NaN`, `null`, listas, objetos y textos largos dan 400, y
    lo que andaba sigue igual.
  - Tests, APPROVE WITH NITS: no se borró ni se aflojó ningún test. Sobreviven 3 mutantes de «solo rechaza
    números», porque las filas de lista y objeto cubren solo `email` del registro: T-N1, A1b para los 4 campos;
    T-N2, A1d con una lista; T-N3, login con lista y objeto.
  - **Seguridad y corrección encontraron, cada uno por su lado, el mismo caso vecino (Q1):** un pedido **sin body**
    o con `text/plain` deja `req.body` en `undefined` en Express 5, y `const { … } = req.body` explota → 500.
    Claude lo reprodujo con el Express del servidor: sin body → `undefined`, `text/plain` → `undefined`, JSON →
    objeto. Ya pasaba antes de A1. También lo tienen las rutas de A2 y C, que hacen el mismo `= req.body`.

**Base medida (2026-11-13, `927ccf6`):** servidor 30 archivos, **506/506**; `npx tsc -b` exit 0. El servidor no tiene
script de lint.

## Next

### A1 — ronda 2 (2026-11-13)

- **Hecho por:** Qwen, mismo worktree, en una sola entrega con `worker_done`. En `src/` cambió solo lo pedido:
  `= req.body ?? {}` con su comentario en las 3 rutas, sin tocar las guardas. Su reporte decía que «amplió las
  guardas de solo números a solo texto»; el diff contra la copia de la ronda 1 muestra que no las tocó, así que la
  frase estaba mal redactada. Agregó las 20 filas A1e-A1h, conservó A1a-A1d y la afirmación de Claude en A1d, y no
  borró ni cambió ninguna línea de test. No usó nada de lo prohibido.
- **Ajuste (Claude):** los dos bloques A1h se reescribieron para que se lean de corrido: filas explícitas con la
  ruta, el texto y el código esperado, sin `undefined as unknown as object`.
- **Rojo (Claude):** A1h contra el `src/` de la ronda 1 → fallan las 6 filas (500). A1e-A1g pasan antes y después,
  como se esperaba: existen para matar el mutante «solo rechaza números».
- **Mutantes (Claude), deshechos desde una copia, `cmp` final OK, todos detectados:** M4, «solo rechaza números» en
  `name`, `password` y `neighborhood` del registro → sus 2 filas de A1e; M5, lo mismo en `email` y `password` del
  login → sus 2 filas de A1f; M6, `typeof x === 'number'` en cada campo del cambio de contraseña → sus 2 filas de
  A1g; M7, sin `?? {}` en cada una de las 3 rutas → sus 2 filas de A1h (repetido después del ajuste de lectura).
- **Controles en el worktree:** servidor 30 archivos, **536/536**; `npx tsc -b` exit 0.
- **Riesgo:** `rsc risk` → tier 2 (clase `auth`).
- **Panel de 3 sobre la ronda 2 (2026-11-13):**
  - Seguridad, APPROVE, sin hallazgos: sin body o con `text/plain`, el pedido llega a las guardas de la ronda 1 y
    nunca a `bcrypt`, a SQL ni a la búsqueda de la cuenta. El 400 no depende de que la cuenta exista. El límite de
    pedidos y el control de Origin miran la IP y los headers, así que no cambian. Un body `null` o una lista, un
    `__proto__` y los campos `email[]` de un formulario terminan en 400 sin contaminar nada.
  - Corrección, APPROVE: probó 14 formas de pedido contra Express 5. JSON vacío → `{}`; JSON `null`, `5`, `"x"`,
    `true` o mal escrito → Express lo rechaza antes de la ruta (400 `BAD_REQUEST`, que ya existía); lista →
    «faltan datos». `??` solo reemplaza `undefined` o `null`, así que no cambia ninguna respuesta que antes era
    correcta. Las filas «sin body» de A1h ejercitan de verdad `req.body === undefined`.
  - Tests, APPROVE WITH NITS: no se borró ninguna línea; las filas cubren los ítems A1a-A1h en las dos direcciones;
    sus mutantes nuevos quedan detectados o son equivalentes (`|| {}`, `=== undefined ? {} :`); `cmp` final OK.
    Sobreviven dos, los dos nits: (T2-N1) sacar `|| !currentPassword || !newPassword` del cambio de contraseña,
    porque ninguna fila manda `''` en esa ruta (ya pasaba antes de A1); (T2-N2) una guarda de login que rechaza
    número y objeto pero no `true`, porque ninguna fila manda un booleano.
  - Nit repetido por seguridad y corrección: en el cambio de contraseña, `!currentPassword || !newPassword` es
    redundante para los que no son texto, pero cubre `''` → `intentional`, se deja como está.

### A1 — cierre (2026-11-13)

- **Nits del panel cerrados (Claude, con el OK de Hernán):** A1i, cambio de contraseña con `''` en cada campo → 400 y
  la contraseña guardada sin cambiar (T2-N1); A1j, login con `true` en cada campo → 400 (T2-N2). Los mutantes que
  sobrevivían ahora quedan detectados: sin `|| !currentPassword || !newPassword` → las 2 filas de A1i; una guarda de
  login que rechaza solo números y objetos → su fila de A1j.
- **Pasado a `main` (carpeta principal, sin commit):** `git apply` del diff del worktree; los 4 archivos son iguales
  a los del worktree (`cmp`). En `main`: servidor 30 archivos, **540/540**; `npx tsc -b` exit 0.

### A2 (2026-11-13)

- **Hecho por:** Qwen, en el worktree `a2-tools-loans` (base `9342dd8`), en una sola entrega con `worker_done`.
  Tocó solo sus 4 archivos, no borró ni cambió ninguna línea de test y no usó nada de lo prohibido. El código es el
  del pedido: `req.body ?? {}` en las 3 rutas, `typeof … === 'string'` en publicar y en pedir préstamo, el chequeo
  de tipo del PATCH antes de editar o pausar, y la nota con `null` permitido.
- **Ajustes (Claude):** un comentario de la nota decía que `null` se rechaza, al revés del código; faltaba el
  comentario del `?? {}` en el PATCH. Los 3 bloques A2g declaraban `let res: ReturnType<typeof request>`, que es
  el tipo del cliente de pruebas, no el de la respuesta. `tsc -b` no lo ve porque los tests del servidor no se
  revisan con TypeScript (ítem (d)). Se reescribieron como en A1h, sin ese tipo.
- **Rojo (Claude):** contra el `src/` de `9342dd8` fallan 37 de las 38 filas; pasa A2f (`note: null` → 201), que
  existe para cuidar el comportamiento de hoy.
- **Mutantes (Claude), deshechos desde una copia, `cmp` final OK, los 12 detectados:** `?.trim()` de vuelta en
  `name` y `description` de publicar → sus 4 filas de A2a cada uno; guarda de `name` que rechaza solo números →
  las 3 filas de lista, objeto y booleano; sin el chequeo del PATCH → las 10 de A2b y A2c; chequeo del PATCH
  salteado al pausar → A2c; `?.trim()` en `startDate` y en `endDate` → sus 4 filas de A2d cada uno; sin el
  chequeo de la nota → las 4 de A2e; `null` rechazado en la nota → A2f; sin `?? {}` en cada ruta → sus 2 filas de
  A2g (repetido después de reescribir A2g).
- **Controles en el worktree:** servidor 30 archivos, **578/578**; `npx tsc -b` exit 0.
- **Riesgo:** `rsc risk` → tier 2, pero solo porque compara contra `origin/main` y arrastra `authRoutes.ts` de A1
  (sin push, ya aprobado). Los archivos de A2 son clase `default` → tier 1: **1 revisor** de contexto fresco, en
  curso. Hernán confirmó el 2026-11-13 que para A2 alcanza con un revisor.
- **Revisor (2026-11-13), APPROVE WITH NITS, 0 bloqueantes:** lo válido se comporta igual (`''`, espacios,
  `note: ''`, `note: null`, PATCH solo con `category`); un desconocido que manda `{name: 5}` recibe el mismo 400 que
  el dueño, así que no se entera de nada; el límite de 10 kb no cambia. Sobreviven 3 mutantes suyos: (A2-N1) el
  chequeo de `description` salteado al pausar, porque A2c prueba solo `name`; (A2-N2) `description` de publicar
  sin recortar, porque ningún test mira el recorte; (A2-N3) el chequeo de la nota movido después de las fechas,
  porque ningún test fija ese orden (y ninguna regla lo pide). Pregunta (A2-Q1): ningún test fija que un
  desconocido reciba 400 y no 403 con un tipo incorrecto.
- **Cierre de los nits (Claude, con el OK de Hernán):** A2h, editar con `{description: 5, is_paused: true}` → 400 y
  no se pausa (A2-N1); A2i, publicar con espacios alrededor del nombre y la descripción → se guardan recortados
  (A2-N2); A2j, un desconocido que edita con `{name: 5}` → 400 `BAD_REQUEST`, no 403, y la herramienta no cambia
  (A2-Q1). Los mutantes que sobrevivían quedan detectados: `description` salteada al pausar → A2h; sin recortar
  `description` o `name` → A2i; sin el chequeo del PATCH → A2b, A2c, A2h y A2j. A2-N3 (orden nota/fechas) →
  `intentional`: ninguna regla fija ese orden, y antes ese pedido daba 500.
- **Pasado a `main` (carpeta principal, sin commit):** `git apply` del diff del worktree; los 4 archivos son
  iguales a los del worktree (`cmp`). En `main`: servidor 30 archivos, **581/581**; `npx tsc -b` exit 0.
- **Bug viejo encontrado, fuera de alcance:** `PATCH` con `{name: '   '}` se acepta y guarda un nombre vacío,
  porque editar no valida largo ni vacío (publicar sí pide 3-60 caracteres). Ya pasaba antes de A2. Candidato
  para el backlog, junto con el ítem 6. El panel de 3 sobre todo lo que se suba va antes del push.

### B (2026-11-13)

- **Hecho por:** Qwen, en el worktree `b-deleted-account` (base `4b266ab`), en una sola entrega con `worker_done`.
  Tocó solo sus 4 archivos. El código es el del pedido: `AND deleted_at IS NULL` en `findByEmail` y en
  `updatePassword`, `updatePassword` devuelve `boolean`, y la ruta responde 404 `ACCOUNT_NOT_FOUND` si no cambió
  nada. En los tests, las únicas líneas viejas que cambiaron son las permitidas: el `updatePassword` falso (ahora
  respeta `deleted_at` y devuelve `true`/`false`), el `return` del helper con `mockUserRepo`, y `poolReturning`
  movido a nivel de archivo. Los `as unknown as [string, unknown[]]` copian el test existente de `findActiveById`.
- **Ajustes (Claude):** el comentario de `findByEmail` subió arriba de la consulta; se sacaron los
  `(client.query as any)` de B2a/B2b, que sobraban (en B2b ni hacía falta: `poolReturning([])` ya da `rowCount` 0).
- **Rojo (Claude):** contra el `src/` de `4b266ab` fallan B1a, B2a, B2b y B3; B1b y B4 pasan antes y después, como
  se esperaba (cuidan el comportamiento de hoy).
- **Mutantes (Claude), deshechos desde una copia, `cmp` final OK, los 5 detectados:** sin el filtro en
  `findByEmail` → B1a; sin el filtro en `updatePassword` → B2a; `updatePassword` siempre `true` → B2b; la ruta
  ignora el resultado → B3; la ruta invierte el chequeo → B4 y `returns 204 on successful password change`. (El
  primer intento de M3 no se aplicó: el script avisó «not found» por un texto de varias líneas; se repitió sobre una
  sola línea. M2 y M3 se repitieron después de los ajustes.)
- **Controles en el worktree:** servidor 30 archivos, **587/587**; `npx tsc -b` exit 0.
- **Riesgo:** `rsc risk` → **tier 2**, esta vez por B mismo (`userRepo.ts` es clase `auth`): panel de 3 y
  aprobación de Hernán. Panel en curso.
- **Panel de 3 (2026-11-13):**
  - Corrección, APPROVE WITH NITS: razonó (no ejecutó) los 5 órdenes posibles con READ COMMITTED y el
    `SELECT … FOR UPDATE` del borrado; en ninguno queda una contraseña conocida en la fila anonimizada. Si el
    borrado llega primero, el `UPDATE` espera el bloqueo, vuelve a mirar el `WHERE`, cambia 0 filas → 404; si el
    cambio llega primero, el borrado pisa la contraseña con una al azar. `findByEmail` solo lo usa el login y
    `updatePassword` solo esta ruta. El 404 coincide con `errorCodes.ts` y con D7 de la spec. Nits: el regex
    `/deleted_at IS NULL/` pasaría con `WHERE id = $2 OR deleted_at IS NULL` (B-N1); B3 prueba la reacción de la
    ruta, no el SQL contra Postgres (B-N2).
  - Seguridad, APPROVE WITH NITS: una cuenta borrada no entra por ningún lado (login por el correo anonimizado →
    el mismo `INVALID_CREDENTIALS`; el login sigue haciendo el bcrypt contra el hash falso, así que el tiempo no
    delata nada). Un error de la base sigue dando 500, no se disfraza de «no encontrada».
  - **Hallazgo fuera de B (S-Q1), confirmado por Claude en `server/src/modules/middleware/auth.ts`:**
    `authMiddleware` solo valida la firma y el vencimiento del JWT, no si la cuenta está borrada. Un token de una
    cuenta recién borrada sigue sirviendo hasta que vence (1 h) en las rutas de herramientas, préstamos y
    búsqueda, actuando como el usuario anonimizado. Solo `GET /api/me` y `PATCH /me/password` lo revisan.
    (Claude le había dicho al revisor que el middleware usaba `findActiveById`, sin comprobarlo: era falso.)
  - Tests, APPROVE WITH NITS: no se borró ni se aflojó ningún test o `expect`; los cambios al helper son los
    permitidos; B3 pasa por la razón correcta (el snapshot sin `deleted_at` deja seguir a la ruta, y el falso
    devuelve `false` porque la fila guardada quedó borrada). Mutantes suyos detectados: parámetros al revés, sin
    `client.release()`, `changed === undefined`. Equivalentes: `rowCount !== 0` y `rowCount === 1` (`pg` nunca da
    `null` en un `UPDATE` y `id` es la clave). **Sobrevive (B-N1, lo mismo que marcó corrección):**
    `WHERE email = $1 OR TRUE -- deleted_at IS NULL` pasa los 43 tests, porque el regex solo busca el texto.
- **Aprobación de Hernán (tier 2) para B: dada el 2026-11-13.** También decidió: cerrar B-N1 (hecho) y llevar
  S-Q1 (sesión de una cuenta borrada) al backlog como ítem propio, después de C.
- **Cierre de B-N1 (Claude):** B1a exige `WHERE email = $1 AND deleted_at IS NULL` y B2a
  `WHERE id = $2 AND deleted_at IS NULL`, la condición entera. Ahora quedan detectados `OR TRUE -- deleted_at IS
  NULL` en cada consulta y `deleted_at IS NOT NULL`. Como los tests con una base falsa no ejecutan SQL, la prueba
  de staging corre además las dos consultas contra el Postgres real (ver Checklist, Staging).
- **Pasado a `main` (carpeta principal, sin commit):** `git apply` del diff del worktree; los 4 archivos son
  iguales a los del worktree (`cmp`). En `main`: servidor 30 archivos, **587/587**; `npx tsc -b` exit 0.

### C (2026-11-13)

- **Hecho por:** Qwen, en el worktree `c-loan-status` (base `01ed430`), en una sola entrega con `worker_done`.
  Tocó solo sus 4 archivos, no borró ni cambió ninguna línea de test y no usó nada de lo prohibido (ni casteos).
  El código es el del pedido, sin desvíos: `Object.hasOwn` en los dos niveles de la tabla, `req.body ?? {}`, y el
  chequeo `typeof newStatus !== 'string'` después del `Missing status` que ya existía. Esta vez no hizo falta
  ningún ajuste de lectura.
- **Rojo (Claude):** contra el `src/` de `01ed430` fallan las 11 filas; la de `['aceptado']` falla con un **200**.
- **Mutantes (Claude), deshechos desde una copia, `cmp` final OK, los 5 detectados:** la búsqueda vieja → las 4 de
  C1 y C4; `hasOwn` solo en el primer nivel → las 4 de C1 y C4; sin el chequeo de tipo → las 4 de C2; solo rechaza
  listas → las 3 filas de número, objeto y booleano de C2; sin `?? {}` → las 2 de C3.
- **Controles en el worktree:** servidor 30 archivos, **598/598**; `npx tsc -b` exit 0.
- **Riesgo:** `rsc risk` → tier 2 solo por lo que arrastra de A1 y B (sin push, ya aprobados); los archivos de C son
  clase `default` → tier 1: **1 revisor** de contexto fresco, como en A2.
- **Revisor (2026-11-13), APPROVE WITH NITS, 0 bloqueantes:** los cambios válidos y los chequeos de rol no cambian;
  `''`, `0`, `false` y `null` siguen dando `Missing status`; un préstamo guardado en `vencido` o `devuelto` sigue
  dando 409; `Object.hasOwn` necesita Node 16.9+ y el proyecto pide `>= 20` (Railpack lee ese `engines`); el
  mensaje 409 que repite `__proto__` es solo texto en JSON; un desconocido recibe `LOAN_NOT_FOUND` antes de llegar
  a la tabla. Sobreviven 3 mutantes suyos: (C-N1) poner el chequeo de tipo antes del `Missing status`, porque
  ninguna fila manda `0`, `false`, `''` o `null` (con el cambio, `{status: 0}` diría `Status must be text`);
  (C-N2) sacar o cambiar por `in` el `hasOwn` del primer nivel, porque ningún test guarda un préstamo con estado
  `constructor` (la base no lo permite: es una defensa extra).
- **Cierre de los nits (Claude, con el OK de Hernán):** C5, `status` `0`, `false`, `''` o `null` → 400
  `Missing status` (C-N1); C6, un préstamo guardado con estado `__proto__` que pide `constructor`, y uno con
  `constructor` que pide `name` → 409 (C-N2). Las parejas se eligieron para que, sin el `hasOwn` de afuera, la
  búsqueda encuentre algo: `Object.prototype.constructor` (una función → 500) u `Object.name` (el texto «Object» →
  403). Con un estado guardado `constructor` y el pedido `aceptado`, el mutante habría pasado igual, porque
  `Object.aceptado` no existe. Ahora quedan detectados: el chequeo de tipo antes del de faltante → las filas `0`,
  `false` y `null` de C5 y otros 3 tests (la fila `''` es texto y no cambia: cuida lo de hoy); sin el `hasOwn` de
  afuera, o cambiado por `in` → las 2 de C6.
- **Pasado a `main` (carpeta principal, sin commit):** `git apply` del diff del worktree; los 4 archivos son
  iguales a los del worktree (`cmp`). En `main`: servidor 30 archivos, **604/604**; `npx tsc -b` exit 0.

### Panel de cierre sobre `origin/main..main` (2026-11-13)

- **Seguridad, APPROVE, sin hallazgos:** todos los 400 nuevos dependen solo del body y salen antes de buscar en la
  base, así que el dueño, un desconocido y un recurso que no existe reciben lo mismo. Los logs solo guardan errores
  inesperados, no el body. Ningún dato mal armado llega a SQL, `bcrypt` ni a la tabla de estados. El límite de
  pedidos y el control de Origin siguen antes de cada ruta cambiada. Preguntas: el registro no usa `findByEmail`
  (detecta el correo repetido por la restricción de la base) → `irrelevant`; el mensaje 409 mezcla español y el
  texto del usuario → `irrelevant`, la app muestra su propio mensaje por código.
- **Corrección, APPROVE WITH NITS:** las 9 rutas que leen el body usan `req.body ?? {}` y cada `.trim()` está detrás
  de su chequeo de tipo. Todos los códigos usados existen en `errorCodes.ts` y tienen su mensaje en español en
  `client/src/errors/messages.ts` (`BAD_REQUEST` → el genérico). Ningún pedido válido cambia de respuesta, y no
  contradice la spec de error-codes (el único cambio de estado HTTP es el 404 de B, la excepción D7). Nits: nota antes
  que fechas (ya `intentional`, A2-N3); `is_paused` antes que el tipo del nombre al editar (los dos son 400) →
  `intentional`. Pregunta: los parámetros de la URL de la búsqueda (`?q=a&q=b` llega como lista) no se revisan →
  **ítem 5e del backlog**, aprobado por Hernán.
- **Tests, APPROVE, sin hallazgos:** suite 30 archivos, **604/604**. Entre los 4 commits no se borró ni cambió ningún
  `it(`, `it.each(` ni `expect`; las únicas líneas viejas quitadas son las permitidas (el `updatePassword` falso, el
  `return` del helper y el `poolReturning` movido). Cada ID del Checklist (A1a-A1j, A2a-A2j, B1a-B4, C1-C6) tiene su
  test. 10 mutantes que cruzan rutas: 8 detectados (sin `note !== null`, sin los chequeos de vacío en la contraseña,
  `endDate` sin chequeo de tipo, sin `description` en el chequeo del PATCH, sin el `hasOwn` interno,
  `!newStatus` → `=== undefined`, sin el filtro de `findByEmail`, `updatePassword` siempre `true`) y 2
  equivalentes (`?? {}` → `|| {}`: `express.json` estricto nunca da un body falso que no sea `undefined`).
  Restauración: `cmp` de los 6 archivos OK y `git status -- server` vacío; Claude lo volvió a comprobar.
- **Panel registrado:** `npx @ericrisco/rsc review ledger panel error-codes/server-input-bugs --lenses
  correctness,security,tests` → «panel of 3 recorded» sobre `46ae0e6` (el último `docs(auto)` encima de `c061115`).

### Staging (2026-11-13)

- **Deploy:** `railway up -e staging --service prestoteca --ci` (el CLI estaba vinculado a production, así que se
  pasaron entorno y servicio explícitos) → staging `a0090901` SUCCESS; production sin cambios (`546abcc2`, 00:50).
  `/api/health` → 200. Node en el contenedor: v20.20.2 (`Object.hasOwn` disponible).
- **`curl` contra staging, todo como se esperaba** (salidas en el scratchpad de la sesión, carpeta `staging-5b/`):
  login con `email: 5` y login sin body → 400 `LOGIN_MISSING_FIELDS`; publicar con `name: 5` → 400
  `TOOL_MISSING_FIELDS`; pedir préstamo sin body → 400 `LOAN_DATES_MISSING`; con `note: 5` → 400 `The note must be
  text`; estado `"constructor"` y `"__proto__"` → 409 `LOAN_TRANSITION_INVALID`; `["aceptado"]` → 400 `Status must be
  text`; sin body → 400 `Missing status`; el préstamo sigue `pendiente`; el cambio válido a `rechazado` → 200; editar
  con `{description: 5, is_paused: true}` → 400 y la herramienta sigue sin pausar. (La primera tanda falló por un
  dato de prueba mío: la «é» de «eléctricas» mandada desde Git Bash; se repitió con la categoría `Otros`.)
- **B contra el Postgres real**, desde el contenedor de staging (`railway ssh`; la base no tiene puerto público), con
  una cuenta borrada desde la app, todo dentro de una transacción con `ROLLBACK`: `findByEmail` con el correo
  anonimizado → 0 filas; el `UPDATE` con `AND deleted_at IS NULL` → 0 filas; control, el mismo `UPDATE` sin el
  filtro → 1 fila; después del `ROLLBACK` la fila no tiene la contraseña de prueba. **El filtro protege.**
- **Bug viejo y grave encontrado (S1):** la tabla `users` **no tiene la columna `updated_at`** (ninguna migración la
  crea: solo `loans` la tiene), pero `updatePassword` y `userRepo.update` hacen `SET … updated_at = now()`, y eso ya
  estaba en `origin/main`. Por eso **cambiar la contraseña responde 500 siempre**: comprobado en staging con una
  cuenta nueva y un cambio válido → 500 `INTERNAL_ERROR` «Failed to change password». Los tests no lo ven porque
  usan una base falsa. La primera corrida del script de B chocó con eso (`column "updated_at" of relation "users"
  does not exist`); la prueba de B se hizo sin esa columna. Producción usa las mismas migraciones, así que
  probablemente pasa lo mismo (sin comprobar). Las migraciones no se corren solas en el deploy (Railway solo hace
  `cd server && npm start`).
- **S1 en producción, confirmado (2026-11-13, con el OK de Hernán, solo lectura de `information_schema` desde el
  contenedor de producción):** columnas de `users` = `id, name, email, password_hash, neighborhood, created_at,
  deleted_at`. **No hay `updated_at`: hoy en producción nadie puede cambiar su contraseña.**
- **Decisión de Hernán sobre S1:** sacar `updated_at` del SQL (sin migración), como **tarea D** de este FTD, antes del
  push. S2 va al backlog como ítem **5f**.
- **Bug viejo encontrado (S2):** un id que no es UUID en la URL (`/api/tools/not-a-uuid`) → 500 en vez de 404.
  Postgres rechaza el texto en una columna `uuid`. Un UUID válido que no existe sí da 404. No es de 5b.

**Aprobación de Hernán (tier 2) para A1: dada el 2026-11-13**, con la condición de que la ronda 2 agregue los tests
que faltan (T-N1 a T-N3). También decidió: Q1 (pedido sin body) entra a este FTD, en cada tarea (ver Scope, (a')),
y la ronda 2 de A1 (A1e-A1h) la hace Qwen. **A1 commiteado en `main` como `9342dd8` (2026-11-13), sin push:** se sube cuando A2, B y C estén y se pruebe en
staging. Worktree `a1-auth-types` y su rama `HRamiroAlbornoz/a1-auth-types` borrados (el worktree era idéntico a
`9342dd8`). **Pedido de A2 armado (2026-11-13):** `A2-brief.md` en el scratchpad de la sesión, 38 filas (A2a-A2g) y 8
mutantes (M1-M8), base `9342dd8`. **A2 commiteado en `main` como `4b266ab` (2026-11-13), sin push.** Worktree `a2-tools-loans` y su rama borrados
(el worktree era idéntico a `4b266ab`). **B commiteado en `main` como `01ed430` (2026-11-13), sin push.** Worktree `b-deleted-account` y su rama borrados
(el worktree era idéntico a `01ed430`). **Pedido de C armado (2026-11-13):** `C-brief.md` en el scratchpad de
la sesión, 11 filas (C1-C4) y 5 mutantes (M1-M5), base `01ed430`. **Staging hecho y tarea D sumada (2026-11-13).** El pedido de D está armado (`D-brief.md` en el scratchpad de la
sesión: 5 tests D1-D3, 3 mutantes; el helper de D3 se probó contra las migraciones reales y lee las 7 columnas).
Siguiente: lanzar D a Qwen en el worktree nuevo `d-password-column` (base `56720b2`) cuando Hernán diga que sí; después
`rsc risk` (tier 2 esperado: `userRepo.ts`), panel, commit, de nuevo a staging (cambio de contraseña → 204, login
con la vieja → 401, con la nueva → 200), y recién ahí el push. Historial: **las 4 tareas commiteadas en `main`, sin
push (2026-11-13):** A1 `9342dd8`, A2 `4b266ab`, B `01ed430`, C
`c061115` (604/604). Worktree `c-loan-status` y su rama borrados (era idéntico a `c061115`). Nota: en `main` el
control de rsc (`.rsc/asdd-gate.mjs`, línea 345) no pide spec ni panel registrado. Igual va el panel de 3, como se
acordó. **Cierre, en orden:** (1) panel de 3 sobre el código de `origin/main..main`; (2) staging con
`railway up -e staging` (con el OK de Hernán): casos con `curl` y, para B, crear una cuenta, borrarla y correr las
dos consultas contra el Postgres de staging dentro de una transacción con `ROLLBACK`; (3) push de Hernán, deploy de
producción y smoke test (`/api/health`). Historial: **C lanzado a Qwen el
2026-11-13** (run `run_5512b0b13d6d`,
dispatch `ctx_99eb80ccd266`, task `task_9ba0c9088d02`, worktree
`C:/Users/hralb/orca/workspaces/prestoteca/c-loan-status`, base `01ed430`). Cuando entregue: copiar `src/` antes de
tocar nada, comparar los `it(` y los `expect` contra `01ed430`, rojo, mutantes M1-M5 deshechos desde la copia,
suite y `tsc -b`, `rsc risk` y la revisión que pida. Historial: **pedido de B armado (2026-11-13):** `B-brief.md` en el
scratchpad de la sesión, 6 tests (B1a-B4) y 5 mutantes (M1-M5), base `4b266ab`. **B lanzado a Qwen el 2026-11-13** (run
`run_5512b0b13d6d`, dispatch `ctx_a218a89a8cb4`, task `task_0ea86c5765d9`, worktree
`C:/Users/hralb/orca/workspaces/prestoteca/b-deleted-account`, base `4b266ab`). Cuando entregue: copiar `src/` antes
de tocar nada, comparar los `it(` y los `expect` contra `4b266ab` (solo cambia el helper permitido), rojo, mutantes
M1-M5 deshechos desde la copia, suite y `tsc -b`, `rsc risk` y la revisión que pida. Historial: **A2 lanzado a Qwen el
2026-11-13** (run `run_5512b0b13d6d`,
dispatch `ctx_6d0651668cfa`, task `task_46f8efbf91b4`, worktree
`C:/Users/hralb/orca/workspaces/prestoteca/a2-tools-loans`, base `9342dd8`). Cuando entregue: copiar `src/` antes de
tocar nada, comparar los `it(` contra `9342dd8`, rojo, mutantes M1-M8 deshechos desde la copia, suite y `tsc -b`,
`rsc risk` y la revisión que pida. Historial: **ronda 2 lanzada el 2026-11-13** al mismo worktree (dispatch
`ctx_2f570a81b730`, task `task_22d2f11580da`, mismo run; pedido `A1-round2.md` en el scratchpad de la sesión).
Cuando entregue: comparar los `it(` contra el diff de la ronda 1 (`A1-qwen.diff` en el scratchpad), rojo de A1h,
mutantes M4-M7 deshechos desde una copia (nunca `git checkout`), suite y `tsc -b`. Antes: A1 lanzado a Qwen el 2026-11-13 (Orca run `run_5512b0b13d6d`, dispatch `ctx_ff5b6d6aeaf4`, task
`task_75a389e45a04`, worktree `C:/Users/hralb/orca/workspaces/prestoteca/a1-auth-types`, base `927ccf6`; pedido en
el scratchpad de la sesión, `A1-brief.md`). Cuando entregue: correr los checks, comparar los `it(` contra HEAD,
probar los mutantes M1-M3, `rsc risk` y la revisión que pida.
