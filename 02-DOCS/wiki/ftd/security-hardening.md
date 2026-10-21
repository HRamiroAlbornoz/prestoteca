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
3. **Los errores internos llegan al cliente.** Los `catch` de `toolsRoutes.ts` y `loansRoutes.ts`
   devuelven `err.message` con 400 para *cualquier* error. Un error de PostgreSQL sale tal cual
   (`relation "tools" does not exist`). El brief pide mensajes genéricos y el detalle en los logs.
4. **Borrar una cuenta con herramientas o préstamos falla y deja datos a medias.**
   `DELETE /api/me/account` (`meAccountRoutes.ts:67-92`):
   - pone `NULL` en `loans.borrower_id` y `loans.owner_id`, que son `NOT NULL`;
   - borra la fila de `users`, que `tools.owner_id` referencia con una FK;
   - no usa una transacción: si falla a mitad de camino, las herramientas ya quedaron borradas y
     la cuenta sigue existiendo.

   Verificado en el esquema de producción (2026-10-21): `loans.borrower_id`, `loans.owner_id` y
   `tools.owner_id` son `nullable=NO`, con FK a `users(id)`.

## Scope

**Entra:**
- (1) Mover el `originChecker` para que también cubra `/api/auth`.
- (2) Login con una única respuesta `401 Invalid credentials` para los dos casos, y bcrypt contra un
  hash ficticio cuando el usuario no existe, para que el tiempo de respuesta sea parecido.
- (3) Una clase `AppError` (con `status` y `code`) para los errores esperados, y un helper único que
  responde con esos datos o, si el error no es esperado, con un `500` genérico y el detalle en el log.
  Los mensajes de los errores esperados no cambian.
- (4) **Borrado de cuenta = anonimizar la fila de `users`, no borrarla.** Es lo que ya dice D4
  («los datos del usuario existen en la BD (anonymizados), no eliminados físicamente»). En una sola
  transacción: herramientas con borrado lógico; en `users`, nombre «Usuario eliminado», email
  reemplazado por `deleted-<id>@invalid` (libera el email original), `password_hash` inutilizable y
  `deleted_at` con la fecha. Sin tocar las FK, así el historial de préstamos queda íntegro.
  Requiere la migración `004_add_users_deleted_at.sql` (solo agrega una columna nullable).
- Tests primero (rojo → verde) para cada uno de los 4 puntos.
- Aplicar la migración 004 en staging y en producción, con backup de producción antes.

**No entra:**
- Invalidar en el acto el JWT de una cuenta borrada. El token expira en 1 h como máximo y el email
  ya no sirve para entrar. Riesgo residual aceptado; si hace falta, va en una feature aparte.
- Un runner de migraciones automático (la 004 se aplica a mano, como en staging).
- Los 7 tests que ya fallaban, las vulnerabilidades de dependencias y las categorías de la base.

## Checklist

- [ ] T1 — Rama `fix/security-hardening` desde `main`. Prueba: `git branch --show-current`.
- [ ] T2 — (1) `Origin` en `/api/auth`. Prueba: test nuevo en rojo y después en verde
  (`POST /api/auth/login` sin `Origin` → 403).
- [ ] T3 — (2) Login sin enumeración. Prueba: tests en rojo → verde (email inexistente y contraseña
  mala → mismo `401` y el mismo cuerpo; bcrypt se ejecuta también con un email inexistente).
- [ ] T4 — (3) `AppError` + helper. Prueba: test en rojo → verde (un error inesperado del repo →
  `500` con mensaje genérico, sin el texto original); los tests existentes de tools y loans siguen verdes.
- [ ] T5 — (4) Migración 004 + borrado de cuenta con anonimización en una transacción. Prueba: tests
  en rojo → verde (cuenta con herramientas y préstamos → 204, fila anonimizada, préstamos intactos;
  si falla un paso, rollback y nada cambia; el email original se puede volver a registrar).
- [ ] T6 — Suite completa sin regresiones, más lint y type-check. Prueba: server ≥ 202 verdes y los
  mismos 3 rojos de antes; client sin cambios; `tsc -b` y `oxlint` sin errores.
- [ ] T7 — Staging: migración 004 aplicada y smoke test con los casos nuevos. Prueba: salida del
  smoke test.
- [ ] T8 — PR mergeado a `main`. Prueba: commit en `origin/main`.
- [ ] T9 — Producción: backup, migración 004 y smoke test. Prueba: archivo de backup + `ok 004` +
  salida del smoke test.

## Evidence

_(vacío: ninguna tarea completada todavía)_

## Next

Hernán decide dónde se trabaja (T1) y aprueba el enfoque del punto 4 (anonimizar la fila en lugar de
borrarla).
