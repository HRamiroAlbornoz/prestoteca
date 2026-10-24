---
author: HRamiroAlbornoz
branch: feat/db-backups
status: in-progress
---
# Backups automáticos de la base de producción

## Intent

Hoy no existe ningún backup automático del Postgres de producción. Si la base se rompe o se borra,
los datos no se pueden recuperar. La única copia es un `pg_dump` manual del 2026-10-24 en
`E:\Trabajo\prestoteca-backups\` (fuera del repo). Los backups propios de Railway solo existen en el
plan Pro, y Hernán está en Hobby.

El objetivo es tener **una copia diaria, guardando las últimas 14**, sin exponer la base a internet
y sin costo apreciable (unos $0.02 por mes, que entran en los $5 incluidos del plan Hobby).

Decisiones (2026-10-24, con Hernán):
- **Destino:** un bucket de Railway (S3 compatible, privado, cifrado en reposo). Se descartó
  GitHub Actions porque el repo es público, así que los archivos que guardan las Actions quedarían a
  la vista, y porque habría que abrir la base a internet con un proxy TCP. Se descartó Cloudflare R2
  para no crear otra cuenta. Riesgo aceptado: si se pierde la cuenta de Railway, se pierden también las copias.
- **Frecuencia:** diaria a las 06:00 UTC (03:00 en Argentina), cron `0 6 * * *`. Se conservan 14.
- **Cómo:** un servicio cron `db-backup` en el mismo proyecto. Corre `pg_dump` por la red privada,
  comprueba el archivo, lo sube al bucket, borra las copias que sobran y termina.

Datos verificados en la documentación de Railway (2026-10-24):
- Los buckets **no** soportan lifecycle rules (reglas de expiración). Por eso el borrado de las copias viejas lo hace el script.
- Los buckets solo se alcanzan por la red pública. Las subidas cuentan como egress del servicio:
  $0.05/GB, despreciable para archivos de unos pocos KB.
- El cron de Railway corre en UTC, tiene una frecuencia mínima de 5 minutos y se salta una corrida
  si la anterior todavía no terminó. El proceso tiene que terminar solo.
- Cada entorno (staging y production) tiene su propio bucket, con credenciales separadas.
- La base de producción es **PostgreSQL 18.6**, según la cabecera del dump manual. Por eso `pg_dump` tiene que ser
  de la versión 18: un `pg_dump` más viejo se niega a volcar un servidor más nuevo.

## Scope

**Entra:**
- Carpeta `backup/` en la raíz del repo, independiente de los workspaces `client` y `server`, con:
  - Un script Node en ESM que hace `pg_dump -Fc` a un archivo temporal, lo valida con
    `pg_restore --list`, lo sube y aplica la retención.
  - Funciones puras testeadas con Vitest: el nombre de cada copia y la elección de cuáles borrar.
  - El flujo completo testeado con dependencias falsas. Casos borde: si el dump o la subida fallan,
    no se borra nada. El script solo borra archivos con su propio formato de nombre. Con 14 copias o
    menos, no se borra nada.
  - Un modo `restore-check`, solo para staging: restaura la copia más reciente en una base temporal,
    compara la cantidad de filas con la base original y borra la base temporal.
  - `Dockerfile` basado en `postgres:18-alpine` más Node, y un `README.md` con el procedimiento de
    restauración. El cron y la política de reinicio `NEVER` se configuran en el servicio, porque Railway
    dejó obsoleto `railway.json` (ver el hallazgo urgente).
- Railway **staging**: bucket y servicio `db-backup` desplegados con `railway up`, sin conectar el
  repo, porque el source de un servicio es el mismo para todos los entornos. Las variables van por
  referencia (`${{Postgres.DATABASE_URL}}` y las credenciales del bucket).
- Railway **production**: bucket `backups-production` y servicio `db-backup` conectado a `main`, con root
  directory `/backup` y watch paths `/backup/**`.

**No entra:**
- Alertas cuando falla un backup. Queda para la feature de monitoreo, que tiene que avisar si un día no se generó la copia.
- Una copia fuera de Railway (R2 u otro proveedor). Se puede sumar más adelante.
- Cifrar las copias del lado del cliente (el bucket ya cifra en reposo y es privado).
- El resto del backlog: herramientas pausadas, tests con fechas fijas, `npm audit`, mensajes en
  inglés y cuentas de prueba.

## Checklist

- [x] T1 — Rama `feat/db-backups` desde `main`, creada por Hernán. Prueba: `git branch --show-current`.
- [x] T2 — Lógica pura (nombre de la copia y retención) con tests en rojo y después en verde.
  Prueba: salida de `npx vitest run` en `backup/`.
- [x] T3 — Flujo completo con dependencias falsas. Casos: camino feliz; si el dump falla, no se sube
  ni se borra nada; si la subida falla, no se borra nada; solo se borran archivos con el formato
  propio. Prueba: salida de Vitest.
- [x] T4 — `Dockerfile` y `README.md` con la restauración. Sin `railway.json`: el cron (`0 6 * * *`),
  la política de reinicio `Never` y el root directory van en la configuración del servicio.
  Prueba: el build de staging queda en `SUCCESS` y el log muestra `pg_dump (PostgreSQL) 18.x`.
- [x] T5 — Staging: bucket, servicio y variables por referencia. Una corrida manual sube la copia.
  Prueba: el log de la corrida y el archivo listado en el bucket.
- [x] T6 — Retención en staging con `BACKUP_KEEP=2` y 3 corridas: quedan solo 2 copias. Después se
  vuelve a 14. Prueba: listado del bucket.
- [x] T7 — Restauración en staging (`restore-check`): la cantidad de filas de `users`, `tools` y
  `loans` coincide, y la base temporal se borra. Prueba: log de la corrida.
- [x] T8 — Tests, lint y build sin regresiones en `client` y `server`. Los mismos rojos que antes:
  los 4 de `requestLoan.test.tsx`. Prueba: salida de cada comando.
- [x] T9 — PR mergeado a `main`. Prueba: el commit está en `origin/main`.
- [x] T10 — Production: bucket y servicio conectados a `main`. Una corrida manual sube la copia, que
  pasa `pg_restore --list`. El próximo cron queda programado a las 06:00 UTC. Prueba: log, listado
  del bucket y `railway status`.
- [ ] T11 — La primera corrida **programada** en producción (2026-10-25 06:00 UTC) termina con
  `backup finished`. Hasta hoy, todas las corridas se lanzaron a mano. Prueba: `railway cron list` y el
  log de la corrida.

## Evidence

- **T1** (2026-10-24): Hernán corrió `git switch -c feat/db-backups` →
  `Switched to a new branch 'feat/db-backups'`.
- **Dependencias** (2026-10-24, instaladas por Hernán en `backup/`): `@aws-sdk/client-s3 ^3.1156.0`,
  `vitest ^3.2.7` (dev). El `package-lock.json` de la raíz no cambió: `git status --short` → solo `?? backup/`.
  `npm audit --omit=dev` → `found 0 vulnerabilities`. `npm audit` completo → 3 (1 moderate, 2 critical),
  todas en `vitest` 3 (`@vitest/mocker`, `tinypool`), solo de desarrollo. Son las mismas que tiene `server` y
  se resuelven con el punto 4 del backlog (`npm audit`).
- **T2 + T3 en rojo** (2026-10-24): `npx vitest run` → `Test Files 4 failed (4)`, `no tests`
  (`Cannot find module '../src/backupKey.mjs'`, igual para los otros módulos).
- **T2 + T3 en verde** (2026-10-24): `npx vitest run` → `Test Files 4 passed (4)`, `Tests 35 passed (35)`.
  `oxlint backup/src backup/tests` → exit 0 (después de quitar dos variables sin usar en
  `config.test.mjs`). `node --check` OK en los 8 archivos de `src/`.

- **T4** (2026-10-24): `railway up ./backup --path-as-root -s db-backup -e staging` → deploy `cefd9f48`
  `SUCCESS`. Build con el `Dockerfile` (`postgres:18-alpine`, `nodejs 24.22.1`, `npm ci --omit=dev` →
  `found 0 vulnerabilities`). Log de la primera corrida: `"pgDump":"pg_dump (PostgreSQL) 18.6"`.
- **T5** (2026-10-24, Claude con autorización de Hernán, solo en `staging`):
  - Bucket `backups` (región `iad`, id `5d82b2c2-…`). Servicio `db-backup` (id `604a135f-…`), creado
    solo en staging (`scope: specific`), sin repo conectado.
  - Variables por referencia (`${{Postgres.DATABASE_URL}}` y `${{backups.*}}`): las 6 resuelven. Se
    comprobó el largo de cada una sin imprimir su valor. `DATABASE_URL` apunta a
    `postgres.railway.internal` (red privada) y el endpoint es `t3.storageapi.dev`.
  - Cron `0 6 * * *`, restart policy `NEVER`, start command `node src/main.mjs`.
  - `railway cron run` → log `backup finished` con `postgres/prestoteca-2026-10-24T21-17-15Z.dump`.
    El bucket, listado desde afuera con `railway run` y un script del scratchpad, muestra
    `objects=1`, `9768 bytes`.
- **T6** (2026-10-24): con `BACKUP_KEEP=2`, después de 4 corridas: la de 21:32:20 borró `…21-17-15Z`,
  la de 21:32:33 borró `…21-24-35Z`. Listado del bucket → `objects=2` (`…21-32-20Z` y `…21-32-33Z`).
  Después se volvió a `BACKUP_KEEP=14`.
- **T7** (2026-10-24): start command `node src/restoreCheck.mjs` y una corrida → `restoring backup`
  `…21-32-33Z` en `restore_check`; `source {"users":10,"tools":3,"loans":3}` = `restored` igual,
  `matches: true`; `restore check passed`; `scratch database dropped`.
- **Vuelta al modo backup** (2026-10-24): start command `node src/main.mjs`, deploy nuevo `ed507184`
  `SUCCESS` y una corrida → `starting backup` con `keep 14`, sube `…21-35-11Z`, `deleted []`.

- **T8** (2026-10-24): server `Test Files 26 passed (26)`, `Tests 233 passed (233)`. Client
  `Tests 4 failed | 144 passed (148)`: los 4 rojos son los de siempre (`requestLoan.test.tsx`, punto 3 del backlog).
  `oxlint` del client → exit 0. `npm run build` en la raíz → `tsc -b` sin errores. `git grep` no encontró
  credenciales en el repo: las variables están en Railway como referencias.
- **Nota de git** (2026-10-24): el hook de RSC hizo un commit automático de esta ficha **en `main` local**
  (`664ef2b 📝 docs(auto)`, 17:58) antes de que se creara la rama. `main` local quedó 1 commit por delante de
  `origin/main`, sin push. La rama lo incluye. Después del merge, `main` local se alinea con `origin/main`.

- **Verificación** (2026-10-24): la primera pasada dio FAIL porque la cobertura no se había medido
  (`02-DOCS/wiki/sdd/verifications/db-backups-2026-10-24.md`). Medida: 44 %. Se agregaron tests para
  `storage`, `postgres`, `runRestoreCheck` y `log`, y un umbral de 80 % en `backup/vitest.config.mjs`. Resultado:
  `61 passed`, líneas **82,68 %**. El umbral falla a 90 % (exit 1) y pasa a 80 %. Staging se volvió a probar con
  el código nuevo: backup OK, `restore check passed` y backup OK otra vez. La segunda pasada dio
  **PASS para el alcance de la tarea** (`…/db-backups-2026-10-24-2.md`).

- **T9** (2026-10-24): PR #13 → `gh pr merge 13 --squash --delete-branch` → `Squashed and merged`,
  commit `8d2281d` en `origin/main`. El `main` local había divergido por el commit automático `664ef2b`.
  Se comprobó que `git log origin/main..main` mostraba solo ese commit y que su contenido estaba dentro de
  `8d2281d`. Después: `git reset --hard origin/main` → `## main...origin/main`.
- **T10** (2026-10-24, Claude con autorización de Hernán):
  - Todo se preparó como un único paquete *staged* en production y se revisó con `get-staged-changes`:
    `destructive: false`, solo dos creaciones (servicio `db-backup` y bucket). La app y el Postgres no se tocaron.
    Se aplicó con `accept-deploy`.
  - Bucket: el nombre de un bucket vale para todo el proyecto y `backups` ya lo usaba staging, así que la
    herramienta generó `versatile-suitcase-gfIm`. Se renombró a **`backups-production`** (id `4b7beb8d-…`, `iad`)
    antes de aplicar, y las variables se apuntaron a `${{backups-production.*}}`.
  - Source: repo `HRamiroAlbornoz/prestoteca`, rama `main`, root `/backup`, watch `/backup/**`. Se preparó
    *staged* con `environmentId`, así que el `db-backup` de staging **quedó sin repo** (sigue con `railway up`).
  - Deploy `1eb9e567` `SUCCESS`. Las 7 variables resuelven (`DATABASE_URL` → `postgres.railway.internal`).
    Buckets distintos: staging `backups-hlpu…`, production `backups-production-mttc…`.
  - Corrida manual → `starting backup` (`pg_dump 18.6`, `keep 14`) → `backup uploaded` → `backup finished`
    con `postgres/prestoteca-2026-10-24T22-00-46Z.dump`. `verifyDump` (`pg_restore --list`) corre antes de
    subir, así que la copia pasó esa validación. El bucket, listado desde afuera, muestra `objects=1`, `11303 bytes`.
  - `railway status` → `db-backup: ● Online · 0 6 * * * · next run in 7 hours`. App:
    `/api/health` → 200.

### Aprendido en staging (está en el README)

- **Un deploy no ejecuta el cron.** Hace falta `railway cron run` (o esperar al horario).
- **`redeploy` reutiliza la configuración del deploy anterior**, incluido el start command. Para que un
  cambio de configuración se aplique hace falta un deploy nuevo (`railway up` o cambiar una variable).
- `railway cron list` muestra las corridas terminadas con el estado `EXITED`. El resultado real
  (éxito o error) está en el log de cada corrida.

### Hallazgo fuera de alcance (urgente)

- **Railway deja de leer `railway.json` el 2026-12-01** (Config as Code quedó obsoleto, según
  docs.railway.com/config-as-code, leído el 2026-10-24). El servicio de la app usa el `railway.json` de la raíz
  para `startCommand`, `healthcheckPath` y la política de reinicio. Hay que migrar a Infrastructure as Code
  (`.railway/railway.ts`, `railway config migrate`) **antes del 2026-12-01**. Ojo: `.gitignore` hoy ignora
  `.railway/` como "Railway local link state", y eso choca con IaC. Por esto mismo, `db-backup` no tiene `railway.json`.

## Next

T11: después del 2026-10-25 06:00 UTC, revisar `railway cron list -s db-backup -e production` y el log de esa
corrida. Si dice `backup finished`, la feature queda `done`. Siguiente en el backlog: migrar `railway.json` a
IaC antes del 2026-12-01 (urgente) y después el punto 2 (herramientas pausadas).
