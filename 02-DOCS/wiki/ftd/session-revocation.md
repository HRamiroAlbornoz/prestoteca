---
author: HRamiroAlbornoz
branch: main
status: in-progress
---
# Sesiones que dejan de valer al borrar la cuenta o cambiar la contraseña

## Intent

Ítem 5c del backlog, encontrado por los revisores de seguridad de `server-input-bugs` (tareas B y D). Hoy el control
de sesión (`server/src/modules/middleware/auth.ts`) solo mira que el token esté bien firmado y no esté vencido. Nunca
pregunta a la base si esa sesión sigue siendo válida. Por eso un token sigue sirviendo **hasta 1 hora**:

1. **Después de borrar la cuenta**, en las rutas de herramientas, préstamos y búsqueda, actuando como el usuario
   anonimizado. Solo `GET /api/me` y `PATCH /me/password` lo revisan.
2. **Después de cambiar la contraseña**, en todos los dispositivos. Esto pasa de verdad desde la tarea D de
   `server-input-bugs`, que hizo que el cambio de contraseña funcione.

**Decisión de Hernán (2026-11-14): opción A**, consultar la base en cada pedido protegido. La opción B (token de
acceso de 15 min + token de renovación de 7 días, lo que pide su checklist de auth) queda como ítem **5g** del
backlog, aparte. La opción C (solo acortar el token) se descartó.

## Scope

**Entra:**
- **Huella de la contraseña en el token.** El token pasa de `{ id }` a `{ id, pwf }`. `pwf` son los primeros 16
  caracteres hexadecimales del SHA-256 del `password_hash` guardado. No revela la contraseña ni el hash: es un resumen
  de un hash de bcrypt, que ya tiene sal. Se crea en un módulo nuevo y chico,
  `server/src/modules/auth/sessionToken.ts`, junto con la cookie de sesión, que hoy está copiada en dos lugares de
  `authRoutes.ts`.
- **El control de sesión consulta la base.** Después de verificar la firma, busca al usuario con `findActiveById`
  (que ya filtra las cuentas borradas) y compara la huella. Responde 401 `SESSION_REQUIRED` si: el token no trae
  `pwf` (los emitidos antes de este cambio), la cuenta no existe o está borrada, o la huella no coincide (la
  contraseña cambió). Si la base falla, responde 500 `INTERNAL_ERROR`: nunca deja pasar el pedido. El control pasa a
  recibir el repositorio de usuarios y el secreto del JWT como parámetros, en vez de leer el secreto del entorno al
  cargar el módulo.
- **Cambiar la contraseña no te saca de tu propio dispositivo.** Si el cambio sale bien (204), la ruta entrega un token
  nuevo, con la huella nueva, en la misma cookie. Los otros dispositivos quedan afuera.
- **Medición.** La latencia de una ruta protegida en staging, antes y después (ver Checklist).
- Tests de cada caso, con el ID en el nombre.

**No entra:**
- El token corto con renovación (ítem 5g).
- Verificar el `issuer` del JWT: hoy se firma con `issuer` pero no se comprueba. Se anota como hallazgo si un revisor lo
  marca.
- Cambios en la app (cliente): un 401 `SESSION_REQUIRED` ya lleva al login (error-codes).

**Efecto que hay que saber:** al publicar esto, **todas las sesiones abiertas se cierran una vez**, porque los tokens
de antes no traen `pwf`. Quien esté usando la app tiene que volver a entrar. Los tokens duran 1 hora, así que el
efecto es el mismo que esperar a que venzan.

**Quién:** el código lo escribe Qwen (OpenCode vía Orca), lanzado después de preguntarle a Hernán. Claude corre los
checks, revisa el diff, prueba mutantes y aplica la revisión que pida `rsc risk` (tier 2 esperado: toca auth).

## Checklist

- [ ] **R1 — La huella.** Tests en `server/tests/sessionToken.test.ts` (nuevo):
  - R1a: `passwordFingerprint` da siempre lo mismo para el mismo hash, son 16 caracteres hexadecimales, cambia si
    cambia el hash y no contiene el hash.
  - R1b: `setSessionCookie` pone la cookie `token` con `httpOnly`, `SameSite=Lax` y 1 hora.
- [ ] **R2 — Los tokens llevan la huella.** Tests en `authService.test.ts`: el token del registro y el del login traen
  `pwf` igual a la huella del hash guardado.
- [ ] **R3 — El control de sesión.** Tests en `middleware.test.ts`, con un repositorio falso:
  - R3a: token válido, cuenta activa, huella igual → pasa y `req.userId` queda puesto.
  - R3b: token válido de una cuenta borrada (`findActiveById` da `null`) → 401 `SESSION_REQUIRED`.
  - R3c: token válido con otra huella (contraseña cambiada) → 401 `SESSION_REQUIRED`.
  - R3d: token válido sin `pwf` (emitido antes del cambio) → 401 `SESSION_REQUIRED`.
  - R3e: la base falla → 500 `INTERNAL_ERROR` y el pedido no pasa.
  - Los dos tests de hoy (sin token, token inválido) siguen dando 401.
- [ ] **R4 — Cambiar la contraseña entrega un token nuevo.** Tests en `meAccountRoutes.test.ts`:
  - R4a: con 204 llega `Set-Cookie` con un token cuyo `pwf` es la huella del hash nuevo.
  - R4b: si el cambio falla (400, 401 o 404), no llega ninguna cookie nueva.
- [ ] **R5 — Los tests que arman la app real.** En `errors.test.ts`, los dos tests que mandan un token para
  `user-1` pasan a simular ese usuario (un `findActiveById` falso con un hash cuya huella coincide). Siguen
  comprobando lo mismo de antes: el 404 JSON de una ruta `/api` que no existe y el `OPTIONS` de `/api/health`.
- [ ] **Controles:** en `server/`, `npx vitest run` y `npx tsc -b` en verde; `rsc risk` y la revisión que pida.
- [ ] **Medición:** en staging, el promedio de 20 pedidos a una ruta protegida (`GET /api/loans?type=pedidos`), antes
  del deploy y después.
- [ ] **Staging:** dos sesiones de la misma cuenta (A y B). Cambiar la contraseña desde A → 204 y cookie nueva; B → 401;
  A con la cookie nueva → 200. Borrar la cuenta desde A → 204; la cookie de A reusada en una ruta de préstamos → 401.

## Evidence

**Base (2026-11-14, `05d8d2c`):** servidor 30 archivos, 610/610; `npx tsc -b` exit 0.

**Medición «antes» (2026-11-14, staging `79839f89`, sin la consulta en el control de sesión):** cuenta de prueba
`qa-5c-…-measure@example.com`, 3 pedidos de calentamiento y después 20 a `GET /api/loans?type=pedidos` desde la máquina
de Hernán → 20 × 200, **mediana 303 ms**, promedio 299 ms, mínimo 281 ms, máximo 319 ms. La mayor parte es el viaje de
red hasta US East; lo que cuenta es la diferencia con la medición «después», hecha igual.

**Revisión del pedido (2026-11-14, agente de contexto fresco, a pedido de Hernán):** SEND AFTER FIXES. 4 para
corregir, todos aplicados: (1) la fila «contraseña actual incorrecta» de R4b no se podía escribir con el hash
`hashed_old`, porque el `bcrypt` falso de ese archivo acepta cualquier contraseña con ese hash → ahora usa
`hashed_other`; (2) el mutante M3 sobrevivía, porque la comparación de huellas igual rechaza un token sin `pwf` → R3d
ahora exige que no se consulte la base; (3) R4b pasa también antes del arreglo (hoy la ruta nunca pone cookie) → se
aclaró que es una fila de guarda, probada por M6; (4) M6 solo la prueba si la fila 404 usa la carrera de B3 y no el
caso D7 → se aclaró. Detalles aplicados: `tsc -b` no revisa los tests; actualizar el comentario de `errors.test.ts`
sobre `JWT_SECRET`; firmar el token en un solo lugar (`signSessionToken`, en `sessionToken.ts`); el token de R3a va
por `Authorization`; R3e calla `console.error` y fija el cuerpo completo. Verificado sin cambios: imports, tipos,
`sendError`, el middleware `async` en Express 5, el `Set-Cookie` que escribe Express y que el borrado de cuenta sigue
limpiando la cookie. **Costo conocido:** `GET /api/me` y `PATCH /me/password` pasan a hacer dos búsquedas del usuario
(la del control y la de la ruta), dentro del diseño elegido; la medición «después» lo va a mostrar.

### R — ronda 1 (2026-11-14)

- **Hecho por:** Qwen, en el worktree `r-session-check` (base `3d29ab0`), en una sola entrega con `worker_done`. El
  código de `src/` es exactamente el del pedido (`sessionToken.ts` nuevo, el control de sesión como fábrica, la
  cookie en un solo lugar, el token nuevo al cambiar la contraseña), sin desvíos.
- **Controles en el worktree:** servidor 31 archivos, **626/626**; `npx tsc -b` exit 0.
- **Rojo (Claude):** con el `src/` de `3d29ab0` (y `sessionToken.ts` presente para que los imports resuelvan) fallan
  las filas R2a, R3a-R3e y R4a, y los tests viejos adaptados del control de sesión; R4b pasa antes y después, como
  se esperaba (fila de guarda).
- **Mutantes (Claude), deshechos desde una copia, `cmp` final OK, los 7 detectados:** sin comparar la huella → R3c;
  sin la búsqueda → R3a, R3b, R3c, R3e; aceptar un token sin `pwf` → R3d (por la búsqueda que no debía ocurrir); `next()`
  si la base falla → R3e; sin la cookie nueva → R4a; la cookie antes de mirar `changed` → la fila de la carrera de R4b;
  firmar sin `pwf` → R2a, R4a y dos tests viejos.
- **Lo que faltó (va a la ronda 2):** **R2b no estaba**: en su lugar, a un test viejo del login se le agregó
  `pwf.toBeDefined()`. Prueba de que importa: cambiar el login a `generateToken(user.id, input.password)` (la huella de
  la contraseña escrita, no del hash guardado) deja **todo en verde** (59/59 en `authService` y `authRoutes`), y en
  producción haría que **nadie pueda iniciar sesión**. Además, Qwen renombró un test viejo y le cambió el correo a otro
  (`ana2` → `ana3`), cosas prohibidas aunque inofensivas. El `(user as any)` de la fila de la carrera copia el del test
  B3 → aceptado.
- **Ronda 2 enviada** (autorizada por Hernán de antemano): dispatch `ctx_81e78b62cf74`, task `task_1cbdf099bd57`, pedido
  `R-round2.md` en el scratchpad: agregar R2b, deshacer los cambios de más en `authService.test.ts`, probar el mutante
  del login. Solo tests.

### R — ronda 2 (2026-11-14)

- **Hecho por:** Qwen, mismo worktree. Agregó R2b tal como se pidió y volvió los tests viejos a como estaban (solo
  quedan los `'hash-1'` permitidos, la línea más estricta de `pwf` en `JWT payload contains user id` y el
  `usersByEmail` del helper, que R2a y R2b necesitan). **Terminó sin mandar `worker_done`** (Orca lo avisó como
  escalación); el trabajo estaba completo.
- **Desvío:** deshizo su mutante con `sed` en vez de copiar desde una copia, y eso le cambió los finales de línea a
  `authService.ts`. Claude lo comprobó (mismo contenido con `diff --strip-trailing-cr`) y lo restauró desde su copia,
  byte a byte.
- **Controles (Claude):** servidor 31 archivos, **627/627**; `npx tsc -b` exit 0. El mutante del login
  (`generateToken(user.id, input.password)`) ahora lo atrapa R2b.
- **Riesgo:** `rsc risk` → **tier 2** (clase `auth`: `auth.ts`, `sessionToken.ts`, `authRoutes.ts`, `authService.ts`):
  panel de 3 y aprobación de Hernán. Panel en curso.

## Next

Pedido para Qwen armado y corregido tras la revisión (`R-brief.md` en el scratchpad de la sesión: R1a-R4b, 7 mutantes, cambios permitidos en tests
viejos listados uno por uno). **Lanzado a Qwen el 2026-11-14** (run `run_4c56396f07c4`,
dispatch `ctx_d7ab4763af76`, task `task_3942c5baf330`, worktree
`C:/Users/hralb/orca/workspaces/prestoteca/r-session-check`, base `3d29ab0`, con `server/` igual a `05d8d2c`). Cuando
entregue: copiar los 6 archivos de `src/` antes de tocar nada, comparar `it(` y `expect` contra `3d29ab0` (solo los 4
cambios permitidos), rojo, M1-M7 deshechos desde la copia, suite y `tsc -b`, `rsc risk` y el panel. **Hernán autorizó (2026-11-14)** que, si la entrega tiene algo para corregir,
Claude se lo mande a Qwen como segunda ronda sin preguntar antes (como en A1).
