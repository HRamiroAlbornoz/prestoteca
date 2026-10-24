---
author: HRamiroAlbornoz
branch: fix/railway-deploy
status: done
---
# Arreglar el deploy de Prestoteca en Railway

## Intent

Desde el 12 de octubre ningún deploy llega a producción. Producción sigue sana (`/api/health` → 200,
db connected), pero corre el commit `844b15a`, así que los arreglos de `main` (por ejemplo
`GET /tools/:id` público) no están en línea. El objetivo es que un push a `main` vuelva a deployar
solo, y probar cada cambio en un entorno `staging` antes de tocar producción.

Causas encontradas (diagnóstico del 2026-10-20):

1. El servicio `prestoteca` sigue la rama `prestoteca-mvp`, que ya no existe en GitHub (solo `main`).
2. El `package-lock.json` de la raíz está vacío aunque `package.json` declara workspaces; `railway up`
   lo sube y npm se rompe con `Cannot read properties of null (reading 'edgesOut')`.
3. `NODE_ENV=production` en las variables del servicio llega al build y npm omite las devDependencies
   (`sh: 1: tsc: not found`). Los 19 commits `fix:` entre `8ac1ead` y `55fa9d3` fueron rodeos a esto.
4. Falta `CORS_ORIGIN`: sin ella, todo POST/PATCH/DELETE en producción responde 403.

## Scope

**Entra:**
- Un solo lockfile en la raíz (workspaces), sin los de `client/` y `server/`.
- Instalar devDependencies en el build con `RAILPACK_NODE_NPM_INSTALL="npm ci --include=dev"`,
  manteniendo `NODE_ENV=production` en runtime (lo usa la cookie `Secure`).
- Devolver `typescript` y `vite` a devDependencies en `client/package.json`.
- Que el build compile `client` una sola vez (hoy el script raíz y el de `server` lo compilan dos veces).
- Entorno `staging` en Railway con su propia base, siguiendo `fix/railway-deploy`.
- Producción siguiendo `main`, con `CORS_ORIGIN` configurada.
- Limpiar las variables ajenas del servicio Postgres (`JWT_SECRET`, `NODE_ENV`, `DATABASE_URL`).

**No entra:**
- Corregir las categorías de la base de producción (`server/scripts/fix-categories.sql`): va aparte,
  con backup previo.
- Los 7 tests que ya fallaban antes de estos cambios.
- Un script de migraciones automático (las migraciones de staging se aplican a mano, una vez).

## Checklist

- [x] T1 — Worktree `.worktrees/fix-railway-deploy` con la rama `fix/railway-deploy` desde `main`.
  Prueba: `git worktree list` muestra la rama.
- [x] T2 — Lockfile único en la raíz. Prueba: `npm ci` en una copia limpia termina sin error y el lock
  contiene `client` y `server`.
- [x] T3 — `typescript` y `vite` de vuelta en devDependencies; `client` se compila una sola vez.
  Prueba: `npm ci --include=dev && npm run build` con `NODE_ENV=production` termina sin error.
- [x] T4 — Tests sin regresiones. Prueba: los mismos resultados que antes (server 202/205,
  client 144/148), ningún test nuevo en rojo.
- [x] T5 — Rama publicada en GitHub. Prueba: `git ls-remote --heads origin fix/railway-deploy`.
- [x] T6 — Entorno `staging` en Railway: base propia con las 3 migraciones aplicadas, servicio que sigue
  `fix/railway-deploy`, variables `RAILPACK_NODE_NPM_INSTALL` y `CORS_ORIGIN`. Prueba: el deploy de
  staging queda en `SUCCESS`.
- [x] T7 — Smoke test en staging: health, registro, login, publicar, pedir, aceptar, entregar,
  devolver. Prueba: cada paso responde el código esperado.
- [x] T8 — PR mergeado a `main`. Prueba: el commit está en `origin/main`.
- [x] T9 — Producción sigue `main`, con `RAILPACK_NODE_NPM_INSTALL` y `CORS_ORIGIN`.
  Prueba: deploy de producción en `SUCCESS` con el commit del merge.
  **No hecho (decidido):** quitar las variables ajenas del Postgres de producción. Obliga a
  reiniciar la base; queda para un momento de poco uso.
- [x] T10 — Smoke test en producción, incluido un POST con `Origin` correcto (antes 403).
  Prueba: cada paso responde el código esperado.

## Evidence

- **T1** (2026-10-20): `git worktree list` →
  `E:/Trabajo/prestoteca/.worktrees/fix-railway-deploy 55fa9d3 [fix/railway-deploy]`.
- **T2** (2026-10-20): `npm install` en la raíz del worktree (npm 11.19.1, Node 24.22.0) →
  `added 419 packages`. Lock: `lockfileVersion 3`, contiene `client` y `server`, 535 entradas.
  Borrados `client/package-lock.json` y `server/package-lock.json`. `/node_modules/` agregado a
  `.gitignore` (antes solo se ignoraban los de `client/` y `server/`).
- **T3** (2026-10-20): copia limpia en el scratchpad, `NODE_ENV=production npm ci --include=dev` +
  `npm run build` → `✓ built in 470ms` (Vite) y `tsc -b` sin errores; existen
  `server/client-dist/index.html` y `server/dist/index.js`. `typescript` y `vite` en devDependencies;
  `server` build = `tsc -b`; build raíz = `npm run build --workspace client && npm run build --workspace server`.
- **T4** (2026-10-20): server `Tests 3 failed | 202 passed (205)`; client `Tests 4 failed | 144 passed (148)`.
  Idéntico a la línea base de T045: los 7 rojos son los mismos (`loansRoutes.test.ts` POST y
  `requestLoan.test.tsx`), fuera de alcance. `oxlint` → exit 0 (solo warnings, 0 errores).
- Nota fuera de alcance: `npm install` reporta 10 vulnerabilidades (1 moderate, 3 high, 6 critical).
  Revisarlas en una feature aparte con `npm audit`.

- **T5** (2026-10-21): commit `f476aa4`; `git ls-remote --heads origin fix/railway-deploy` →
  `f476aa42d583df4c7b4508291454702ddd27f05b refs/heads/fix/railway-deploy`.

- **T6 en curso** (2026-10-21): Hernán creó `staging` (id `425478eb-…`) duplicando `production`.
  Primer deploy `31aea282` del commit `f476aa4` → `BUILDING → DEPLOYING → SUCCESS` (el primer build
  exitoso desde el 12/10). `https://prestoteca-staging.up.railway.app/api/health` →
  `200 {"status":"ok","db":"connected"}`. Base separada y vacía: `GET /api/tools?page=1` →
  `relation "tools" does not exist` (producción, en cambio, devuelve sus herramientas).
  `railway domain` respondió `ServiceInstance not found`, pero el dominio ya existe
  (`RAILWAY_PUBLIC_DOMAIN = prestoteca-staging.up.railway.app`).

### Hallazgos durante T6

- **Producción corre con `NODE_ENV=development`** (puesto por el commit `97af791` para esquivar el
  build). Efecto: la cookie de sesión sale **sin `Secure`** (`authRoutes.ts:54` y `:88`). Ahora que
  `RAILPACK_NODE_NPM_INSTALL` instala las devDependencies, se vuelve a `production`. Entra en alcance.
- **Corrección al diagnóstico:** `DATABASE_URL` en el servicio Postgres es una variable propia de la
  plantilla de Railway, no ajena. Las ajenas son solo `JWT_SECRET` y `NODE_ENV`.
- **Fuera de alcance (feature aparte):** un error de base de datos llega al cliente con su texto
  (`relation "tools" does not exist`, con 400). El brief pide mensajes genéricos y que el detalle
  quede en los logs.
- **Fuera de alcance (feature aparte):** `anonymizeByBorrower` y `anonymizeByOwner`
  (`loanRepo.ts:128` y `:135`) ponen `NULL` en `borrower_id` y `owner_id`, pero la migración 003 los
  declara `NOT NULL`. Con el esquema de las migraciones, borrar una cuenta que tiene préstamos fallaría.
  Hay que ver si la base de producción tiene otro esquema.

- **T6 cerrado** (2026-10-21, Claude con autorización de Hernán, solo en `staging`):
  - Variables de la app: `NODE_ENV=production`, `CORS_ORIGIN=https://prestoteca-staging.up.railway.app`,
    `JWT_SECRET` nuevo de 64 caracteres (`openssl rand -hex 32` por `--stdin`, nunca impreso).
    Postgres de staging sin `JWT_SECRET` ni `NODE_ENV` (verificado leyendo las variables).
  - Redeploy `b58b9839` → `SUCCESS` **con `NODE_ENV=production`**: el build ya no depende de
    `NODE_ENV=development` gracias a `RAILPACK_NODE_NPM_INSTALL`.
  - Migraciones por `railway ssh` dentro del contenedor (Node v20.20.2, `/app`): `ok 001_create_users.sql`,
    `ok 002_create_tools.sql`, `ok 003_create_loans.sql`; `tables: loans,tools,users`.
  - `GET /api/tools?page=1` → `200 {"items":[],"total":0,"page":1,"pages":1}`.
  - `POST /api/tools` sin `Origin` → `403 Invalid origin`; con el `Origin` de staging → `401 Authentication required`.

### Hallazgos durante T6 (segunda parte, fuera de alcance)

- **`/api/auth/*` no pasa por el chequeo de `Origin`**: `routes.ts:34` monta `authRoutes` antes de
  `app.use('/api', originChecker)` (`routes.ts:47`). Un `POST /api/auth/login` sin `Origin` responde
  404 en lugar de 403. El brief pide el chequeo en todo POST, PATCH y DELETE.
- **Enumeración de usuarios en el login**: un email inexistente devuelve `404 User not found`, y uno
  existente con la contraseña mal devuelve 401. Así se puede averiguar qué emails están registrados.
  Lo correcto es un único `401` genérico para los dos casos.

- **T7** (2026-10-21): script de smoke test (en el scratchpad de la sesión, no en el repo) contra
  `https://prestoteca-staging.up.railway.app` con dos usuarios nuevos → **19/19 chequeos OK, `SMOKE OK`**:
  health 200 · registro 201 ×2 · cookie con `Secure` y `HttpOnly` (confirma `NODE_ENV=production`) ·
  logout 204 · login 200 · publicar 201 · detalle público 200 · listado 200 (total=1) · el dueño no
  puede pedir lo propio (400) · pedir 201 en `pendiente` · `aceptado`/`entregado`/`devuelto` 200 ·
  `devuelto→entregado` 409 · detalle del préstamo para el solicitante 200.

- **T8** (2026-10-21): PR #8 `MERGED`, squash commit `c070502` en `origin/main`.
  `git diff f476aa4 origin/main` vacío: `main` tiene exactamente el código probado en staging.
  Rama remota `fix/railway-deploy` borrada; el worktree local sigue (se limpia después).

- **T9** (2026-10-21, Claude con autorización de Hernán):
  - Producción: `RAILPACK_NODE_NPM_INSTALL=npm ci --include=dev`, `NODE_ENV=production` (antes
    `development`) y `CORS_ORIGIN=https://prestoteca-production.up.railway.app`, con `--skip-deploys`.
    Sin cambios staged y sin deploy disparado (verificado).
  - `railway service source connect --branch main` en producción y en staging.
  - Producción: deploy `269f1751` de `main` `c070502` → `SUCCESS`. El `084e6956` quedó `REMOVED`
    porque lo reemplazó el `269f1751`, del mismo commit. Staging: `64cbdc36` de `main` → `SUCCESS`.
- **T10** (2026-10-21): en `https://prestoteca-production.up.railway.app`: health
  `200 {"status":"ok","db":"connected"}`, home 200. Smoke test → **19/19 OK, `SMOKE OK`**, con la cookie
  `Secure` y `HttpOnly`. `POST /api/tools` con `Origin` → `401 Authentication required` (antes 403 por
  la falta de `CORS_ORIGIN`). Datos de prueba que quedaron en la base de producción: usuarios
  `owner-mvhk269a@example.com` (1 herramienta, 1 préstamo devuelto) y `borrower-mvhk269a@example.com`.
- Rollback disponible si hiciera falta: el deploy `a7c79c4b` (12/10).

## Next

**Cerrada.** Mergeada en `main` con el PR #8 (`c070502`, 2026-10-21); la limpieza local se hizo con los
PR #9 y #10. Los 4 hallazgos de seguridad y calidad de arriba se resolvieron en
`security-hardening.md` (PR #11). Marcada como `done` a mano el 2026-10-24: el hook post-merge de rsc no
corre cuando el merge se hace en GitHub con `gh pr merge`.

Siguen pendientes, para otras features: borrar `JWT_SECRET` y `NODE_ENV` del Postgres de producción
(reinicia la base unos segundos) y corregir las categorías con backup previo (`fix-categories.sql`).
