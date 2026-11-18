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
- **Formato de la cookie entrante:** se acepta solo si es un `string` que cumple `^[A-Za-z0-9_-]{43}$`. Cualquier
  otra cosa (un JWT viejo, un objeto que `cookie-parser` armó desde un valor `j:…`, basura) cuenta como **sesión
  desconocida**, sin consultar la base: el middleware responde 401 y borra la cookie; el logout responde 204 y la
  borra; login y registro simplemente no intentan anularla (no llaman a `deleteByTokenHash`). Una sola función
  (`readSessionCookie(req) -> string | null`) aplica la regla en los cuatro lugares.
- **Plazos sin uso:** con "Recordarme" 7 días (`604 800 000` ms); sin él 12 horas (`43 200 000` ms). Una sesión
  vence cuando `ahora - último_uso >= plazo` (exactamente 7 días o 12 h ya es vencida, spec *Behaviour → Bordes*).
- **Una sola regla del plazo:** `idleCutoffs(now)` devuelve dos fechas, `rememberCutoff = now - 7 d` y
  `shortCutoff = now - 12 h`. **Toda** sentencia que decide si una sesión sigue vigente las recibe como parámetros:
  vigente ⇔ `last_used_at > CASE WHEN remember THEN <rememberCutoff> ELSE <shortCutoff> END` (estricto: igual al
  corte ya es vencida); la purga borra el complemento (`NOT (…)`). La condición se escribe **una sola vez**, como un
  fragmento SQL exportado por `SessionRepository` que `touchActive` y `purgeExpired` reutilizan (la prueba de SQL
  afirma que las dos sentencias lo contienen). Ninguna otra copia de la regla (ni en JS ni en SQL).
- **Reloj:** toda comparación y todo "último uso" usa el reloj de la app (`Date`), nunca el `now()` de Postgres. Las
  pruebas controlan el tiempo con `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime`.
- **"Recordarme" en el cuerpo del login:** ausente (`undefined`) → `false`; `true`/`false` → ese valor; cualquier otro
  valor, **incluido `null`** → 400 `BAD_REQUEST`.
- **Deploy a staging:** siempre `railway up -e staging --service prestoteca --ci` desde el checkout de la rama.
  **Nunca** `railway service source connect` (la fuente del servicio es una sola para los dos entornos: movería
  producción). Después de cada deploy se listan los deploys de **los dos** entornos.
- **`JWT_SECRET` en Railway:** la variable se **conserva** en los dos entornos hasta que el PR 2 lleve una semana
  estable en producción, aunque el código ya no la lea (rollback, §7).
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
 navegador ──cookie token──▶ límites de pedidos ⇄ originChecker ─▶ authMiddleware ──▶ rutas protegidas
                             (en /api/auth el límite estricto corre antes del origen: index.ts:46, routes.ts:31)
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
idleCutoffs(now: Date) -> { rememberCutoff: Date, shortCutoff: Date }   // now - 7 d, now - 12 h
```

- `idleCutoffs` es la única fuente del plazo; las sentencias de §3.2 reciben sus dos fechas (§0).
- Se eliminan `passwordFingerprint` y `signSessionToken` (y con ellos `jsonwebtoken`). La comprobación "la
  contraseña cambió" pasa a ser el borrado explícito de las otras sesiones (D14).

### 3.2 `SessionRepository`

```text
createIfPasswordCurrent(userId, expectedPasswordHash, tokenHash, remember, now, db?) -> boolean
  - INSERT … SELECT … FROM users WHERE id = userId AND password_hash = expectedPasswordHash AND deleted_at IS NULL
    **FOR SHARE**
  - false (0 filas) = la contraseña cambió o la cuenta se borró mientras corría bcrypt (~200 ms): no queda sesión
    de una contraseña vieja ni de una cuenta borrada (AC-8, AC-33). La ruta responde como credenciales inválidas.
  - `FOR SHARE` es obligatorio: en READ COMMITTED, sin él la sentencia lee la fila confirmada vieja aunque un cambio
    de contraseña o un borrado de cuenta (que bloquea con `FOR UPDATE`, `accountDeletion.ts:25`) esté a mitad de
    camino, y la sesión vieja sobrevive. Con `FOR SHARE`, Postgres espera a esa transacción y vuelve a evaluar el
    `WHERE` sobre la versión nueva → 0 filas (documentación de Postgres, *Read Committed Isolation Level*). En el
    orden inverso (el login confirma primero), el `UPDATE` de la contraseña espera al login y su `deleteOthers`
    posterior ya ve y borra esa sesión.
touchActive(tokenHash, now, cutoffs) -> { userId, remember } | null
  - una sola sentencia UPDATE … RETURNING: last_used_at = now SOLO si la fila existe, sigue vigente según §0 y la
    cuenta tiene deleted_at IS NULL; devuelve user_id y remember
  - nunca crea filas
deleteByTokenHash(tokenHash, db?) -> void                    // idempotente: 0 filas no es error
deleteOthers(userId, keepTokenHash, db?) -> number           // borra todas las de la cuenta menos keepTokenHash
deleteAllForUser(userId, db) -> number                       // dentro de la transacción de borrado de cuenta
purgeExpired(cutoffs) -> number                              // borra el complemento de "vigente" (§0)
```

- `db?` = un cliente de transacción de `withTransaction` (`server/src/modules/db/transaction.ts`); sin él usa el pool.

### 3.2b Firmas que cambian (hoy reciben el secreto del JWT)

```text
UserRepository.updatePassword(id, passwordHash, db?) -> boolean   // hoy abre su propia conexión (userRepo.ts:160)
AuthService(userRepo)                                              // hoy (userRepo, jwtSecret, jwtIssuer)
  login({ email, password }) -> { userId, passwordHash }           // hoy devuelve { token }
  register(input) -> { userId, passwordHash }                      // hoy devuelve { token }
authRoutes(userRepo, sessionRepo, pool)                            // hoy (userRepo, jwtSecret, jwtIssuer)
meAccountRoutes(userRepo, sessionRepo, pool)                       // hoy (userRepo, pool, jwtSecret, jwtIssuer)
createAuthMiddleware(sessionRepo)                                  // hoy (userRepo, jwtSecret)
deleteAccount(pool, sessionRepo, userId, replacementHash)          // hoy (pool, userId, replacementHash)
AuthRequest { userId?: string; sessionTokenHash?: string }         // hoy solo userId (middleware/auth.ts:7)
```

- `sessionTokenHash` lo carga **solo** el middleware real. `PATCH /api/me/password` y
  `DELETE /api/me/other-sessions` responden 401 `SESSION_REQUIRED` si falta: con `undefined`, `token_hash <> NULL`
  no borraría nada y devolvería 204 (éxito falso), y un `IS DISTINCT FROM` borraría también la sesión actual. Los
  middlewares falsos de las pruebas tienen que cargarlo.
- Toda SQL parametrizada. Todos los errores de la base suben como excepción (no se tragan).

### 3.3 `authMiddleware` (reemplaza `createAuthMiddleware(userRepo, jwtSecret)`)

```text
createAuthMiddleware(sessionRepo)        // hora: new Date(); plazos: idleCutoffs(ahora)
  sin cookie                         -> 401 SESSION_REQUIRED
  cookie con otro formato (§0)       -> 401 SESSION_REQUIRED + clearSessionCookie, sin tocar la base (AC-10)
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
  remember ausente → false (AC-26); boolean → ese valor; otro valor, incluido null → 400 BAD_REQUEST, sin sesión
  (AC-25)
  credenciales OK → en UNA transacción: createIfPasswordCurrent(nueva) + deleteByTokenHash(hash de la cookie
                    entrante, si había); false → 401 INVALID_CREDENTIALS y rollback;
                    setSessionCookie(nuevo, remember); 200 { message } (igual que hoy)
  rechazado (400/401/429) → no toca la sesión entrante (AC-28)
POST /api/auth/register body { name, email, password, neighborhood }   // sin remember, pantalla sin cambios
  creado → misma transacción que login con remember = false (AC-24, AC-34); 201 igual que hoy
  createIfPasswordCurrent → false justo después de crear (cuenta borrada en esos milisegundos, o falla) →
    500 INTERNAL_ERROR (camino R7), nunca INVALID_CREDENTIALS: la pantalla de registro no muestra la fila 7
  rechazado → no toca la sesión entrante
POST /api/auth/logout
  sin cookie, cookie con otro formato (§0) o sesión desconocida → clearSessionCookie; 204 (AC-12)
  con cookie → deleteByTokenHash; OK → clearSessionCookie; 204 (AC-4)
              falla de la base → 500 INTERNAL_ERROR, la cookie NO se borra (AC-30)
PATCH /api/me/password  (protegida)
  en UNA transacción: updatePassword(…, db) + deleteOthers(userId, req.sessionTokenHash, db) (AC-8)
  la ruta no emite cookie propia: la sesión actual conserva valor y modo (AC-27); el único Set-Cookie posible es la
  renovación del middleware en modo "Recordarme", con el mismo valor; 204 igual que hoy
DELETE /api/me/account  (protegida)
  deleteAccount agrega deleteAllForUser dentro de su transacción (AC-9, AC-33); clearSessionCookie; 204
  (en modo "Recordarme" la respuesta lleva dos Set-Cookie: la renovación del middleware y después el borrado; el
  navegador aplica el último)
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
    204 → cierra, mensaje de éxito en la región role="status" de la sección
    error con code SESSION_REQUIRED → useApiError.handle (fila 8 + login, igual que el resto de la app)
    error con code RATE_LIMITED → fila 35 en la región role="alert" de la sección
    cualquier otro caso → fila 39 en la región role="alert": INTERNAL_ERROR, ORIGIN_NOT_ALLOWED, UNKNOWN_ERROR,
      cuerpo que no es JSON, y fallo de red (fetchFailureCode → NETWORK_ERROR, que acá NO muestra la fila 36)
    AbortError (la persona se fue de la página) → nada
  regiones vivas: OtherSessionsSection tiene su propio estado y sus dos regiones (status y alert), **siempre
    montadas** y vacías por defecto, dentro de la sección (no en la tarjeta de "Cambiar contraseña",
    ProfilePage.tsx:464-475). Al empezar cada pedido las dos se vacían; así el mismo texto de éxito se vuelve a
    anunciar en el segundo intento (AC-18 lo pide siempre). El foco vuelve al botón después de escribir el texto.
messages.ts: OTHER_SESSIONS_CLOSE_FAILED (fila 39), código del cliente como LOGOUT_FAILED (fila 10), en
  CLIENT_ONLY_CODES
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

1. `POST /api/auth/login` con `remember: true` → límite de auth → `originChecker` → `AuthService.login` valida
   credenciales (bcrypt, igual que hoy) y devuelve `{ userId, passwordHash }`.
2. La ruta genera `token = newSessionToken()`, abre una transacción:
   `createIfPasswordCurrent(userId, passwordHash, hash(token), true, now)` y, si llegó una cookie,
   `deleteByTokenHash(hash(cookie))`. Commit.
3. `setSessionCookie(res, token, true)` → `Set-Cookie: token=…; Max-Age=604800; HttpOnly; SameSite=Lax; Secure`.
4. Día 5: `GET /api/me` → middleware `touchActive(hash, now, idleCutoffs(now))` → fila actualizada (`last_used_at` = día 5) → reenvía
   la cookie con 7 días nuevos → la ruta responde.
5. Día 13 sin uso desde el día 5 → `touchActive` no encuentra fila vigente → 401 + cookie borrada → la app, al
   cargar, se muestra sin sesión (AC-29).

- **Límites de consistencia:** login/registro (crear + anular la anterior), cambio de contraseña (contraseña +
  otras sesiones) y borrado de cuenta (anonimizar + sesiones) son transaccionales. El registro crea el usuario fuera
  de esa transacción (como hoy): si la sesión falla después, la cuenta existe y la persona puede iniciar sesión
  (riesgo R7).
- **Migración:** `005_create_sessions.sql`, aditiva (`CREATE TABLE IF NOT EXISTS` + índice); `down` comentado:
  `DROP TABLE IF EXISTS sessions`. El código viejo la ignora, así que se aplica antes del deploy. **No** se puede
  correr como la 004 (desde el contenedor de la app): ese contenedor tiene el código viejo de `main`, sin el archivo
  005, y en la PC no hay `psql`. Procedimiento: `railway ssh -s Postgres -e <entorno>` y `psql` **dentro** del
  contenedor de Postgres, con el SQL del archivo enviado por la entrada estándar; después, una consulta a
  `information_schema.columns` que liste las columnas de `sessions`. Siempre con `-e staging` / `-e production`
  explícito (la CLI está enlazada a producción). Si `railway ssh` falla (ya pasó, `security-hardening.md`), se
  reintenta; no hay atajo que se salte la comprobación.
- **Transición del deploy:** las cookies JWT viejas se llaman igual (`token`); su valor, hasheado, no está en la
  tabla → 401 + cookie borrada (AC-10). Nadie queda con un 500.

## 5. Testing strategy

No hay Postgres local: las pruebas del server corren contra la app real (`createApp`) con los repositorios
espiados (patrón de `server/tests/sessionWiring.test.ts`). Como `createApp` usa el `getPool()` real apuntado a una
base inválida, las rutas con transacción (login, registro, contraseña, borrado) necesitan además
`vi.spyOn(Pool.prototype, 'connect')` devolviendo un cliente falso que registra `BEGIN`/`COMMIT`/`ROLLBACK`. El
falso tiene que soportar **las dos formas** de `connect`: con callback (`pool.query` de `pg-pool` llama
`this.connect(cb)`, `node_modules/pg-pool/index.js:449`) y con promesa; si no, una consulta que alguien olvidó
espiar cuelga hasta el timeout en vez de fallar. Se instala solo en las pruebas que necesitan transacción. El
reloj se controla con `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime`. La SQL de `SessionRepository`
se prueba (a) en unidad, verificando texto y parámetros (sobre todo que los cortes de `idleCutoffs` llegan como
parámetros y que no aparece `now()` de SQL), y (b) **contra el Postgres real de staging** al cierre (§6, paso 9).

| Criterio | Nivel | Afirma | Falsea |
| --- | --- | --- | --- |
| AC-1, AC-2, AC-3, AC-23 | unidad (`idleCutoffs`, sentencia de `touchActive`) + **staging** | `idleCutoffs` en los bordes exactos; la sentencia usa `>` contra los dos cortes por parámetro; en staging, `last_used_at` puesto por SQL a 6 d 23 h / 7 d y 11 h 59 min / 12 h → `curl` da 200 / 401 / 200 / 401; uso el día 5 corre el plazo | reloj |
| AC-4, AC-12, AC-30 | integración (app real) | logout borra por hash y limpia la cookie; sin cookie 204; base caída → 500 y sin `Set-Cookie` de borrado | repo espiado (lanza en AC-30) |
| AC-5, AC-6, AC-7, AC-19 | integración | `deleteOthers` recibe `userId` y el hash de **esta** sesión; 204 también con 0 borradas | repo espiado |
| AC-8, AC-27 | integración | cambio de contraseña: `updatePassword` y `deleteOthers` en la misma transacción; el valor de la cookie no cambia; `Max-Age` aparece solo si la sesión es "Recordarme" | repo + `Pool.prototype.connect` espiados |
| AC-8, AC-33 (carrera) | integración + unidad (SQL) | login con `createIfPasswordCurrent` → false (contraseña cambiada o cuenta borrada durante bcrypt) → 401 y rollback, sin `Set-Cookie`; la sentencia contiene `FOR SHARE` y compara `password_hash` y `deleted_at` | repo espiado |
| AC-9, AC-33 | unidad (`deleteAccount`) + integración | la transacción incluye el borrado de sesiones; la respuesta termina con el `Set-Cookie` de borrado (se lee el **último**) | cliente de transacción falso |
| AC-37 (retención) | unidad (`sessionPurge`) + staging | cada hora llama a `purgeExpired` con los cortes; si la base rechaza, registra el error y el proceso sigue (sin `unhandledRejection`); en staging, una fila vencida desaparece tras correr la purga | timers falsos; repo que rechaza |
| AC-10 | integración | una cookie JWT con formato viejo, y una `j:{}` → 401 + cookie borrada, **sin** llamar a `touchActive`; en logout, las mismas → 204 | repo espiado (se afirma que no se llamó) |
| AC-6, AC-8 (guardia) | integración | `PATCH /api/me/password` y `DELETE /api/me/other-sessions` sin `sessionTokenHash` en el pedido → 401 y el repo no se llama | middleware falso que solo carga `userId` |
| AC-11, AC-18, AC-19, AC-32 | componente (cliente) | diálogo: nombre accesible, foco inicial, ciclo de Tab, Escape, foco de vuelta, un solo pedido, mensajes 39/35/éxito con su rol | `fetch` simulado |
| AC-13 | integración | `DELETE /api/me/other-sessions` sin `Origin` → 403 y el repo no se llama | — |
| AC-14, AC-21, AC-22 | integración + unidad | atributos de `Set-Cookie` en login con y sin "Recordarme" y en un pedido protegido de "Recordarme"; con `NODE_ENV=production`, `setSessionCookie` y `clearSessionCookie` llevan los dos `Secure`, `HttpOnly`, `SameSite=Lax` y `Path=/` iguales | repo espiado |
| AC-15 | contrato (SQL) + staging | la sentencia es un único `UPDATE … RETURNING`; en staging, 20 pedidos simultáneos con la misma cookie dan 200 | — |
| AC-16 | integración | sin cookie → 401 y el repo no se llama | — |
| AC-17 | integración | `touchActive` lanza → 500 `INTERNAL_ERROR`, la ruta no corre | repo lanza |
| AC-20 | componente | casilla con etiqueta, desmarcada, Tab + Espacio, descripción accesible | — |
| AC-24, AC-26, AC-25 | integración | registro y login sin `remember` → sin `Max-Age`; `remember: "si"` y `remember: null` → 400 `BAD_REQUEST` sin crear sesión | repo espiado |
| AC-28, AC-34 | integración | login/registro correctos borran el hash de la cookie entrante; rechazados (401, 429, 400) no | repo espiado |
| AC-29, AC-31 | componente (cliente) | al cargar con `/api/me` → 401: sin mensaje ni redirección en una pública; en una privada, login con `returnTo` | `fetch` simulado |
| AC-35 | unidad | dos `newSessionToken()` distintos, 43 caracteres base64url; `createIfPasswordCurrent` recibe el hash, nunca el valor; el valor no contiene el id | — |
| AC-28, AC-34 (cookie rara) | integración | login y registro correctos con una cookie `j:{}` entrante → 200/201 sin llamar a `deleteByTokenHash` | repo espiado |
| AC-24 (carrera en registro) | integración | registro con `createIfPasswordCurrent` → false → 500 `INTERNAL_ERROR`, no 401 | repo espiado |
| AC-11, AC-32 (mapeo) | componente | respuesta 500, `ORIGIN_NOT_ALLOWED`, cuerpo no JSON y fallo de red → fila 39; `RATE_LIMITED` → fila 35; `AbortError` → nada | `fetch` simulado |
| AC-36 | contrato + staging | anular es `DELETE` y renovar es `UPDATE` que no crea filas; en staging, logout mientras corre un pedido → la cookie da 401 después | — |

- **Lo que tiene que ser real:** la app entera (`createApp`) en las pruebas de integración, para cazar errores de
  cableado como los de 5c; el Postgres de staging para la SQL (bordes de tiempo, unicidad del hash, el `UPDATE`
  atómico).
- **Sin e2e en navegador:** Playwright sigue diferido (backlog). El cierre en staging con `curl` y dos cookies
  reemplaza la prueba de punta a punta, como en 5c.

## 6. Sequencing & dependencies

Dos PR, server primero (el cliente viejo sigue funcionando: sin `remember` → modo corto, AC-26).

**Paso 0 — arreglo previo (la suite del cliente ya está en rojo en `main`).** El PR #48 agregó la fila 39 a la tabla
de `error-codes.md` sin tocar el cliente, y `client/src/errors/messages.test.ts:104` ("finds the 38 rows") lee esa
tabla: hoy falla 1 de 91. Arreglo: `OTHER_SESSIONS_CLOSE_FAILED` con el texto de la fila 39 en `messages.ts` y en
`CLIENT_ONLY_CODES`, `ROW_TO_CODE[39]` y "39 rows" en la prueba. Va antes que todo, para que el `verify` de
cualquier PR encuentre las dos suites en verde. **Hecho el 2026-11-18** en la rama `docs/server-sessions-plan`
(rojo comprobado en la fila 39 antes del código; después cliente 20 archivos, 486/486, `tsc -b` y oxlint en 0;
tier 1, un revisor sin contexto: Approved).

**PR 1 — server (`feat/server-sessions-server`)**

Cada paso termina con toda la suite en verde (`npm test` en `server/`), `tsc -b` sin errores y su commit. Por eso
el cambio de JWT a sesiones es **un solo paso** (4): partirlo dejaría pasos intermedios en rojo.

1. Migración `005_create_sessions.sql` + prueba de esquema en `migrations.test.ts`, que afirma también lo que podría
   fallar en silencio: `user_id UUID NOT NULL REFERENCES users(id)` **sin** `CASCADE`, `token_hash CHAR(64) NOT NULL
   UNIQUE`, `remember BOOLEAN NOT NULL`, el índice por `user_id`, ninguna columna con `DEFAULT now()` (la hora la
   pone la app), y el `down` solo en comentario (sin `DROP` activo, como la prueba de la 004) — depende de: nada —
   serial.
2. `sessionToken`: se **agregan** `newSessionToken`, `hashSessionToken`, `idleCutoffs`, `setSessionCookie(res,
   token, remember)` nueva y `clearSessionCookie`, sin quitar todavía lo del JWT — pruebas en
   `sessionToken.test.ts` — depende de: nada — paralelizable con 1.
3. `SessionRepository` (§3.2) + `updatePassword(id, hash, db?)` — pruebas de SQL nuevas (`sessionRepo.test.ts`) y
   `userRepo.test.ts` — depende de: 1, 2 — serial.
4. **El cambio**: `createAuthMiddleware(sessionRepo)`, `AuthService(userRepo)`, `authRoutes` y `meAccountRoutes`
   con las firmas de §3.2b, login/registro/logout, cambio de contraseña, borrado de cuenta (`deleteAccount`),
   `DELETE /api/me/other-sessions`, cableado en `routes.ts`; se quitan `signSessionToken`, `passwordFingerprint` y
   `pwf`; `AuthRequest` suma `sessionTokenHash`. **Pruebas que se reescriben en este paso:** `middleware.test.ts`,
   `authService.test.ts`, `authRoutes.test.ts` (:40, firma nueva y `Pool.prototype.connect`),
   `authValidation.test.ts` (:40, ídem), `meAccountRoutes.test.ts` (:84, y su middleware falso de :79 carga
   `sessionTokenHash`), `meRoutes.test.ts` (:58, firma), `accountDeletion.test.ts` (:99, :123, :137, :150 firma de
   `deleteAccount`; :162 firma de `meAccountRoutes`), `sessionToken.test.ts` (lo del JWT), `sessionWiring.test.ts`
   (W3, W4) y `errors.test.ts` (`jwt.sign` en :136 y :172). `securityAc.test.ts` y `t030_routes.test.ts` no montan
   las rutas de cuenta (sus middlewares falsos no cambian); `health.test.ts` y `originWiring.test.ts` solo ponen
   `JWT_SECRET` y siguen pasando; `loansRoutes.test.ts` no cambia (middleware falso propio) — depende de: 2, 3
   — serial. `tasks` puede partirlo en subtareas, pero se commitea entero y en verde.
5. `sessionPurge.ts` con `startSessionPurge(sessionRepo, intervalMs = 1 h)`: corre **una vez al arrancar** (cada
   deploy reinicia el temporizador) y después cada hora, con `unref` y con `catch` que registra el error (nunca una
   promesa rechazada sin atender, que tumbaría Node). En `index.ts` se agrega **una sola línea** que lo llama, dentro
   del bloque que hace `app.listen` (ese bloque no lo corren las pruebas; la lógica vive en `sessionPurge.ts`, que sí
   se prueba, para no romper la cobertura por archivo) — depende de: 3 — paralelizable con 4.
6. Limpieza: quitar `jsonwebtoken` y `@types/jsonwebtoken` (comando para Hernán) y `JWT_SECRET`/`JWT_EXPIRES_IN`
   del esquema de `env.ts`, reescribiendo `env.test.ts:30-41`. La variable **sigue** en Railway (§0) — depende de: 4
   — serial.
7. Barrido de criterios del server en la app real (`server/tests/serverSessions.test.ts`): un caso por criterio
   del server que no haya quedado probado en 1-6 — depende de: 1-6.
8. Cierre del PR 1 en local: `verify` (cobertura por archivo), `rsc risk`, panel de 3 lentes, `branch:` de la spec
   apuntando a la rama.
9. **Staging:** migración 005 con el procedimiento de §4 (psql dentro del contenedor de Postgres de staging) →
   `railway up -e staging --service prestoteca --ci` desde el checkout de la rama → lista de deploys de staging y
   de producción (producción no tiene que haber cambiado) → comprobaciones de abajo → medición de latencia (R3).
   Las comprobaciones de bordes y de purga **escriben** en la base de staging (solo sobre sesiones de una cuenta de
   prueba `qa-sessions-*@example.com`), por el mismo `psql`.
10. Aprobación de Hernán → PR → migración 005 en **producción** (comprobada) → merge (el deploy de producción sale
    de `main`) → lista de deploys de los dos entornos → smoke en producción.

**PR 2 — cliente (`feat/server-sessions-client`)**

11. Casilla "Recordarme" en `LoginPage` — **pruebas que se reescriben:** `authPages.test.tsx:250-258` (el cuerpo
    exacto del login suma `remember: false`), y las de etiqueta y axe del login en `accessibility.test.tsx` — depende
    de: PR 1 en producción — serial. *(La fila 39 en `messages.ts` ya no va acá: ver paso 0.)*
12. `ConfirmDialog` + `OtherSessionsSection` en el perfil — **pruebas que se reescriben:** las ~18 búsquedas de un
    solo `getByRole('alert')` / `getByRole('status')` de `profilePage.test.tsx`, acotadas con `within()` a su
    tarjeta, porque la sección nueva deja sus regiones siempre montadas — depende de: 11 — serial.
13. Cierre del PR 2: `verify`, panel, staging con `railway up` (casilla, diálogo con teclado, dos navegadores), PR,
    deploy, smoke.

**Comprobación en staging del PR 1 (paso 9), por escrito en la verificación:**

- Login A con "Recordarme" y login B sin: `Set-Cookie` de cada uno (con y sin `Max-Age`, `HttpOnly`,
  `SameSite=Lax`, `Secure`).
- Un pedido protegido con A reenvía `Max-Age=604800`.
- Bordes con SQL sobre una sesión de prueba: `last_used_at` a 6 d 23 h → 200; a 7 d → 401; en modo corto a 11 h
  59 min → 200; a 12 h → 401.
- Logout de B → B da 401 y A sigue. Desde A, `DELETE /api/me/other-sessions` con una tercera cookie C abierta → C
  da 401 y A sigue.
- 20 pedidos simultáneos con A → 20 × 200.
- Cookie JWT vieja → 401 y `Set-Cookie` de borrado.
- Purga: una fila de la cuenta de prueba con `last_used_at` puesto a hace 8 días desaparece después de reiniciar el
  servicio de staging (`railway restart -e staging --service prestoteca`; la purga corre al arrancar).
- Consulta de solo lectura: `token_hash` de 64 caracteres, ninguna columna de dispositivo, ninguna fila con el
  valor de una cookie.

- **Delegación:** pasos mecánicos (1, 2, 5, 11) candidatos a Qwen en worktree de Orca; 3, 4, 6, 7 y 12 los hace
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
| R5 — Cableado roto entre piezas | una ruta usa el middleware viejo o se olvida `deleteOthers` | un criterio pasa en unidad y falla en la app | barrido del paso 7 contra `createApp` (lección de 5c) |
| R6 — Reloj de la app y de la base distintos | alguien usa `now()` de SQL en una sentencia | bordes de 7 d / 12 h corridos | §0 lo prohíbe; la prueba de SQL verifica que la hora llega como parámetro |
| R6b — La regla del plazo vive en SQL | `>` en vez de `>=` o un `CASE` mal escrito | sesiones que duran de más o de menos | una sola fuente (`idleCutoffs`) + bordes probados con SQL real en staging (paso 9) |
| R9 — Staging desplegado moviendo producción | se usa `railway service source connect` para staging | el PR 1 llega a producción antes de la 005 → R1 | §0: solo `railway up -e staging`; lista de deploys de los dos entornos después de cada uno |
| R7 — Registro con sesión fallida | la base falla entre crear el usuario y crear la sesión | la cuenta existe pero la respuesta es 500 | se acepta (la persona inicia sesión); igual que hoy con el JWT si fallara la firma |
| R8 — Logout comparte el límite estricto | 5 pedidos por minuto en `/api/auth` | "Salir" después de varios logins da 429 → fila 10 | sin cambios respecto de hoy (error-codes ya lo cubre) |

**Rollback:** revertir el PR 1 deja el código JWT; la tabla `sessions` queda sin uso y no molesta (aditiva). Las
cookies opacas no pasan la verificación del JWT → 401 → la gente vuelve a iniciar sesión una vez. El código viejo
exige `JWT_SECRET` (≥ 32 caracteres, `env.ts:13`) al arrancar: por eso la variable sigue en Railway (§0). **Antes de
volver a desplegar hacia adelante** después de un rollback se corre `DELETE FROM sessions`: los logouts hechos
durante el rollback no borraron filas, y sin limpiar esas sesiones revivirían. Se borra la tabla solo si se abandona
la feature.

**Decisiones abiertas**

- Renovación con umbral (R3): se cierra con la medición en staging del paso 9.

**Enmiendas a la spec que este plan necesitaba** (aprobadas por Hernán el 2026-11-18 y ya aplicadas en la spec):

- *What it must respect → Contraseñas* dice que "la huella de la contraseña de 5c no cambia de forma"; este plan
  la elimina (D14) y la reemplaza por el borrado de las otras sesiones. Se corrige ese renglón.
- *Points to clarify* pide que el plan agregue el criterio de la retención: **AC-37** — "Given una sesión vencida,
  When pasa una hora, Then ya no está guardada".

**Hallazgo al margen (no es de este plan):** `createLoanScan` (`server/src/modules/loans/loanScan.ts`) no aparece
llamado en `server/src/index.ts`. Hay que confirmar si el escaneo de préstamos vencidos corre por otro camino; va al
backlog, no se toca acá.

## Revisions

- **2026-11-18 — primera versión.**
- **2026-11-18 — revisión con ojos frescos (con lectura del código).** Doce ajustes: la regla del plazo pasa a una
  sola fuente (`idleCutoffs`) cuyos cortes reciben las sentencias como parámetros, con bordes probados en SQL real;
  deploy de staging solo con `railway up` y lista de deploys de los dos entornos; contratos de las firmas que
  cambian (§3.2b) y `updatePassword(…, db?)`; método de prueba con `Pool.prototype.connect` espiado y fecha falsa;
  aserciones de `Set-Cookie` corregidas (renovación del middleware, se lee el último); el cambio JWT → sesiones es
  un solo paso con la lista de pruebas que reescribe; purga con `catch` y AC-37; rollback con `JWT_SECRET`
  conservado y limpieza al volver; `createIfPasswordCurrent` cierra la carrera login/cambio de contraseña;
  `remember: null` → 400; orden real de límite y origen en el diagrama; dos enmiendas de spec propuestas.
- **2026-11-18 — segunda revisión con ojos frescos.** Ocho ajustes: `FOR SHARE` en `createIfPasswordCurrent` (sin
  él la carrera con el cambio de contraseña y el borrado de cuenta seguía abierta en READ COMMITTED; verificado en
  la documentación de Postgres); formato de la cookie entrante validado antes de tocar la base (`cookie-parser`
  convierte `j:…` en objeto y haría fallar el hash); lista correcta de pruebas que reescribe el paso 4
  (`authRoutes`, `authValidation`, `meRoutes`, `accountDeletion:162`; `health` y `originWiring` no se rompen);
  firma nueva de `deleteAccount`; `AuthRequest.sessionTokenHash` con 401 si falta; la condición de vigencia como un
  solo fragmento SQL; la purga corre al arrancar y vive en su propio archivo; `Secure` probado con
  `NODE_ENV=production`.
- **2026-11-18 — tercera revisión con ojos frescos (foco en el cliente).** Diez ajustes: **paso 0** — la suite del
  cliente ya estaba en rojo en `main` (`messages.test.ts`, 38 vs 39 filas) por el PR #48, que agregó la fila 39 solo
  a la spec; lista de pruebas del login que se reescriben (`authPages.test.tsx:250-258`, `accessibility.test.tsx`);
  regiones vivas propias de la sección, siempre montadas y vaciadas antes de cada pedido, con las pruebas del perfil
  acotadas con `within()`; mapeo exacto de errores de la acción nueva (solo `SESSION_REQUIRED` va a `useApiError`, la
  red muestra la fila 39 y no la 36); el `connect` falso soporta callback; formato de cookie también en login y
  registro (`readSessionCookie`); registro con `createIfPasswordCurrent` → false da 500; procedimiento real de la
  migración y de las escrituras en staging (psql dentro del contenedor de Postgres, purga probada reiniciando);
  nombres viejos corregidos en §4 y §5; la prueba de la migración afirma FK sin `CASCADE`, unicidad, índice y `down`
  comentado.
