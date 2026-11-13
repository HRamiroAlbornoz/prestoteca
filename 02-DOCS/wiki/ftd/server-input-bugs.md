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

- [ ] **A1 — Tipo incorrecto en auth.** Tests en `authRoutes.test.ts` y `meAccountRoutes.test.ts`:
  - A1a: registro con cada uno de los 4 campos como número → 400 `REGISTER_MISSING_FIELDS` (un caso por campo).
  - A1b: registro con un campo como lista y como objeto → 400 `REGISTER_MISSING_FIELDS`.
  - A1c: login con `email` y con `password` como número → 400 `LOGIN_MISSING_FIELDS`.
  - A1d: cambio de contraseña con `currentPassword` y con `newPassword` como número → 400
    `PASSWORD_CHANGE_MISSING_FIELDS`, y no se llamó a `updatePassword`.
  - Prueba: los tests nuevos fallan hoy (500) y pasan después; suite del servidor en verde.
- [ ] **A2 — Tipo incorrecto en herramientas y préstamos.** Tests en `toolsRoutes.test.ts` y `loansRoutes.test.ts`:
  - A2a: publicar con `name` o `description` como número → 400 `TOOL_MISSING_FIELDS`.
  - A2b: editar con `name` o `description` como número → 400 `BAD_REQUEST`, y no se llamó a `service.edit`.
  - A2c: pedir préstamo con `startDate` o `endDate` como número → 400 `LOAN_DATES_MISSING`.
  - A2d: pedir préstamo con `note` como número → 400 `BAD_REQUEST`.
  - Prueba: los tests nuevos fallan hoy y pasan después; suite del servidor en verde.
- [ ] **B — Contraseña en una cuenta borrada.** Tests en `userRepo.test.ts` y `meAccountRoutes.test.ts`:
  - B1: el SQL de `updatePassword` y el de `findByEmail` incluyen `deleted_at IS NULL`.
  - B2: `updatePassword` sobre una cuenta ya borrada no cambia nada y devuelve `false`.
  - B3: la cuenta se borra entre la lectura y la escritura → la ruta responde 404 `ACCOUNT_NOT_FOUND`, no 204.
  - B4: login con el correo anonimizado de una cuenta borrada → 401, igual que un correo desconocido.
  - Prueba: los tests nuevos fallan hoy y pasan después; suite del servidor en verde.
- [ ] **C — Estado de préstamo con nombre heredado o que no es texto.** Tests en `loanService.test.ts` y
  `loansRoutes.test.ts`:
  - C1: `transition` con `constructor`, `toString` y `__proto__` → `LOAN_TRANSITION_INVALID` y no se llamó a
    `updateStatus`.
  - C2: la ruta con `status` como lista (`["aceptado"]`), número u objeto → 400 `BAD_REQUEST`.
  - Prueba: C1 y C2 fallan hoy y pasan después; suite del servidor en verde.
- [ ] **Controles:** en `server/`, `npx vitest run`, `npx tsc -p .` y el lint que tenga, en verde; `rsc risk` del diff
  y la revisión que pida.
- [ ] **Staging:** los cuatro casos a mano contra staging con `curl` (un número en el login, `"constructor"` como
  estado, una lista como estado), con la respuesta copiada. (b) no se puede provocar a mano a tiempo: alcanzan los
  tests.

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

**Aprobación de Hernán (tier 2) para A1: dada el 2026-11-13**, con la condición de que la ronda 2 agregue los tests
que faltan (T-N1 a T-N3). Falta que Hernán decida si Q1 (pedido sin body) entra a este FTD, y si la ronda 2
(T-N1 a T-N3, más Q1 si entra) la hace Qwen o Claude. Antes: A1 lanzado a Qwen el 2026-11-13 (Orca run `run_5512b0b13d6d`, dispatch `ctx_ff5b6d6aeaf4`, task
`task_75a389e45a04`, worktree `C:/Users/hralb/orca/workspaces/prestoteca/a1-auth-types`, base `927ccf6`; pedido en
el scratchpad de la sesión, `A1-brief.md`). Cuando entregue: correr los checks, comparar los `it(` contra HEAD,
probar los mutantes M1-M3, `rsc risk` y la revisión que pida.
