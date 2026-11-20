---
type: verification
title: server-sessions — verificación del PR 1 en staging (T009)
description: Migración 005 y deploy del PR 1 en staging, con cada comprobación del plan contra el Postgres real. PASS.
tags: [sdd, verification, auth, session, staging]
timestamp: 2026-11-19T18:40:00Z
topic: sdd
slug: server-sessions
---

# server-sessions — verificación del PR 1 en staging (T009)

> Tarea T009 del [plan](../plans/server-sessions.md) · [spec](../specs/server-sessions.md) ·
> [progreso](../progress/server-sessions.md). Rama `feat/server-sessions-server`, commit `dee7ae2` (no pusheado).

**Veredicto (2026-11-19): PASS** (ver el final).

**Reglas de este archivo:** nunca va el valor de una cookie ni de un secreto (como mucho los 6 primeros caracteres o
el hash). Todo comando de Railway lleva `-e staging` o `-e production` explícito: la CLI está enlazada a
producción. La CLI es `~/.railway/bin/railway.exe` (5.71.0); `npx railway` corre otra cosa en este repo (el paquete de
IaC de `devDependencies`).

## 0. Estado antes de empezar (solo lectura)

| Qué | Resultado |
| --- | --- |
| Deploy de `prestoteca` en staging | `471165e` (#49), SUCCESS, 2026-11-18 21:18 UTC |
| Deploy de `prestoteca` en producción | `471165e` (#49), SUCCESS, 2026-11-18 21:18 UTC |
| Base de staging (`railway`) | sin tabla `sessions`; 3 tablas en `public` (sin tabla de control de migraciones); 9 cuentas activas; 0 cuentas `qa-sessions-*` |
| `JWT_SECRET` (servicio `prestoteca`, no Postgres) | presente con 32 caracteres o más en **los dos** entornos. Comprobado dentro de cada contenedor con `railway ssh -s prestoteca -e <entorno> -- sh -c '… ${#JWT_SECRET} …'`: el valor no sale del contenedor. Se conserva para una vuelta atrás (plan §0). |
| `CORS_ORIGIN` de staging | `https://prestoteca-staging.up.railway.app` (según `../../ftd/railway-deploy.md:111`; listar las variables quedó bloqueado por el sistema de permisos porque trae los valores) |

## 1. Migración 005 en staging — hecha (2026-11-19, OK de Hernán)

- Procedimiento del plan §4: `psql` **dentro** del contenedor de Postgres de staging, con el archivo por la entrada
  estándar: `cat server/src/migrations/005_create_sessions.sql | railway ssh -s Postgres -e staging -- sh -c 'psql -U
  "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -1'`.
- Antes, una consulta de prueba por la misma vía (`SELECT 'stdin llega'`) confirmó que `railway ssh` reenvía la
  entrada estándar: sin eso, `psql` no recibiría nada y saldría con 0 como si hubiera funcionado.
- Archivo: SHA-256 `3de91b2c1991aa09…`. Salida: `CREATE TABLE`, `CREATE INDEX`, exit 0.

**Comprobación (solo lectura):**

| Qué | Resultado | Esperado (plan) |
| --- | --- | --- |
| Columnas | `id uuid NOT NULL DEFAULT gen_random_uuid()`, `user_id uuid NOT NULL`, `token_hash character(64) NOT NULL`, `remember boolean NOT NULL`, `created_at timestamptz NOT NULL`, `last_used_at timestamptz NOT NULL` | ✅ sin `DEFAULT now()` |
| Restricciones | `PRIMARY KEY (id)`, `UNIQUE (token_hash)`, `FOREIGN KEY (user_id)` | ✅ |
| Clave foránea | → `users(id)`, `delete_rule = NO ACTION` | ✅ sin `CASCADE` |
| Índices | `idx_sessions_user` (btree `user_id`), `sessions_pkey`, `sessions_token_hash_key` | ✅ |
| Filas | 0 | ✅ |

Después: `/api/health` de staging → 200 `{"status":"ok","db":"connected"}` (la app vieja ignora la tabla); producción
→ 200.

## 2. Deploy del PR 1 a staging — hecho (2026-11-19, OK de Hernán)

- Desde el checkout de la rama, en `2838d2c` (mismo código que `dee7ae2`: `git diff --stat dee7ae2 HEAD -- server
  client` vacío; el commit de más es del hook `docs(auto)`), con el árbol limpio:
  `railway up -e staging --service prestoteca --ci` → build del cliente y del server (`tsc -b`) y `Deploy complete`,
  exit 0. Nunca `railway service source connect` (movería producción, plan R9).

**Deploys después del despliegue (los dos entornos):**

| Entorno | Deploy activo | Antes |
| --- | --- | --- |
| staging | SUCCESS 2026-11-19 18:23 UTC, `railway up` (rama `feat/server-sessions-server`) | `471165e` (#49), ahora REMOVED |
| producción | SUCCESS 2026-11-18 21:18 UTC, `471165e` (#49) | **sin cambios** ✅ |

- `/api/health`: staging 200 `{"status":"ok","db":"connected"}`; producción 200.
- Logs de arranque de staging: `Server running on port 8080 (production)` y **ningún**
  `[session-purge] Error during purge`. La purga corre una vez al arrancar (AC-37) y solo escribe en el log cuando
  borra algo o falla: su `DELETE` con los dos cortes `::timestamptz` corrió contra el Postgres real sin error (la tabla
  estaba vacía).

## 3. Comprobaciones contra el Postgres real — hechas (2026-11-19, OK de Hernán para los pasos 1 a 7)

**Mecánica** (plan §6, "Mecánica"): un script de Node con `fetch`, fuera del repo
(`scratchpad/t009-checks.mjs`). Cada cookie se guarda como texto al recibirla y viaja en `Cookie: token=<valor>`,
nunca en un archivo de cookies. Todo `POST`/`PATCH`/`DELETE` lleva `Origin: https://prestoteca-staging.up.railway.app`.
Las filas se eligen por `token_hash = '<SHA-256 hex calculado en la PC>'`: el valor de la cookie no viaja en el SQL
salvo en la prueba de "ninguna fila guarda el valor", que debe no encontrar nada. Límites: a lo sumo 4 pedidos de
`/api/auth` y 25 generales cada 61 s; un 429 corta la tanda. El SQL va por `railway ssh -s Postgres -e staging` a
`psql -v ON_ERROR_STOP=1`; un corte de la conexión SSH se reintenta (todas las sentencias son repetibles).

**Corridas:** la 1 se cortó en su primer SQL (`railway ssh` buscó el proyecto en la carpeta del script: arreglado con
`cwd` en el repo); la 2, por un 429 (arrancó sin esperar los 4 logins de la 1: ahora espera 61 s al empezar); la 3,
por un corte de SSH (`Connection timed out`: ahora reintenta). La 4 corrió entera. Las cuentas de las cuatro se
borraron al final (§5).

Cuentas X e Y `qa-sessions-{x,y}-mwnvzfv7@example.com`; sesiones A (X, "Recordarme", `Rg-y3C…`), B (X, corta),
R (registro de X), D (registro de Y, `BS_Vsj…`), C, E, F (X, cortas).

| Criterio | Qué se hizo | Resultado |
| --- | --- | --- |
| AC-24 | registro de X | 201; cookie sin `Max-Age` ni `Expires` ✅ |
| AC-21, AC-14 | login A con `remember: true` | 200; `Max-Age=604800`, `HttpOnly`, `SameSite=Lax`, `Secure`, `Path=/` ✅ |
| AC-22, AC-14 | login B sin "Recordarme" | 200; sin `Max-Age`/`Expires`, `HttpOnly`, `SameSite=Lax`, `Secure` ✅ |
| AC-35 | A y B | dos valores distintos de 43 caracteres base64url ✅ |
| AC-21 | `GET /api/me` con A | 200 y el **mismo** valor otra vez con `Max-Age=604800` ✅ |
| AC-22 | `GET /api/me` con B | 200, sin `Set-Cookie` ✅ |
| no-goals | columnas de `sessions` | solo `id,user_id,token_hash,remember,created_at,last_used_at` (ningún dato del dispositivo) ✅ |
| AC-35 | filas de X | 3 (R, A, B), cada `token_hash` de 64 hex en minúscula; **0** filas con el valor de una cookie; A y B se encuentran por su SHA-256 ✅ |
| AC-1 | A con `last_used_at` = hace 6 d 23 h | 200 ✅ |
| AC-2 | A con `last_used_at` = hace 7 d | 401 y la cookie se borra ✅ |
| AC-23 | B con `last_used_at` = hace 11 h 59 min | 200 ✅ |
| AC-23 | B con `last_used_at` = hace 12 h | 401 ✅ |
| AC-3 | A con `last_used_at` = hace 6 d → pedido | 200, y la fila queda con `last_used_at` de ahora (el plazo vuelve a empezar) ✅ |
| — | B con `last_used_at` = ahora | 200: un 401 por inactividad no borra la fila (la borra la purga) ✅ |
| AC-4 | logout de B | 204 y cookie borrada; la copia de B → 401 ✅ |
| AC-5 | A después del logout de B | 200 ✅ |
| AC-6 | `DELETE /api/me/other-sessions` desde A (con C y R abiertas) | 204; C → 401; R → 401; A → 200; X queda con **1** fila ✅ |
| AC-7 | D (cuenta Y) después | 200 ✅ |
| AC-15 | 5 pedidos simultáneos con A | 200 ×5; A sigue siendo **una** fila ✅ |
| AC-36 | pedido y logout de E lanzados juntos | pedido 200, logout 204; después E → 401 ×3; 0 filas de E (la renovación no la revivió) ✅ |
| AC-10 | cookie con forma de JWT viejo | 401 y cookie borrada ✅ |
| AC-8 | `PATCH /api/me/password` desde A (con F abierta) | 204; F → 401; A → 200; login con la contraseña vieja → 401 ✅ |
| AC-27 | la respuesta del cambio | A conserva el **mismo** valor, renovado con `Max-Age=604800` ✅ |

**Corrida 4: 41 comprobaciones, 41 OK.**

Lo que el panel de T008 dejó para la base real, ahora visto: el `INSERT … SELECT … FOR SHARE` del login corre (cada
login y registro creó su fila); los `::timestamptz` de `touchActive` y de la purga resuelven (los bordes de arriba y la
purga de §4); 5 pedidos simultáneos con la misma cookie dan 200. La recarga de la contraseña en READ COMMITTED después
de una espera no se puede forzar desde afuera sin dos transacciones coordinadas: queda probada por el texto de la SQL
(T003) y por el análisis de carreras del panel de corrección.

## 4. Smoke, purga y latencia (R3) — hechos

**Smoke:** `node server/scripts/smoke.mjs https://prestoteca-staging.up.railway.app` → **SMOKE OK**, exit 0
(registro, login sin `Origin` → 403, contraseña incorrecta → 401, logout, préstamos, borrado de cuenta con la cookie
borrada y la cuenta sin sesión después, re-registro del mismo email, limpieza de sus cuentas). Es la primera vez que
`deleteAllForUser` corre contra un Postgres real antes del merge.

**Purga (AC-37):** sesión G de X con "Recordarme" y `last_used_at` = hace 8 días (vencida por los dos plazos) →
`railway restart -e staging --service prestoteca --yes`. El comando no terminó en 3 min y lo cortó el `timeout`, pero
el reinicio se hizo: los logs muestran un segundo `Server running on port 8080 (production)` y
`[session-purge] Removed 1 expired session(s)`. En la base: G → 0 filas; A, en uso, sigue. El reinicio fue sobre el
mismo deploy (`2026-11-19 18:23 UTC`); producción siguió en `471165e`.

**Latencia (R3):** con el método de 5c (3 de calentamiento + 20 a `GET /api/loans?type=pedidos` con la cookie A):
20 × 200, **mediana 174 ms**, promedio 175, mínimo 171, máximo 200 (5c: 303 ms antes, 292 después). La comparación
con 5c no es limpia: allí se usó `curl` (probablemente una conexión TLS nueva por pedido) y acá `fetch` de Node, que
reutiliza la conexión. La comparación limpia es dentro de esta corrida: `/api/health` (consulta a la base, sin sesión)
mediana 170 ms contra `GET /api/me` (sesión renovada con un `UPDATE` en cada pedido) mediana 178 ms. **La escritura en
cada pedido no sube la latencia de forma medible:** la decisión abierta de R3 (renovar solo si el último uso tiene más
de 60 s) no se construye.

## 5. Limpieza — hecha

- Borrado desde la app (`DELETE /api/me/account`) de las 7 cuentas de prueba de las cuatro corridas (la X de la
  corrida 2, cuya cookie se perdió con el 429, con un login nuevo): 7 × 204.
- El script dio "FAIL" en 3 de esos borrados aunque fueron 204: las tres eran sesiones con "Recordarme", que reciben
  **dos** `Set-Cookie` (renovación del middleware y después el borrado), y el script miraba solo el primero. Comprobado
  con una cuenta más (`qa-sessions-z-…`, login con "Recordarme", borrado): `Set-Cookie 1: token=(valor);
  Max-Age=604800 …`, `Set-Cookie 2: token=(vacío); … Expires=Thu, 01 Jan 1970 …` (el navegador se queda con el
  último), y la misma cookie → 401 después. Es lo que fija `sessionWiring.test.ts` (AC-9, AC-33).
- Consultas de solo lectura al final: **0** cuentas activas `qa-sessions-*`; **0** sesiones de cuentas borradas
  (AC-33, incluidas las del smoke); **9** cuentas activas (las mismas del principio); **0** filas en `sessions`.
- Deploys al final: staging en el deploy de `railway up` (SUCCESS); producción en `471165e` (SUCCESS), sin cambios en
  todo T009.

## Veredicto (2026-11-19): PASS

Cada punto de la comprobación del plan §6 se hizo contra el Postgres real de staging y dio lo esperado. Hallazgos de
operación, sin efecto en el código: (1) `npx railway` en este repo corre el paquete de IaC, no la CLI; (2) `railway
ssh` corta la conexión a veces (`Connection timed out`) y hay que reintentar; (3) `railway restart` puede no terminar
aunque el reinicio se haga: se confirma por los logs; (4) listar las variables con `railway variables --json` queda
bloqueado por el sistema de permisos porque trae los valores; se comprueba dentro del contenedor.

## 6. Producción (T010) — hecha

- **005 antes del merge** (OK de Hernán): producción tenía `loans`, `tools`, `users` y no `sessions`; la migración
  corrió con `ON_ERROR_STOP=1 -1` (`CREATE TABLE`, `CREATE INDEX`, exit 0); después: 6 columnas `NOT NULL`,
  `PRIMARY KEY (id)`, `UNIQUE (token_hash)`, `FOREIGN KEY (user_id) REFERENCES users(id)` sin `ON DELETE`, índice
  `idx_sessions_user`, 0 filas.
- **Merge:** PR #51 squash → `main` en `9c89186`.
- **Deploys desde `main`:** producción `975632f8` SUCCESS y staging `c44fd3bc` SUCCESS; `GET /api/health` → 200 en los
  dos (`"db":"connected"`); log de arranque de producción sin errores.
- **Smoke en producción** (`node server/scripts/smoke.mjs https://prestoteca-production.up.railway.app`, corrida
  `mwod6y65`): **SMOKE OK**, todos los chequeos en OK — registro 201 con cookie `Secure` y `HttpOnly`, email repetido
  409, login sin `Origin` 403, contraseña mala y email desconocido con la misma respuesta 401, logout 204, login 200,
  herramienta y préstamo de punta a punta, préstamo ajeno igual a uno inexistente (404), borrado bloqueado con préstamo
  activo (409), borrado 204 con la cookie vaciada y 401 después, email reutilizable; las 3 cuentas del smoke borradas.
- **Solo lectura al final:** 1 cuenta activa (la cuenta fija de prueba), 0 cuentas `smoke-*` activas, 0 filas en
  `sessions`, 0 sesiones de cuentas borradas.

## Veredicto de producción (2026-11-19): PASS

El PR 1 corre en producción sobre la tabla `sessions`. Como estaba previsto (AC-10), las cookies JWT viejas dejaron
de valer y cada persona inicia sesión una vez. `JWT_SECRET` sigue en Railway hasta que el PR 2 lleve una semana
estable.
