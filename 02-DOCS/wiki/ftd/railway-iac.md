---
author: HRamiroAlbornoz
branch: chore/railway-iac
status: done
---
# Migrar la configuración de la app de `railway.json` a IaC

## Intent

Railway deja de leer `railway.json` el **2026-12-01**. Ese día Config as Code queda apagado para siempre.
Hoy el servicio `prestoteca` (la app) saca su configuración de deploy **solamente** de ese archivo:

```json
"startCommand": "cd server && npm start",
"healthcheckPath": "/api/health",
"healthcheckTimeout": 300,
"restartPolicyType": "ON_FAILURE",
"restartPolicyMaxRetries": 10
```

Si no se migra, el primer deploy después del 1 de diciembre arranca sin comando de inicio y sin health check.
Lo más probable es que la app no levante. Y si levanta mal, Railway no se da cuenta.

El objetivo es pasar esa configuración a Infrastructure as Code (`.railway/railway.ts`) **sin cambiar el
comportamiento** de la app en staging ni en production.

Datos verificados (2026-11-02):
- **El dashboard no tiene nada de esa configuración.** `get-service-config` de `prestoteca`, en staging y en
  production, muestra solo `builder: RAILPACK`, las réplicas y el dominio. No hay `startCommand`, ni
  `healthcheckPath`, ni restart policy.
- **El deploy sí usa `railway.json`.** El build del deploy `0c3d0df1` (production, 2026-11-02 18:46 UTC) muestra
  `Custom start command detected` y `Deploy $ cd server && npm start`.
- **`railway config migrate status` engaña.** Dice `No services in production read Config as Code`, pero el
  punto anterior prueba que sí lo leen. Por eso, al final, la prueba no va a ser ese comando: va a ser el log del build.
- **La política de reinicio no hace falta migrarla.** La referencia de IaC no tiene un campo para ella, y el
  default de Railway ya es `On Failure` con 10 reintentos (docs.railway.com/deployments/restart-policy). Es el mismo valor que tiene hoy.
- **Railway no lee `.railway/` cuando deploya.** IaC no se aplica solo: lo aplica la CLI con
  `railway config plan` (muestra qué cambiaría) y `railway config apply` (lo aplica), entorno por entorno.
- **Un archivo IaC de proyecto entero borra lo que no nombra.** Para evitarlo, el archivo usa un
  *partial* (`export const partial = "prestoteca"`). Con un partial, el archivo solo administra el servicio
  `prestoteca`. No puede tocar `Postgres`, `db-backup` ni los buckets.
- Vista previa generada con `railway config migrate --show --service prestoteca --variables=unmanaged`
  (solo lectura, no escribe nada). `start`, `healthcheck` y `healthcheckTimeout` coinciden con `railway.json`,
  y con `variables: { managed: false }` las variables quedan fuera de IaC.

## Scope

**Entra:**
- `.railway/railway.ts` con el partial `prestoteca`, generado por `railway config migrate --apply`.
- `railway` como devDependency en la raíz, porque la CLI la necesita para evaluar el archivo TypeScript.
- `.gitignore`: sacar la línea `.railway/`. Ignoraba un "estado local de Railway" que la CLI 5.x no guarda
  ahí (el link vive en la configuración del usuario), y hoy chocaría con IaC.
- `railway config plan` y `apply` en **staging** primero y en **production** después.
- Borrar `railway.json` del repo.

**No entra:**
- `Postgres`, `db-backup` y los buckets: siguen administrados desde el dashboard.
- Las variables de entorno: quedan como están, fuera de IaC.
- El workflow de GitHub Actions que aplica IaC solo en cada PR. Se puede sumar más adelante.
- El resto del backlog.

## Checklist

- [x] T1 — Rama `chore/railway-iac` desde `main` (`a49c888`), creada por Hernán. Prueba: salida de `git switch -c`.
- [x] T2 — `npm install -D railway` en la raíz, corrido por Hernán. Prueba: `package.json` y `npm audit`.
- [x] T3 — `.railway/railway.ts` generado y `.gitignore` corregido. Prueba: el archivo, y `git status`
  muestra `.railway/` como archivo nuevo.
- [x] T4 — Staging: `railway config plan` muestra solo cambios en `start`, `healthcheck` y
  `healthcheckTimeout` de `prestoteca`, sin borrar nada. Después `apply`. Prueba: salida del plan y
  `get-service-config` con los tres valores.
- [x] T5 — Production: lo mismo que T4. Prueba: salida del plan y `get-service-config`.
- [x] T6 — `railway.json` borrado. Tests, lint y build sin regresiones. Prueba: salida de cada comando.
- [x] T7 — PR mergeado. El deploy de staging y el de production arrancan con `cd server && npm start`, pasan el
  health check y `/api/health` responde 200. Prueba: log del build y respuesta HTTP.

## Evidence

- **T1** (2026-11-02): Hernán corrió `git switch -c chore/railway-iac` → `Switched to a new branch 'chore/railway-iac'`.
- **T2** (2026-11-02): Hernán corrió `npm install -D railway`.
  - `package.json` → `devDependencies: { "railway": "^3.16.0" }`. El lockfile suma solo 40 líneas: `railway`,
    `graphql` y `@graphql-typed-document-node/core`, todas `dev: true`. El paquete lo publica
    `railwayapp/railway-ts-sdk`.
  - `npm audit` → 15 vulnerabilidades. Ninguna viene de `railway`: `npm ls` muestra que `tar`, `minimist`,
    `body-parser`, `zod` y `pg-migrate` cuelgan de `server` (`bcrypt`, `express`, `pg-migrate`, `zod`). Antes eran
    10, así que desde el 2026-10-24 se publicaron advertencias nuevas sobre esas mismas dependencias. Va al punto 4
    del backlog (`npm audit`).
  - `railway` pide `node >= 22`. Los builds de Railway usan Node 20.20.2, porque `engines` dice `>= 20`. Si el
    build instala las devDependencies, npm solo avisa (`EBADENGINE`): no falla. Ojo aparte: Node 20 ya no tiene soporte.
- **T3** (2026-11-02): `railway config migrate --apply --service prestoteca --variables=unmanaged` →
  `Wrote .railway\railway.ts`, `partial = "prestoteca"`, con `start`, `healthcheck` y `healthcheckTimeout: 300`.
  Ahora el comando sí dice `Found 1 service managed by Config as Code: railway.json → prestoteca`. `.gitignore`: la
  línea `.railway/` se reemplazó por un comentario. `git status` → `?? .railway/`.
  - **Trampa en Windows:** la primera vez, `plan` falló con `requires Railway CLI 5.42.1 or newer`, aunque la CLI es
    la 5.71.0. El SDK pregunta la versión ejecutando el programa que figura en la variable de entorno `_`, y en la
    terminal de Claude Code esa variable apunta a `claude`. Solución: `$env:_ = 'railway'` antes del comando.
- **T4/T5, solo el plan** (2026-11-02, solo lectura): `railway config plan --environment staging` y
  `--environment production` dan lo mismo: `Plan: 0 to add, 1 to change, 0 to destroy`, y solo
  `~ Update prestoteca`, con `healthcheckPath (null → "/api/health")`, `healthcheckTimeout (null → 300)` y
  `startCommand (null → "cd server && npm start")`. `variables: unmanaged · 12 on Railway not managed`.
- **T4** (2026-11-02, Claude con autorización de Hernán): `railway config apply --environment staging --yes` →
  `Changes (1) ✓ service.5bc08094-…`. `describe-service` en staging → `startCommand: "cd server && npm start"`,
  `healthcheckPath: "/api/health"`, `healthcheckTimeout: 300`, `stagedChanges: []`. El apply disparó el deploy
  `86ed32eb` → `SUCCESS` en unos 2 minutos. Build: `Deploy $ cd server && npm start`. Runtime:
  `Server running on port 8080 (production)`. `GET /api/health` → `200 {"status":"ok","db":"connected"}`.
  Ese build todavía tenía `railway.json` en `main`, así que la prueba de que alcanza solo con el dashboard queda para T7.
  Los avisos `EBADENGINE` del build ya estaban antes (`@asamuzakjp/css-color` pide Node 22+) y no vienen de esta feature.
- **T5** (2026-11-02, Claude con autorización de Hernán): se repitió el plan justo antes (`0 to add, 1 to change,
  0 to destroy`) y después se corrió `railway config apply --environment production --yes` → `Changes (1) ✓`.
  `get-service-config` en production → `startCommand`, `healthcheckPath` y `healthcheckTimeout: 300` cargados,
  `staged: null`. Deploy `129dcdcb` → `SUCCESS` en unos 70 s. Build: `Deploy $ cd server && npm start`. Runtime:
  `node dist/index.js`. `GET https://prestoteca-production.up.railway.app/api/health` →
  `200 {"status":"ok","db":"connected"}`. `railway status`: `Postgres ● Online` y `db-backup ● Completed · 0 6 * * *`,
  sin tocar.
- **T6** (2026-11-02): `railway.json` borrado (`git status` → `D railway.json`). Fuera de `02-DOCS`, la única
  mención es `backup/README.md:15`, que dice que `db-backup` no lo usa, y sigue siendo cierto. Server:
  `Test Files 26 passed (26)`, `Tests 233 passed (233)`. Client: `Tests 4 failed | 144 passed (148)`. Son los 4
  rojos de siempre en `requestLoan.test.tsx` (punto 3 del backlog). `npm run lint --workspace client` → exit 0, solo
  los warnings que ya estaban. `npm run build` en la raíz → exit 0.
- **Ojo con `cutover`:** `railway config migrate cutover` "limpia el Config File path de cada servicio **y lo
  redeploya**", y no tiene la opción `--environment`. No se corrió. Hay que decidir si hace falta: el plan no se
  bloqueó por Config as Code, y borrar `railway.json` en T6 ya corta la lectura en los dos entornos.
  **Resuelto en T7: no hizo falta.**
- **T7** (2026-11-02): PR #17 → `gh pr merge 17 --squash --delete-branch` → commit `fafce7b` en `origin/main`, sin
  `railway.json`. El merge disparó un deploy por entorno, los dos desde `fafce7b`:
  - Staging `f31f4d2c` → `SUCCESS`. Production `aafef493` → `SUCCESS`.
  - En los dos builds: `Custom start command detected` y `$ cd server && npm start`. Como el repo ya no tiene
    `railway.json`, el comando sale del dashboard, que es lo que cargó IaC en T4 y T5.
  - En los dos runtimes: `Server running on port 8080 (production)`.
  - `GET /api/health` en los dos dominios → `200 {"status":"ok","db":"connected"}`. Además, `SUCCESS` quiere decir que
    el health check de Railway (`/api/health`, timeout 300) pasó.
  - `railway config plan --environment staging` y `--environment production` → `Your Railway configuration is
    already up to date`. El aviso de "Config as Code is deprecated" ya no aparece en los comandos de la CLI.

## Rollback

Hasta el 2026-12-01 se puede volver atrás: alcanza con revertir el PR, porque eso devuelve `railway.json` al repo.
Los valores que IaC escribe en el dashboard son los mismos, así que tenerlos de más no cambia nada.

## Next

Feature cerrada (2026-11-02). El corte del 2026-12-01 ya no afecta a la app.

Cómo cambiar la configuración de deploy de ahora en adelante: se edita `.railway/railway.ts`, se corre
`railway config plan --environment <entorno>` para ver el cambio y `railway config apply --environment <entorno>`
para aplicarlo, primero en staging. Railway no lee `.railway/` cuando deploya: si no se corre `apply`, el cambio en
el archivo no llega a Railway. Desde la terminal de Claude Code hace falta `$env:_ = 'railway'` antes del comando.

Pendientes que no entran en esta feature:
- Un workflow de GitHub Actions (`railwayapp/config`) que muestre el plan en cada PR que toque `.railway/`.
- Subir Node de 20 (sin soporte) a 22 o 24 en `engines`. `railway` y `@asamuzakjp/css-color` ya piden 22 o más.

Siguiente en el backlog: el punto 2, que hoy deja pedir una herramienta pausada sin rechazar el pedido.
