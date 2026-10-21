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
- Mensajes en inglés que ve el usuario (`Invalid credentials`, `Login failed`): la app está en
  castellano, pero traducir los mensajes es otra feature.

## Checklist

- [ ] T1 — Worktree `.worktrees/fix-security-hardening` con la rama `fix/security-hardening` desde
  `main` (OpenCode sigue abierto en la carpeta principal) y `npm install` en el worktree.
  Prueba: `git worktree list` y que `npm install` termine sin error.
- [ ] T2 — Arreglar los 3 tests de fechas de `loansRoutes.test.ts`. Prueba: server 205/205 verdes
  antes de tocar código de la app.
- [ ] T3 — (1) Origin en `/api/auth`. Prueba: test sobre el `wireRoutes` real en rojo → verde
  (`POST /api/auth/login` sin `Origin` → 403; con `Origin` → llega al handler).
- [ ] T4 — (2) Login. Prueba: tests en rojo → verde (email inexistente y contraseña mala → mismo 401 y
  mismo cuerpo; con email inexistente, `bcrypt.compare` se llama igual).
- [ ] T5 — (3) Errores. Prueba: tests en rojo → verde (un error inesperado del repo → 500 genérico sin
  el texto original; JSON mal formado → 400 genérico; los errores esperados conservan status y mensaje).
- [ ] T6 — (4) Migración 004 + borrado de cuenta. Prueba: tests en rojo → verde (con préstamos
  activos → 409 y nada cambia; sin préstamos activos → 204, `Set-Cookie` que borra `token`, fila
  anonimizada, herramientas borradas, préstamos intactos; si falla un paso → `ROLLBACK`; el email
  original se puede registrar otra vez).
- [ ] T7 — Suite completa, lint y type-check. Prueba: server todo verde; client 144/148 (los mismos
  4 rojos de antes); `tsc -b` y `oxlint` sin errores.
- [ ] T8 — Push de la rama y staging apuntando a `fix/security-hardening`. Prueba: deploy de staging
  en `SUCCESS` con el commit de la rama.
- [ ] T9 — Staging: backup de prueba validado, migración 004, smoke test ampliado y los dos borrados
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

_(vacío: ninguna tarea completada todavía)_

## Next

Hernán crea el worktree y corre `npm install` (T1). No se escribe código hasta que Hernán lo indique.
