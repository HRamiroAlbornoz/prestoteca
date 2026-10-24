---
author: HRamiroAlbornoz
branch: fix/security-hardening
status: in-progress
---
# Arreglos de seguridad y errores del backend

## Intent

Cerrar 4 defectos encontrados durante el arreglo del deploy (ver `railway-deploy.md`). Los cuatro
contradicen reglas del brief (`docs/brief.md`, «Requisitos no funcionales → Seguridad») o la
decisión D4 (`02-DOCS/wiki/sdd/decisions.md`).

1. **El chequeo de `Origin` no cubre `/api/auth/*`.** `routes.ts:34` monta `authRoutes` antes de
   `app.use('/api', originChecker)` (`routes.ts:47`). El brief pide verificar `Origin` en todo POST,
   PATCH y DELETE. Hoy un `POST /api/auth/login` sin `Origin` llega al handler.
2. **El login revela qué emails están registrados.** `authRoutes.ts:94-100` responde
   `404 User not found` o `401 Invalid password` según el caso. Además, `authService.login` no corre
   bcrypt cuando el usuario no existe, así que la respuesta es más rápida: se nota midiendo el tiempo.
3. **Los errores internos llegan al cliente.** Los `catch` de las rutas devuelven `err.message` con
   400 para *cualquier* error. Un error de PostgreSQL sale tal cual (`relation "tools" does not exist`).
   El brief pide mensajes genéricos y el detalle en los logs. Tampoco hay un middleware de errores global.
4. **Borrar una cuenta con herramientas o préstamos falla y deja datos a medias.**
   `DELETE /api/me/account` (`meAccountRoutes.ts:67-92`):
   - pone `NULL` en `loans.borrower_id` y `loans.owner_id`, que son `NOT NULL`;
   - borra la fila de `users`, que `tools.owner_id` referencia con una FK;
   - no usa una transacción: si falla a mitad de camino, las herramientas ya quedaron borradas y
     la cuenta sigue existiendo;
   - no borra la cookie de sesión: el navegador sigue autenticado hasta 1 h con la cuenta borrada
     (el cliente borra `localStorage.token`, pero la sesión vive en una cookie `httpOnly`).

   Verificado en el esquema de producción (2026-10-21): `loans.borrower_id`, `loans.owner_id` y
   `tools.owner_id` son `nullable=NO`, con FK a `users(id)`. El test `anonymizes loans on account
   deletion (AC 117)` está en verde porque su mock acepta `NULL`: **los mocks no detectan este bug**.

## Decisiones (aprobadas por Hernán, 2026-10-21)

- **D-a — Borrar una cuenta = anonimizar la fila de `users`, no borrarla** (es lo que ya dice D4).
- **D-b — Con préstamos activos, el borrado se rechaza con 409.** Activos = `pendiente`, `aceptado`,
  `entregado` o `vencido`, como dueño o como solicitante. Es la misma regla que RF-07 aplica al borrar
  una herramienta. El perfil muestra el mensaje del servidor. Consecuencia aceptada: un pedido
  pendiente de otra persona bloquea el borrado hasta que el dueño lo rechace.
- **D-c — Se acepta que el registro revele si un email existe** (`409 Email already exists`).
  Evitarlo exige verificar el email por correo, que el brief deja fuera del MVP. Lo mitiga el límite
  de 5 intentos por minuto.
- **D-d — Se acepta el riesgo residual del JWT:** un token robado de una cuenta borrada sigue valiendo
  hasta 1 h. Revisar `deleted_at` en cada request cuesta una consulta por request; no se justifica hoy.
- **D-e — Carrera aceptada en el borrado:** si alguien pide una herramienta justo entre el chequeo de
  préstamos activos y el borrado lógico (milisegundos), ese pedido queda `pendiente` sobre una
  herramienta borrada. El dueño ya no existe para aceptarlo, así que no avanza (el solicitante puede
  cancelarlo). Evitarlo exigiría bloquear las filas de `tools` (`SELECT … FOR UPDATE`) tanto en el
  borrado como en la creación de préstamos; se puede sumar si aparece en la práctica.

## Scope

**Entra:**

- **(1) Origin.** Montar `app.use('/api', originChecker)` en `routes.ts` **antes** de `authRoutes`, y
  quitar el `app.use('/api/tools', originChecker)` que queda redundante. Cubre también el logout.
- **(2) Login.**
  - Una única respuesta `401 { code: 'UNAUTHORIZED', message: 'Invalid credentials' }` para email
    inexistente y para contraseña incorrecta.
  - Cuando el email no existe, `bcrypt.compare` contra un **hash ficticio generado al arrancar con el
    mismo `SALT_ROUNDS` (12)** que los hashes reales, para que el tiempo de respuesta sea parecido.
- **(3) Errores.**
  - Clase `AppError` (`status`, `code`, `message`) y subclases para los errores esperados
    (validación 400, prohibido 403, no encontrado 404, conflicto 409). Los mensajes no cambian.
  - Un helper único para los `catch`: si es `AppError`, responde con sus datos; si no, responde
    `500 { code: 'INTERNAL_ERROR', message: <genérico> }` y escribe el error en el log.
  - Alcance: los 5 archivos de rutas (`authRoutes`, `toolsRoutes`, `loansRoutes`, `meRoutes`,
    `meAccountRoutes`) y todos los `throw new Error` de servicios y repos que hoy viajan al cliente.
  - Un middleware de errores global al final de `index.ts`, para lo que escape (JSON mal formado →
    400 genérico, body demasiado grande → 413, cualquier otro → 500 genérico).
  - El log **nunca** incluye `req.body` (puede traer contraseñas).
- **(4) Borrado de cuenta.**
  - Migración `004_add_users_deleted_at.sql`:
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL`. Es aditiva: el código
    viejo la ignora, así que puede aplicarse antes del deploy.
  - Todo en **una transacción**, con un helper `withTransaction(pool, fn)` que toma un cliente del
    pool y hace `BEGIN` / `COMMIT` / `ROLLBACK`. El SQL del borrado vive en un solo lugar y usa ese
    cliente (no se refactorizan todos los repos).
  - Dentro de la transacción: chequear préstamos activos (si hay → 409 y `ROLLBACK`); borrado lógico
    de las herramientas; en `users`, nombre `Usuario eliminado`, email `deleted-<id>@invalid`
    (libera el email original), `password_hash` = hash bcrypt real (costo 12) de un valor aleatorio, y
    `deleted_at = now()`.
  - Se eliminan `anonymizeByBorrower` y `anonymizeByOwner` de `loanRepo`.
  - La respuesta 204 incluye `res.clearCookie('token')`.
  - El barrio (`neighborhood`) se conserva: no identifica a la persona por sí solo.
- **Tests.**
  - Tests primero (rojo → verde) para cada punto.
  - Tests que cambian **a propósito** (el comportamiento esperado cambia, no es regresión):
    `authRoutes.test.ts:112` (espera 404 → ahora 401) y los de anonimización en
    `meAccountRoutes.test.ts` (esperan `NULL` → ahora fila anonimizada).
  - El test de (1) tiene que ejercitar el `wireRoutes` real, no una app armada a mano dentro del
    test: si no, prueba el mock y no el cableado.
  - Se arreglan los 3 tests rojos de `loansRoutes.test.ts`: usan fechas fijas (`2026-10-15`) que ya
    pasaron. Se cambian por fechas relativas a hoy. Es necesario porque esta feature toca
    `loansRoutes.ts`, y con esos 3 en rojo no hay red de seguridad para el `POST` de préstamos.
- **Smoke test en el repo** (aprobado 2026-10-21): `server/scripts/smoke.mjs`, sin dependencias,
  uso `node server/scripts/smoke.mjs <url-base>`. Parte del script del arreglo del deploy (19 chequeos)
  y suma los casos nuevos: login con email inexistente = mismo 401 que con contraseña mala,
  `POST /api/auth/login` sin `Origin` → 403, registro con un email repetido → 409 (bug de T5),
  préstamo ajeno → el mismo 404 que uno inexistente, borrado de cuenta con préstamo activo → 409 y borrado de
  cuenta sin préstamos activos → 204 con la cookie borrada. Al final borra sus propios usuarios de
  prueba, así no deja basura en la base.
- **Verificación real** (porque los mocks no alcanzan): en staging, borrar una cuenta con herramientas
  y un préstamo devuelto (→ 204, fila anonimizada, préstamo intacto) y una con un préstamo activo (→ 409).
- **Backup de producción** antes de la migración: `pg_dump` en formato SQL plano dentro del contenedor
  de Postgres por `railway ssh`, con la salida guardada en un archivo local. Primero se prueba en
  staging. El archivo se valida: tiene que contener el `COPY` de `users`, `tools` y `loans`, y la
  cantidad de filas de cada tabla tiene que coincidir con un `count(*)` en vivo.

**No entra:**

- Invalidar el JWT en el acto (D-d).
- Ocultar la existencia de un email en el registro (D-c).
- Un runner de migraciones automático (la 004 se aplica a mano).
- Los 4 tests rojos del cliente (`requestLoan.test.tsx`), las vulnerabilidades de dependencias y las
  categorías de la base.
- **Hallazgo nuevo, para otra feature:** pedir una herramienta **pausada** no se rechaza.
  `loansRoutes.ts:60` filtra `deleted_at IS NULL` pero no `is_paused`, y la spec pide 409.
- ~~Hallazgo: el vencimiento automático calcula «hoy» en UTC.~~ **Retirado en T3 (2026-10-21):**
  `index.ts:15` fija `process.env.TZ = 'America/Argentina/Tucuman'` al arrancar, así que la «hora local
  del servidor» ya es la de Tucumán. No hay bug. (Queda frágil: depende de que `index.ts` cargue antes
  que cualquier cálculo de fechas; los tests que importan los servicios directo no lo cargan.)
- Mensajes en inglés que ve el usuario (`Invalid credentials`, `Login failed`): la app está en
  castellano, pero traducir los mensajes es otra feature.

## Checklist

- [x] T1 — Worktree `.worktrees/fix-security-hardening` con la rama `fix/security-hardening` desde
  `main` (OpenCode sigue abierto en la carpeta principal) y `npm install` en el worktree.
  Prueba: `git worktree list` y que `npm install` termine sin error.
- [x] T2 — Arreglar los 4 tests de fechas (3 de `loansRoutes.test.ts` y 1 de `loanService.test.ts`). Prueba: server 205/205 verdes
  antes de tocar código de la app.
- [x] T3 — (1) Origin en `/api/auth`. Prueba: test sobre el `wireRoutes` real en rojo → verde
  (`POST /api/auth/login` sin `Origin` → 403; con `Origin` → llega al handler).
- [x] T4 — (2) Login. Prueba: tests en rojo → verde (email inexistente y contraseña mala → mismo 401 y
  mismo cuerpo; con email inexistente, `bcrypt.compare` se llama igual).
- [x] T5 — (3) Errores. Prueba: tests en rojo → verde (un error inesperado del repo → 500 genérico sin
  el texto original; JSON mal formado → 400 genérico; los errores esperados conservan status y mensaje).
- [x] T6 — (4) Migración 004 + borrado de cuenta. Prueba: tests en rojo → verde (con préstamos
  activos → 409 y nada cambia; sin préstamos activos → 204, `Set-Cookie` que borra `token`, fila
  anonimizada, herramientas borradas, préstamos intactos; si falla un paso → `ROLLBACK`; el email
  original se puede registrar otra vez).
- [x] T6b — `server/scripts/smoke.mjs` en el repo con los casos nuevos. Prueba: corre contra staging
  en T9 y termina en `SMOKE OK`.
- [x] T6c — (aprobado 2026-10-24) Cada limitador con su propio contador: navegar la app no consume el
  cupo de login, y los logins no consumen el cupo general. Prueba: test en rojo → verde.
- [x] T7 — Suite completa, lint y type-check. Prueba: server todo verde; client 144/148 (los mismos
  4 rojos de antes); `tsc -b` y `oxlint` sin errores.
- [x] T8 — Push de la rama y staging apuntando a `fix/security-hardening`. Prueba: deploy de staging
  en `SUCCESS` con el commit de la rama.
- [x] T9 — Staging: backup de prueba validado, migración 004, smoke test ampliado y los dos borrados
  reales (204 y 409). Prueba: validación del backup, `ok 004`, salida del smoke test.
- [ ] T10 — Producción **antes del merge**: backup validado y migración 004. Prueba: archivo de
  backup con las 3 tablas y conteos que coinciden; `ok 004`; health sigue en 200.
- [ ] T11 — PR mergeado a `main` (deploya solo). Prueba: commit en `origin/main` y deploy de
  producción en `SUCCESS`.
- [ ] T12 — Producción: smoke test ampliado. Staging de vuelta a `main`. Prueba: salida del smoke
  test y deploy de staging en `SUCCESS` con `main`.

## Plan de rollback

- **Código:** volver al deploy anterior desde Railway. El código viejo ignora `deleted_at`.
- **Migración:** no hace falta revertirla (es una columna nullable sin uso para el código viejo).
  Si se quisiera, `ALTER TABLE users DROP COLUMN deleted_at`.
- **Datos:** el backup de T10.

## Evidence

- **T1** (2026-10-21): `git worktree list` →
  `E:/Trabajo/prestoteca/.worktrees/fix-security-hardening 30835af [fix/security-hardening]`.
  `npm install` → `added 419 packages` sin errores. La rama sale de `30835af`: `main` local tiene
  3 commits `📝 docs(auto)` de la sincronización de conocimiento de RSC (solo este documento y el
  índice) que no están en `origin/main` (protegida). Viajan a `main` dentro del PR de esta rama.
  Desde T1, este documento se edita en el worktree, no en la carpeta principal.

- **Línea base en el worktree** (2026-10-21): server `Tests 4 failed | 201 passed (205)`. Hay un rojo
  nuevo respecto de ayer: `loanService.test.ts > auto-vencido: entregado loan not past end_date → no
  change` (`expected 1 to be +0`). Usa `end_date: '2026-10-20'` y simula `Date.now()` en
  `2026-10-10`, pero el código crea la fecha con `new Date()` sin argumentos, y eso no pasa por
  `Date.now()` en el mock: toma la fecha real (21/10) y el préstamo sale vencido. Es la misma
  causa (fechas fijas que el calendario alcanzó). **T2 pasa a cubrir 4 tests**, no 3.

- **T2** (2026-10-21):
  - `loansRoutes.test.ts`: las 5 fechas de los `POST` pasan a `daysFromToday(5)` y `daysFromToday(15)`.
    Las fechas de los préstamos ya guardados en los mocks quedan fijas: ningún código las compara con hoy.
  - **Test que pasaba por la razón equivocada:** `returns 400 when borrower is the tool owner` daba 400
    por la fecha vencida, no por el chequeo de dueño. Ahora también verifica el mensaje
    (`/propia herramienta/`).
  - `loanService.test.ts`: los dos tests de `autoVencido` reemplazaban `global.Date` a mano y lo
    restauraban después de los `expect` (si fallaba un `expect`, el `Date` falso quedaba para el resto
    de los tests). Pasan a `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime(...)`, con
    `vi.useRealTimers()` en un `afterEach`.
  - Resultado: server `Test Files 22 passed (22)`, `Tests 205 passed (205)`. Los dos archivos tocados
    dan `32 passed (32)` con `TZ` = `America/Argentina/Tucuman`, `Pacific/Kiritimati` (UTC+14) y
    `Pacific/Pago_Pago` (UTC−11). `tsc --noEmit` → exit 0.
  - Límite de la prueba: `tsconfig.json` excluye `tests/`, así que `tsc` no revisa los tipos de los
    tests; Vitest los transpila sin chequear tipos.
- ~~Hallazgo: `loansRoutes.ts:48` valida «inicio ≥ hoy» en UTC.~~ **Retirado en T3:** misma razón,
  `index.ts:15` fija la zona horaria de Tucumán.
- **T3** (2026-10-21):
  - Test nuevo `tests/originWiring.test.ts` sobre la app real (`createApp()` → `wireRoutes`).
  - **Rojo:** `Tests 4 failed | 1 passed (5)`. `POST /api/auth/login` y `/register` sin `Origin` →
    `expected 400 to be 403`; `/logout` sin `Origin` → `expected 204 to be 403`; login desde
    `https://evil.example` → `expected 400 to be 403`. El caso permitido (con `Origin` válido → 400
    `Missing required fields` del propio handler) ya pasaba, como debe.
  - **Arreglo** en `routes.ts`: `app.use('/api', originChecker)` al principio de `wireRoutes`, antes de
    `authRoutes`. Se quitan los dos montajes que quedan redundantes (`/api/tools` y el segundo `/api`).
  - **Verde:** `originWiring.test.ts` `5 passed (5)`; suite del server `23 passed` archivos,
    `210 passed (210)`; `tsc --noEmit` exit 0.

- **T4** (2026-10-21):
  - Tests: `authService.test.ts` (los dos casos lanzan `Invalid credentials`; con email inexistente
    `bcrypt.compare` se llama 1 vez con un hash de costo 12) y `authRoutes.test.ts:112` reescrito
    **a propósito** (esperaba 404; ahora el email inexistente da el mismo status y el mismo body que la
    contraseña incorrecta: `401 {"error":{"code":"UNAUTHORIZED","message":"Invalid credentials"}}`).
  - **Rojo:** `Tests 4 failed | 13 passed (17)`. El rojo mostró la fuga por tiempo: el test de email
    inexistente tardó **1 ms**, contra **419 ms** del de contraseña incorrecta.
  - **Arreglo:** `authService.ts` crea al arrancar un hash bcrypt real (costo 12) de 32 bytes
    aleatorios y lo usa en el `compare` cuando el email no existe; un único error `INVALID_CREDENTIALS`
    (constante exportada). `authRoutes.ts` responde un único 401.
  - **Verde:** `Tests 17 passed (17)`; suite del server `211 passed (211)`; `tsc --noEmit` exit 0.
    Tiempos con `--reporter=verbose`: email inexistente **205 ms** y **208 ms**; contraseña incorrecta
    412 ms, que incluye el `register` previo (~205 ms) más el login (~205 ms). El login cuesta lo mismo
    en los dos casos.
  - Límite: la prueba de tiempo es una observación, no un test automático (medir tiempos en tests da
    resultados inestables). El test automático verifica la causa: que bcrypt corra con costo 12.

- **T5** (2026-10-21):
  - **Dos bugs más encontrados al hacerlo:**
    1. **Registro con email repetido → 500 en vez de 409.** PostgreSQL rechaza el duplicado lanzando
       un error `23505` (unique_violation), pero `userRepo.create` esperaba `rowCount === 0`, que nunca
       pasa. Confirmado en staging: segundo registro de `dup-check-1792559607@example.com` →
       `500 {"code":"INTERNAL_ERROR","message":"Registration failed"}`. Lo ocultaba el mock de
       `userRepo.test.ts`, que devolvía `rowCount: 0` con el comentario «Simulate PG unique violation».
       (El usuario de prueba queda en staging; se borra en T9 con el endpoint nuevo.)
    2. **El 404 de préstamo ajeno revelaba que el préstamo existe**: el mensaje era
       `No participás en este préstamo`, distinto del de un préstamo inexistente. El brief pide 404
       «para no revelar que existe». Ahora los dos casos dicen `Préstamo no encontrado`.
  - Nuevo `src/modules/errors/AppError.ts`: `ERROR_CODES` (`as const`), `AppError` y las subclases
    `ValidationError` 400, `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404,
    `ConflictError` 409; `sendError(res, err, fallback)` (esperado → su status y mensaje; otro → 500
    genérico + `console.error`, nunca `req.body`); `errorHandler` global registrado al final de
    `createApp` (JSON mal formado → 400, body > 10 kb → 413, resto → 500).
  - `throw new Error` → subclase en `toolRepo`, `toolService`, `searchRepo`, `searchService`,
    `loanService`, `authService`; `userRepo.create` traduce `23505` a `ConflictError`. Los 5 archivos de
    rutas usan `sendError` en sus `catch`. En `POST /tools/:id/loans` la búsqueda de la herramienta
    entra al `try` (antes, un fallo de la base ahí escapaba sin control).
  - Tests nuevos en `tests/errors.test.ts` (11). **Rojo de comportamiento:** `5 failed | 6 passed`
    — base caída → `400` en vez de 500; JSON mal formado y body > 10 kb → body vacío (respuesta HTML de
    Express); editar herramienta inexistente → 400 en vez de 404; email duplicado → error crudo de pg.
  - Tests que cambian **a propósito** (4): `userRepo.test.ts` (el mock ahora lanza `23505` como
    PostgreSQL), los mocks de repo de `authRoutes.test.ts` y `authValidation.test.ts` (lanzan
    `ConflictError`, como el repo real) y `loanService.test.ts > rejects transition for non-participant`
    (espera `Préstamo no encontrado`).
  - **Verde:** suite del server `24 passed` archivos, `222 passed (222)`; `tsc --noEmit` exit 0.
    Barrido: ningún `err.message` en las rutas. Quedan 3 `throw new Error` a propósito: `env.ts` ×2
    (el servidor no arranca sin sus variables) y `loanRepo.ts:39` (fallo inesperado → 500).
  - Fuera de alcance (anotado): logger estructurado con `requestId` y el campo `retryable` que pide
    `checklist-errores`. Hoy no hay quien los consuma; van en una feature de observabilidad.

- **T6** (2026-10-21):
  - Archivos nuevos: `migrations/004_add_users_deleted_at.sql` (`ALTER TABLE users ADD COLUMN IF NOT
    EXISTS deleted_at TIMESTAMPTZ NULL`, con el `down` documentado en un comentario);
    `db/transaction.ts` (`withTransaction`: `BEGIN` / `COMMIT` / `ROLLBACK` y `release` en `finally`);
    `me/accountDeletion.ts` (`deleteAccount`: bloquea la fila con `FOR UPDATE`, 409 si hay préstamos
    activos, borrado lógico de herramientas, anonimiza `users`; todo en una transacción).
  - `meAccountRoutes` recibe `(userRepo, pool)`: genera el hash de reemplazo **antes** de abrir la
    transacción (bcrypt tarda ~200 ms y la fila queda bloqueada mientras la transacción esté abierta),
    llama a `deleteAccount`, borra la cookie y responde 204. `ACTIVE_STATUSES` de `loanRepo` pasa a
    exportarse; se eliminan `anonymizeByBorrower` y `anonymizeByOwner`.
  - Tests nuevos en `tests/accountDeletion.test.ts` (11) con un PostgreSQL falso que solo aplica las
    escrituras en `COMMIT`. **Rojo:** primero el módulo inexistente; con `deleteAccount` escrito,
    `2 failed | 9 passed` — la ruta vieja respondía **500** en el borrado normal y con préstamos activos,
    lo mismo que pasa hoy en producción.
  - `meAccountRoutes.test.ts`: se quita el bloque `DELETE` (4 tests) **a propósito**, cubierto más a fondo
    en `accountDeletion.test.ts`. Su test de anonimización usaba un préstamo `pendiente`, que con D-b
    bloquea el borrado. Test nuevo en `migrations.test.ts` para la 004.
  - **Error mío, corregido antes de correr nada:** el primer borrador de la migración 004 incluía un
    `CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY)` que no correspondía (si la 004 corriera
    antes que la 001, dejaría una tabla `users` incompleta). El test nuevo de `migrations.test.ts`
    rechaza cualquier `CREATE TABLE` o `DROP TABLE` en la 004.
  - **Verde:** suite del server `25 passed` archivos, `230 passed (230)`; `tsc --noEmit` exit 0.
  - Límite (E3): estos tests usan un PostgreSQL falso. La prueba que vale es el borrado real en staging
    (T9).

- **T6b escrito, sin verificar todavía** (2026-10-21): `server/scripts/smoke.mjs`, sin dependencias
  (`fetch` de Node 20). Un cliente por usuario de prueba, con su cookie (como un navegador); 4 usuarios:
  owner, borrower, stranger y un anónimo. Respeta el límite de 5 pedidos por minuto de `/api/auth`
  esperando solo cuando hace falta (tarda 2-3 min). Casos nuevos: email repetido → 409; login sin
  `Origin` → 403; email inexistente = misma respuesta que contraseña mala; préstamo ajeno = misma
  respuesta que uno inexistente; borrado con préstamo activo → 409 (dueño y solicitante); borrado sin
  préstamos activos → 204 con cookie borrada, la herramienta desaparece, el préstamo sigue en el
  historial del solicitante, la cuenta no puede entrar y el email original se puede registrar de nuevo.
  Al final (`finally`) borra todas las cuentas que creó, aunque falle un chequeo.
  - Prueba hasta ahora: `node --check` → sintaxis OK; sin URL → mensaje de uso y exit 2.
  - **No se corrió contra ningún servidor:** staging todavía tiene el código viejo, donde el borrado de
    cuenta falla, así que dejaría usuarios de prueba imposibles de borrar. Se tilda en T9, con `SMOKE OK`.
  - El chequeo «after deletion the browser has no session left» prueba que la cookie se borró, no que el
    token quedó invalidado (riesgo residual D-d); el comentario del script lo aclara.

- **T7** (2026-10-21, sobre `b3988ec`):
  - Server: `Test Files 25 passed (25)`, `Tests 230 passed (230)`; `tsc --noEmit` exit 0.
  - Client: `Tests 4 failed | 144 passed (148)`, los mismos 4 de `requestLoan.test.tsx` de la línea
    base. `git diff main...HEAD -- client` vacío: esta rama no tocó el cliente. Misma causa que los del
    server en T2: fechas fijas (`'2026-10-15'`, `'2026-10-25'`) que ya pasaron. Fuera de alcance.
  - `oxlint` (client) exit 0: solo warnings que ya existían, 0 errores.
  - Build de producción como en Railway (`NODE_ENV=production npm run build`): exit 0; Vite
    `✓ built in 1.50s` y `tsc -b` del server sin errores; existen `server/dist/index.js`,
    `server/dist/modules/errors/AppError.js`, `server/dist/modules/me/accountDeletion.js` y
    `server/client-dist/index.html`.

- **T8 en curso** (2026-10-21):
  - Push: `git ls-remote --heads origin fix/security-hardening` → `9fd029d… refs/heads/fix/security-hardening`.
  - `railway service source connect --branch fix/security-hardening -e staging` → respondió
    `Deploys have been paused temporarily` (exit 1), pero el cambio se aplicó: la config de staging
    muestra `source.branch: "fix/security-hardening"`.
  - **Bloqueo externo:** Railway pausó los deploys de los planes Free/Hobby por alta demanda («Deployments
    paused - limited access», docs.railway.com/deployments/reference). Según su documentación, los
    deploys nuevos quedan en cola y se procesan solos cuando termina la pausa; lo que ya está corriendo no
    se ve afectado. No aparece todavía un deploy nuevo de staging: el último sigue siendo `a070eeb1`
    (`main`, `e2e8113`). Producción sigue igual, sana.

- **Intento de adelantar T9** (2026-10-21, 15:37 UTC):
  - `pg_dump` por `railway ssh -s Postgres -e staging` → `ssh: connect to host ssh.railway.com port 22:
    Connection timed out` (exit 255). Reintento: igual. No es la red local: `github.com:22` y
    `ssh.railway.com:443` responden; solo falla el SSH de Railway (probablemente parte del mismo incidente).
    El archivo de salida quedó vacío (0 bytes).
  - Plan B, backups nativos de Railway: `railway postgres pitr backup list` funciona (staging y producción:
    `No backups found`; producción: `No backup schedule configured`). Pero
    `backup create` → `Manual backups and backup schedules are only available for Pro workspaces`.
  - `pg_dump` y `psql` no están instalados en la PC; ninguna base tiene TCP proxy público.
  - **Hallazgo:** la base de producción **no tiene ningún backup**, ni manual ni programado. En el plan
    actual (no Pro) Railway no los ofrece.
  - Resultado: ni el backup ni la migración 004 se pudieron adelantar. No se cambió nada en staging.

- **Decisión (Hernán, 2026-10-21):** esperar a que Railway se normalice, sin TCP proxy.
- **Retomado** (2026-10-24):
  - La CLI de Railway había perdido la sesión (`Unauthorized`); Hernán volvió a loguearse.
  - SSH de Railway intermitente: un intento dio timeout, los dos siguientes `ssh-ok`.
  - El deploy de la rama **nunca se había creado** (ni en cola ni fallado): el cambio de rama del 21/10 se
    guardó durante la pausa, pero el deploy no quedó en la cola.
  - **Backup de staging (T9):** `pg_dump --format=plain` dentro del contenedor de Postgres por
    `railway ssh`, guardado en el scratchpad de la sesión (fuera del repo): 6269 bytes, exit 0. Contiene
    `COPY public.loans`, `public.tools` y `public.users`. Filas en el dump: loans 1, tools 1, users 3;
    `count(*)` en vivo: loans 1, tools 1, users 3 → **coinciden**. Revisión de saltos de línea por bytes:
    0 `\r`, 228 `\n` (el canal SSH no altera el archivo). Un primer conteo con `grep` en Git Bash dio
    228 `\r`: era un falso positivo de `grep`, descartado al leer los bytes con Node.
  - **Migración 004 en staging (T9):** aplicada desde el contenedor de la app con el SQL del worktree →
    `ok 004_add_users_deleted_at.sql`; columna
    `{"column_name":"deleted_at","data_type":"timestamp with time zone","is_nullable":"YES"}`;
    users `{"total":3,"con_fecha":0}`. Staging siguió sano con el código viejo (health 200, tools 200).
  - **Deploy de staging (cierra T8):** `railway service source connect --branch fix/security-hardening`
    otra vez → deploy `c809741b` del commit `9fd029d`: `BUILDING → DEPLOYING → SUCCESS`. Prueba de que
    corre el código nuevo: `POST /api/auth/login` sin `Origin` → `403 Invalid origin` (antes 400).

- **Smoke test en staging, primera corrida** (2026-10-24, run `mvlz5a76`): `SMOKE FAILED: 3 check(s)`,
  exit 1. **Todo lo de esta feature dio OK:** email repetido 409; login sin `Origin` 403; email
  inexistente = misma respuesta que contraseña mala (`Invalid credentials`); cookie `Secure` y
  `HttpOnly`; borrado con préstamo activo 409 (dueño y solicitante, con el mensaje en castellano);
  borrado 204 con cookie borrada; la herramienta desaparece (404); el préstamo sigue en el historial del
  solicitante; el email se puede registrar otra vez; limpieza: todas las cuentas creadas se borraron.
  - Los 3 fallos son **429** (`register a third user`, `foreign loan → 404` en cadena, y
    `the deleted account cannot log in`).
  - Un chequeo pasó **por la razón equivocada**: `foreign loan looks exactly like a missing one` comparó
    dos `401` (el tercer usuario no llegó a registrarse por el 429). El script tiene que exigir el 404.
  - **Causa: bug real del servidor.** `rateLimit.ts:9` usa **un solo `Map`** para los dos limitadores
    (`authRateLimiter`, 5/min, y `generalRateLimiter`, 30/min). Comparten el contador por IP: cada pedido a
    `/api/tools` o `/api/loans` descuenta del cupo de login. Un usuario que navega unas páginas y después
    quiere entrar dentro del mismo minuto recibe 429.
  - Descartado: `TRUST_PROXY` no está definida en Railway, pero `env.ts:17` la deja en `true` por defecto
    (probado: `{"TRUST_PROXY":true}` con zod 3.25.76), así que cada usuario se cuenta por su IP real.
  - **El usuario `dup-check-1792559607@example.com` sigue en staging** (pendiente).

- **T6c** (2026-10-24, aprobado por Hernán):
  - Test nuevo `tests/rateLimitIsolation.test.ts` (3), con los limitadores montados como en la app real.
    **Rojo:** `3 failed (3)`; tras 10 pedidos a `/api/tools`, los 5 logins dieron
    `[429, 429, 429, 429, 429]`.
  - Arreglo en `rateLimit.ts`: cada `createRateLimiter` crea su propio `Map`; `cleanup` y
    `resetRateLimiter` recorren la lista de todos.
  - **Verde:** `3 passed (3)`; suite del server `26 passed` archivos, `233 passed (233)`; `tsc --noEmit`
    exit 0. Se sigue bloqueando el 6.º login y el pedido general 31 del minuto.
  - `smoke.mjs`: el chequeo del préstamo ajeno ahora exige que los dos sean 404 reales, además de iguales;
    se suma `missing loan → 404`. `node --check` → OK.

- **T9 cerrado** (2026-10-24):
  - Commit `32a44b9` (T6c) → push → deploy de staging `cce73bae` → `SUCCESS` (staging sigue la rama).
  - **Smoke test, segunda corrida** (run `mvm0vnaf`): **40/40 OK, `SMOKE OK`, exit 0**. Cierra T6b. El
    chequeo del préstamo ajeno ahora comparó dos 404 reales (`foreign loan → 404`, `missing loan → 404`,
    iguales → `true`). Limpieza: las 4 cuentas de la corrida, borradas (204).
  - `dup-check-1792559607@example.com`: login 200 → `DELETE /api/me/account` 204.
  - **Prueba en PostgreSQL real de la anonimización:** `users` de staging tiene 8 filas con
    `name = "Usuario eliminado"`, `email = deleted-<id>@invalid` y `deleted_at` con fecha (3 de la primera
    corrida, 4 de la segunda y `dup-check`). Quedan 2 cuentas activas del smoke test del 21/10
    (`owner-mvhjsn38`, `borrower-mvhjsn38`), de antes de esta feature.

## Next

T10: producción **antes del merge** — backup con `pg_dump` validado y migración 004. Espera la
indicación de Hernán.
