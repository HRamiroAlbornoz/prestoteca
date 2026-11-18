---
type: plan
title: Plan — Sesiones de 7 días que el logout anula de verdad
description: El plan a nivel de estructura para server-sessions — tabla de sesiones, identificador opaco, middleware, rutas, cliente, pruebas y orden de construcción.
tags: [sdd, plan, auth, session]
timestamp: 2026-11-18T23:00:00Z
topic: sdd
slug: server-sessions
status: draft
branch: docs/server-sessions-plan
---

# Plan — Sesiones de 7 días que el logout anula de verdad

> Spec: [../specs/server-sessions.md](../specs/server-sessions.md) · Constitution: [../constitution.md](../constitution.md)
> v1.3.0 · Decisiones: D10, D12, D13 y D14 en [../decisions.md](../decisions.md) · Status: draft
> Last updated: 2026-11-18

## 0. Global Constraints

Valores exactos que toda tarea respeta. El revisor de cada tarea los lee primero; violarlos es un hallazgo.

- **Cookie:** nombre `token` (el mismo de hoy). Atributos siempre `httpOnly: true`, `sameSite: 'lax'`,
  `secure: process.env.NODE_ENV === 'production'`, `path: '/'`. **Con "Recordarme":** `maxAge` = 7 días
  (604 800 000 ms), reenviada en cada pedido protegido que pasa. **Sin "Recordarme":** sin `maxAge` ni `expires`
  (cookie de sesión del navegador). Para borrarla se usa la **misma** función con los mismos atributos (Express 5
  `clearCookie` solo ignora `maxAge`/`expires`; `secure` y `sameSite` tienen que coincidir).
- **Valor de la cookie:** 32 bytes al azar de `crypto.randomBytes`, en base64url (43 caracteres). Nunca contiene id,
  email ni nada de la cuenta. **El servidor guarda solo su SHA-256 en hex (64 caracteres)**, nunca el valor.
- **Plazos sin uso:** con "Recordarme" 7 días (`604 800 000` ms); sin él 12 horas (`43 200 000` ms). Una sesión
  vence cuando `ahora - último_uso >= plazo` (exactamente 7 días o 12 h ya es vencida, spec *Behaviour → Bordes*).
- **Reloj:** toda comparación y todo "último uso" usa el reloj de la app, inyectable (`now: () => Date`), nunca el
  `now()` de Postgres. Las pruebas controlan el tiempo con ese reloj.
- **Anular = borrar la fila.** No hay columna "anulada". Logout, cerrar las otras, cambio de contraseña y cuenta
  borrada **borran** filas de `sessions`.
- **La sesión no guarda** IP, navegador, ubicación ni ningún dato del dispositivo (spec *Non-goals*).
- **Forma de error (sin cambios):** `{ "error": { "code": "<CÓDIGO>", "message": "<texto en inglés>" } }`, con
  `code` del catálogo `server/src/modules/errors/errorCodes.ts`. Toda sesión inválida → `SESSION_REQUIRED` (401),
  sin decir si venció, se anuló o no existe. "Recordarme" con un valor que no es booleano → `BAD_REQUEST` (400).
- **Textos al usuario, exactos** (español, voseo):
  - Casilla: `Recordarme`. Descripción accesible: `No la marques en una compu compartida.`
  - Botón: `Cerrar sesión en los otros dispositivos`.
  - Diálogo, pregunta (nombre accesible): `¿Cerrar la sesión en tus otros dispositivos?`. Texto:
    `Vas a seguir con la sesión abierta acá.`. Botones: `Cerrar sesiones` y `Cancelar`.
  - Éxito: `Cerramos la sesión en tus otros dispositivos.`
  - Fila 39 (código del cliente `OTHER_SESSIONS_CLOSE_FAILED`): `No pudimos cerrar la sesión en tus otros
    dispositivos. Revisá tu conexión e intentá de nuevo en un momento.`
  - `429` → fila 35, `401` → fila 8 + login, igual que el resto de la app (`useApiError`).
- **Ningún texto del servidor llega a la pantalla** (guard `client/src/errors/noServerText.test.ts`).
- **Calidad (constitución §2):** cliente `npm run lint` con 0 avisos; `tsc -b` sin errores en server y cliente;
  TDD rojo → verde; cobertura ≥ 80 % de líneas por archivo cambiado (`@vitest/coverage-v8`).
- **Ramas (constitución principio 10):** todo en rama + PR, `main` protegida. Autoría de Hernán, sin
  `Co-Authored-By` ni pie "generated with".
- **Tier:** todo el cambio es **tier 2** (`rsc risk`: sesión, cookies, migración). Cada PR necesita la spec con
  `branch:` apuntando a su rama, panel de 3 lentes registrado y aprobación de Hernán antes del push.
- **Migración:** `server/src/migrations/005_create_sessions.sql`, aditiva, con el `down` en un comentario. Se aplica
  a mano en staging y en producción **antes** del deploy del código que la usa.

## 1. Context & constraints

- **Qué fija el diseño:** sesión larga y anulable (spec *Goals*); anular = la misma cookie da 401 (AC-4, AC-36);
  dos modos (AC-1 a AC-3, AC-20 a AC-24); cerrar las otras conserva la actual (AC-6); privacidad al borrar la cuenta
  (AC-33); identificador imposible de adivinar o de usar desde una copia de la base (AC-35).
- **Lo que ya existe y se reemplaza:** JWT de 1 h con huella de la contraseña (`pwf`) firmado en
  `server/src/modules/auth/sessionToken.ts`; el middleware `server/src/modules/middleware/auth.ts` ya consulta la base
  en cada pedido (5c), así que el costo de una consulta por pedido ya se paga hoy.
- **Constitución:** principio 8 v1.2.0 (identificador opaco, revocable, 7 días / 12 h); principio 13 (consultas
  parametrizadas, `SameSite=Lax` + chequeo de `Origin` en pedidos que cambian estado, límite 5/min en `/api/auth`);
  principio 14 (WCAG 2.2 AA, errores anunciados).
- **No-funcional:** la latencia de un pedido protegido no sube de forma medible (5c: mediana 292 ms en staging).
- **Fuera de alcance que el diseño NO toca:** lista de dispositivos, tope absoluto, duraciones elegibles, emails,
  pantalla de registro, límites de pedidos, encabezado `Authorization` para apps (spec *Non-goals*).

## 2. Architecture

```text
 navegador ──cookie token──▶ originChecker ─▶ rate limiters ─▶ authMiddleware ──▶ rutas protegidas
    ▲                                              │                │
    │ Set-Cookie (login, registro,                 │                ▼
    │ renovación, borrado)                         │        SessionRepository ──▶ Postgres: sessions ─┐
    │                                              ▼                ▲                                 │ FK
 client: LoginPage (Recordarme)            authRoutes (login,       │                                 ▼
         ProfilePage → OtherSessions       register, logout) ───────┤                          Postgres: users
         (diálogo de confirmación)         meAccountRoutes ─────────┤
         AuthContext (sin cambios)         (contraseña, borrar      │
                                            cuenta, other-sessions) │
                                           sessionPurge (cada 1 h) ─┘
```

- **`sessionToken`** (internal, server) — genera el valor al azar, calcula su hash y pone/borra la cookie con los
  atributos de §0. Único lugar con los atributos de la cookie.
- **`SessionRepository`** (internal, server) — toda la SQL de `sessions`: crear, validar-y-renovar en un solo paso,
  borrar una, borrar las otras, borrar todas de una cuenta, purgar vencidas.
- **`authMiddleware`** (internal, server) — lee la cookie, valida y renueva la sesión, reenvía la cookie si es
  "Recordarme", o responde 401 y borra la cookie. Nunca deja pasar un pedido si la base falla.
- **`authRoutes`** (internal, server) — login y registro abren sesión (y anulan la que traía el navegador); logout la
  borra.
- **`meAccountRoutes`** (internal, server) — cambio de contraseña borra las otras sesiones; borrar la cuenta borra
  todas; ruta nueva para cerrar las otras.
- **`sessionPurge`** (internal, server) — cada hora borra las sesiones vencidas (retención, spec *Points to clarify*).
- **Cliente** (internal) — casilla en `LoginPage`; sección nueva con diálogo en el perfil; fila 39 en el mapa de
  mensajes. `AuthContext` y `RequireAuth` no cambian (ya tratan el 401 al cargar como "sin sesión", AC-29/AC-31).
- **Postgres** (external) — tabla nueva `sessions`.

**Decisión principal: validar y renovar en una sola sentencia que actualiza la fila.** El middleware ejecuta un
único `UPDATE sessions SET last_used_at = <ahora> … WHERE token_hash = <hash> AND <no vencida> AND <cuenta activa>
RETURNING user_id, remember`. Una fila devuelta = sesión válida y ya renovada; ninguna = 401. Por qué:

- Un solo viaje a la base por pedido, igual que hoy con `findActiveById` (latencia, §1).
- **No puede revivir una sesión anulada** (AC-36): anular es borrar la fila, y un `UPDATE` sobre una fila borrada no
  afecta nada. Un "leer y después escribir" en dos pasos sí podría escribir sobre una fila que se borró en el medio
  si la escritura fuera un `INSERT … ON CONFLICT`; con `UPDATE` atómico ese hueco no existe.
- Dos pedidos simultáneos con la misma sesión (AC-15) se serializan por el bloqueo de fila del `UPDATE`; los dos
  devuelven la fila y ninguno saca al otro.

Alternativa descartada: guardar `expires_at` y extenderlo. Funciona igual, pero el plazo depende del modo y
cambiarlo (por ejemplo, 12 h → 24 h) obligaría a reescribir filas; con `last_used_at` + `remember` el plazo vive en
código, en un solo lugar (§0).

## 3. Interfaces & contracts

### 3.1 `sessionToken` (reemplaza el contenido actual del archivo)

```text
newSessionToken() -> string                      // 32 bytes al azar, base64url, 43 caracteres
hashSessionToken(token: string) -> string        // SHA-256 en hex, 64 caracteres; misma entrada → misma salida
setSessionCookie(res, token, remember: boolean)  // atributos de §0; maxAge 7 días solo si remember
clearSessionCookie(res)                          // mismos atributos, sin maxAge
IDLE_MS = { remember: 604_800_000, short: 43_200_000 }
isExpired(lastUsedAt: Date, remember: boolean, now: Date) -> boolean   // now - lastUsedAt >= plazo
```

- Se eliminan `passwordFingerprint` y `signSessionToken` (y con ellos `jsonwebtoken`).

### 3.2 `SessionRepository`

```text
create(userId, tokenHash, remember, now, db?) -> void
touchActive(tokenHash, now) -> { userId, remember } | null
  - una sola sentencia: actualiza last_used_at = now SOLO si la fila existe, no está vencida según su modo y la
    cuenta tiene deleted_at IS NULL; devuelve user_id y remember
  - nunca crea filas
deleteByTokenHash(tokenHash, db?) -> void                    // idempotente: 0 filas no es error
deleteOthers(userId, keepTokenHash, db?) -> number           // borra todas las de la cuenta menos keepTokenHash
deleteAllForUser(userId, db) -> number                       // dentro de la transacción de borrado de cuenta
purgeExpired(now) -> number                                  // borra todas las vencidas según su modo
```

- `db?` = un cliente de transacción de `withTransaction` (`server/src/modules/db/transaction.ts`); sin él usa el pool.
- Toda SQL parametrizada. Todos los errores de la base suben como excepción (no se tragan).

### 3.3 `authMiddleware` (reemplaza `createAuthMiddleware(userRepo, jwtSecret)`)

```text
createAuthMiddleware(sessionRepo, now = () => new Date())
  sin cookie                         -> 401 SESSION_REQUIRED
  touchActive -> null                -> 401 SESSION_REQUIRED + clearSessionCookie (AC-29)
  touchActive lanza                  -> sendError(...) → 500 INTERNAL_ERROR, nunca next() (AC-17)
  touchActive -> { userId, remember }-> req.userId = userId, req.sessionTokenHash = hash;
                                        si remember → setSessionCookie(res, token, true) (AC-21); next()
```

- Solo cookie: deja de leer `Authorization: Bearer` (spec *Non-goals*: sin apps nativas). Los tests de rutas que hoy
  simulan auth con un middleware propio por `Bearer` (`server/tests/loansRoutes.test.ts:85`) no dependen del real y
  no cambian.

### 3.4 Rutas

```text
POST /api/auth/login    body { email, password, remember? }
  remember ausente → false (AC-26); boolean → ese valor; otro tipo → 400 BAD_REQUEST, sin sesión (AC-25)
  credenciales OK → en UNA transacción: create(nueva) + deleteByTokenHash(hash de la cookie entrante, si había);
                    setSessionCookie(nuevo, remember); 200 { message } (igual que hoy)
  rechazado (400/401/429) → no toca la sesión entrante (AC-28)
POST /api/auth/register body { name, email, password, neighborhood }   // sin remember, pantalla sin cambios
  creado → misma transacción que login con remember = false (AC-24, AC-34); 201 igual que hoy
  rechazado → no toca la sesión entrante
POST /api/auth/logout
  sin cookie o sesión desconocida → clearSessionCookie; 204 (AC-12)
  con cookie → deleteByTokenHash; OK → clearSessionCookie; 204 (AC-4)
              falla de la base → 500 INTERNAL_ERROR, la cookie NO se borra (AC-30)
PATCH /api/me/password  (protegida)
  en UNA transacción: updatePassword + deleteOthers(userId, req.sessionTokenHash) (AC-8)
  ya no emite cookie nueva: la sesión actual conserva valor y modo (AC-27); 204 igual que hoy
DELETE /api/me/account  (protegida)
  deleteAccount agrega deleteAllForUser dentro de su transacción (AC-9, AC-33); clearSessionCookie; 204
DELETE /api/me/other-sessions  (nueva, protegida, límite general, chequeo de Origin por ser DELETE)
  deleteOthers(userId, req.sessionTokenHash) → 204 (también si borró 0, AC-19)
  sin sesión → 401 (AC-16); Origin no permitido → 403 ORIGIN_NOT_ALLOWED antes de tocar nada (AC-13)
```

### 3.5 Cliente

```text
LoginPage: <input type="checkbox" id="remember"> con <label> "Recordarme" y aria-describedby → texto de ayuda;
           desmarcada al montar; el submit manda { email, password, remember: boolean }
OtherSessionsSection (nuevo componente, dentro de la pestaña "Configuración" de ProfilePage):
  botón → abre ConfirmDialog
  ConfirmDialog (nuevo componente reutilizable): role="dialog", aria-modal="true", aria-labelledby → pregunta,
    aria-describedby → texto; al abrir, foco en "Cancelar"; Tab/Shift+Tab ciclan dentro; Escape = Cancelar;
    al cerrar, foco vuelve al botón que lo abrió
  confirmar → DELETE /api/me/other-sessions (un solo pedido; botón deshabilitado mientras espera)
    204 → cierra, mensaje de éxito en role="status"
    401 → flujo de sesión terminada (fila 8 + login) vía useApiError
    429 → fila 35 en role="alert"; red caída / 5xx / respuesta rara → fila 39 en role="alert"
messages.ts: OTHER_SESSIONS_CLOSE_FAILED (fila 39), código del cliente como LOGOUT_FAILED (fila 10)
```

- El diálogo es propio y no el `<dialog>` nativo: jsdom 30.1.3 (el entorno de pruebas del cliente) no implementa
  `showModal`, así que el nativo no se podría probar (D13).

## 4. Data model & flow

**Entidades**

- **`sessions`** (nueva) — `id` UUID PK (default `gen_random_uuid()`); `user_id` UUID NOT NULL → `users(id)`;
  `token_hash` CHAR(64) NOT NULL UNIQUE; `remember` BOOLEAN NOT NULL; `created_at` TIMESTAMPTZ NOT NULL;
  `last_used_at` TIMESTAMPTZ NOT NULL. Índice por `user_id` (cerrar las otras, borrar cuenta). Nada más.
- **`users`** — sin cambios. Las filas nunca se borran (se anonimizan, D4), por eso la FK no usa `ON DELETE CASCADE`
  y el borrado de sesiones es explícito en `deleteAccount`.

**Flujo principal** (login con "Recordarme" y uso días después)

1. `POST /api/auth/login` con `remember: true` → `originChecker` → límite de auth → `AuthService.login` valida
   credenciales (bcrypt, igual que hoy) y devuelve el `userId`.
2. La ruta genera `token = newSessionToken()`, abre una transacción: `create(userId, hash(token), true, now)` y, si
   llegó una cookie, `deleteByTokenHash(hash(cookie))`. Commit.
3. `setSessionCookie(res, token, true)` → `Set-Cookie: token=…; Max-Age=604800; HttpOnly; SameSite=Lax; Secure`.
4. Día 5: `GET /api/me` → middleware `touchActive(hash, now)` → fila actualizada (`last_used_at` = día 5) → reenvía
   la cookie con 7 días nuevos → la ruta responde.
5. Día 13 sin uso desde el día 5 → `touchActive` no encuentra fila vigente → 401 + cookie borrada → la app, al
   cargar, se muestra sin sesión (AC-29).

- **Límites de consistencia:** login/registro (crear + anular la anterior), cambio de contraseña (contraseña +
  otras sesiones) y borrado de cuenta (anonimizar + sesiones) son transaccionales. El registro crea el usuario fuera
  de esa transacción (como hoy): si la sesión falla después, la cuenta existe y la persona puede iniciar sesión
  (riesgo R7).
- **Migración:** `005_create_sessions.sql`, aditiva (`CREATE TABLE IF NOT EXISTS` + índice); `down` comentado:
  `DROP TABLE IF EXISTS sessions`. El código viejo la ignora, así que se aplica antes del deploy. Se corre como la 004:
  desde el contenedor de la app en staging y después en producción, comprobando la tabla con una consulta de solo
  lectura (`security-hardening.md`, T9).
- **Transición del deploy:** las cookies JWT viejas se llaman igual (`token`); su valor, hasheado, no está en la
  tabla → 401 + cookie borrada (AC-10). Nadie queda con un 500.

## 5. Testing strategy

No hay Postgres local: las pruebas del server corren contra la app real (`createApp`) con los repositorios
espiados (patrón de `server/tests/sessionWiring.test.ts`). La SQL de `SessionRepository` se prueba (a) en unidad,
verificando texto y parámetros de cada sentencia, y (b) **contra el Postgres real de staging** al cierre, con el
comprobación en staging del §6 (paso 11). El reloj se inyecta.

| Criterio | Nivel | Afirma | Falsea |
| --- | --- | --- | --- |
| AC-1, AC-2, AC-3, AC-23 | unidad (`isExpired`) + integración (middleware con reloj) | bordes exactos: 6 d 23 h pasa, 7 d no; 11 h 59 min pasa, 12 h no; uso el día 5 corre el plazo | reloj; `touchActive` simulado con la regla de `isExpired` |
| AC-4, AC-12, AC-30 | integración (app real) | logout borra por hash y limpia la cookie; sin cookie 204; base caída → 500 y sin `Set-Cookie` de borrado | repo espiado (lanza en AC-30) |
| AC-5, AC-6, AC-7, AC-19 | integración | `deleteOthers` recibe `userId` y el hash de **esta** sesión; 204 también con 0 borradas | repo espiado |
| AC-8, AC-27 | integración | cambio de contraseña llama a `deleteOthers` en la misma transacción y **no** emite `Set-Cookie` | repo + transacción espiados |
| AC-9, AC-33 | unidad (`deleteAccount`) | la transacción incluye el borrado de sesiones de la cuenta | cliente de transacción falso |
| AC-10 | integración | una cookie JWT con formato viejo → 401 + cookie borrada | `touchActive` → null |
| AC-11, AC-18, AC-19, AC-32 | componente (cliente) | diálogo: nombre accesible, foco inicial, ciclo de Tab, Escape, foco de vuelta, un solo pedido, mensajes 39/35/éxito con su rol | `fetch` simulado |
| AC-13 | integración | `DELETE /api/me/other-sessions` sin `Origin` → 403 y el repo no se llama | — |
| AC-14, AC-21, AC-22 | integración | atributos de `Set-Cookie` en login con y sin "Recordarme" y en un pedido protegido de "Recordarme" | repo espiado |
| AC-15 | contrato (SQL) + staging | la sentencia es un único `UPDATE … RETURNING`; en staging, 20 pedidos simultáneos con la misma cookie dan 200 | — |
| AC-16 | integración | sin cookie → 401 y el repo no se llama | — |
| AC-17 | integración | `touchActive` lanza → 500 `INTERNAL_ERROR`, la ruta no corre | repo lanza |
| AC-20 | componente | casilla con etiqueta, desmarcada, Tab + Espacio, descripción accesible | — |
| AC-24, AC-26, AC-25 | integración | registro y login sin `remember` → sin `Max-Age`; `remember: "si"` → 400 `BAD_REQUEST` sin `create` | repo espiado |
| AC-28, AC-34 | integración | login/registro correctos borran el hash de la cookie entrante; rechazados (401, 429, 400) no | repo espiado |
| AC-29, AC-31 | componente (cliente) | al cargar con `/api/me` → 401: sin mensaje ni redirección en una pública; en una privada, login con `returnTo` | `fetch` simulado |
| AC-35 | unidad | dos `newSessionToken()` distintos, 43 caracteres base64url; `create` recibe el hash, nunca el valor; el valor no contiene el id | — |
| AC-36 | contrato + staging | anular es `DELETE` y renovar es `UPDATE` que no crea filas; en staging, logout mientras corre un pedido → la cookie da 401 después | — |

- **Lo que tiene que ser real:** la app entera (`createApp`) en las pruebas de integración, para cazar errores de
  cableado como los de 5c; el Postgres de staging para la SQL (bordes de tiempo, unicidad del hash, el `UPDATE`
  atómico).
- **Sin e2e en navegador:** Playwright sigue diferido (backlog). El cierre en staging con `curl` y dos cookies
  reemplaza la prueba de punta a punta, como en 5c.

## 6. Sequencing & dependencies

Dos PR, server primero (el cliente viejo sigue funcionando: sin `remember` → modo corto, AC-26).

**PR 1 — server (`feat/server-sessions-server`)**

1. Migración `005_create_sessions.sql` + prueba de esquema en `migrations.test.ts` — depende de: nada — serial.
2. `sessionToken` nuevo (§3.1) con pruebas — depende de: nada — paralelizable con 1.
3. `SessionRepository` (§3.2) con pruebas de SQL — depende de: 1, 2 — serial.
4. `authMiddleware` nuevo (§3.3) y su cableado en `routes.ts` — depende de: 3 — serial.
5. Login, registro y logout (§3.4) — depende de: 3, 4 — serial.
6. Cambio de contraseña y borrado de cuenta (§3.4) — depende de: 3, 4 — paralelizable con 5 (archivos distintos).
7. `DELETE /api/me/other-sessions` — depende de: 4 — paralelizable con 5 y 6.
8. `sessionPurge` cada hora, arrancado junto a `app.listen` en `index.ts` (con `unref`, para no frenar la salida
   del proceso ni las pruebas) — depende de: 3 — paralelizable.
9. Limpieza: quitar `jsonwebtoken` y `@types/jsonwebtoken` (comando para Hernán), `JWT_SECRET` y `JWT_EXPIRES_IN`
   del esquema de `env.ts`, y la huella `pwf` — depende de: 4-7 — serial, último del PR.
10. Barrido de criterios del server en la app real (`server/tests/serverSessions.test.ts`) — depende de: 1-9.
11. Cierre del PR 1: `verify`, panel de 3 lentes, migración 005 en staging, deploy de staging, comprobaciones con
    `curl` y SQL real (detalle abajo), aprobación de Hernán, PR, migración en producción, deploy, smoke.

**PR 2 — cliente (`feat/server-sessions-client`)**

12. Fila 39 en `messages.ts` + casilla "Recordarme" en `LoginPage` — depende de: PR 1 en producción — serial.
13. `ConfirmDialog` + `OtherSessionsSection` en el perfil — depende de: 12 (usa la fila 39) — serial.
14. Cierre del PR 2: `verify`, panel, staging a mano (casilla, diálogo con teclado, dos navegadores), PR, deploy,
    smoke.

**Comprobación en staging del PR 1 (paso 11), por escrito en la verificación:** login A con "Recordarme", login B
sin; `Set-Cookie` de cada uno; pedido protegido con A renueva `Max-Age`; logout de B → B da 401 y A sigue; desde A,
`DELETE /api/me/other-sessions` con una tercera cookie C abierta → C da 401 y A sigue; 20 pedidos simultáneos con
A → 20 × 200; cookie JWT vieja → 401; consulta de solo lectura: `token_hash` de 64 caracteres, ninguna columna de
dispositivo, ninguna fila con el valor de la cookie.

- **Delegación:** pasos mecánicos (1, 2, 8, 12) candidatos a Qwen en worktree de Orca; 3-7, 9, 10 y 13 los hace
  Claude o Qwen con revisión estricta — se pregunta a Hernán antes de lanzar cada uno.
- **Orden duro:** la migración en cada entorno **antes** del deploy que la usa (sin la tabla, todo pedido protegido
  daría 500); el PR 1 en producción antes del PR 2 (el botón necesita la ruta).

## 7. Risks & open decisions

**Riesgos** (de más a menos probable o grave)

| Riesgo | Disparador | Impacto | Mitigación |
| --- | --- | --- | --- |
| R1 — Deploy sin la tabla | se despliega el PR 1 antes de correr la 005 | todo pedido protegido → 500, nadie usa la app | migración primero, con consulta de comprobación anotada; el checklist de cierre lo exige en orden |
| R2 — La cookie no se borra | `clearSessionCookie` con atributos distintos de los de `setSessionCookie` | logout "anda" en el server pero el navegador conserva una cookie inútil | una sola función con los atributos; prueba que compara los dos `Set-Cookie` |
| R3 — Escritura en cada pedido | `touchActive` actualiza la fila siempre | más carga en la base | medir en staging contra la mediana de 5c (292 ms); si sube de forma medible, renovar solo si el último uso tiene más de 60 s (decisión abierta, no se construye sin medición) |
| R4 — Diálogo propio con huecos de accesibilidad | foco o lectura en pantalla mal resueltos | quien usa teclado o lector queda atrapado o sin contexto | pruebas de componente de AC-18 + revisión a mano con teclado en staging; `checklist-accesibilidad` |
| R5 — Cableado roto entre piezas | una ruta usa el middleware viejo o se olvida `deleteOthers` | un criterio pasa en unidad y falla en la app | barrido del paso 10 contra `createApp` (lección de 5c) |
| R6 — Reloj de la app y de la base distintos | alguien usa `now()` de SQL en una sentencia | bordes de 7 d / 12 h corridos | §0 lo prohíbe; la prueba de SQL verifica que la hora llega como parámetro |
| R7 — Registro con sesión fallida | la base falla entre crear el usuario y crear la sesión | la cuenta existe pero la respuesta es 500 | se acepta (la persona inicia sesión); igual que hoy con el JWT si fallara la firma |
| R8 — Logout comparte el límite estricto | 5 pedidos por minuto en `/api/auth` | "Salir" después de varios logins da 429 → fila 10 | sin cambios respecto de hoy (error-codes ya lo cubre) |

**Rollback:** revertir el PR 1 deja el código JWT; la tabla `sessions` queda sin uso y no molesta (aditiva). Las
cookies opacas no pasan la verificación del JWT → 401 → la gente vuelve a iniciar sesión una vez. Se borra la tabla
solo si se abandona la feature.

**Decisiones abiertas**

- Renovación con umbral (R3): se cierra con la medición en staging del paso 11.

**Hallazgo al margen (no es de este plan):** `createLoanScan` (`server/src/modules/loans/loanScan.ts`) no aparece
llamado en `server/src/index.ts`. Hay que confirmar si el escaneo de préstamos vencidos corre por otro camino; va al
backlog, no se toca acá.

## Revisions

- **2026-11-18 — primera versión.**
