---
author: HRamiroAlbornoz
branch: chore/npm-audit
status: in-progress
---
# Dependencias sin vulnerabilidades conocidas (`npm audit`)

## Intent

Punto 4 del backlog. El 2026-11-02, `npm audit` en la raíz daba **15 vulnerabilidades** (4 moderadas, 5 altas,
6 críticas). 7 de ellas llegaban a production (`npm audit --omit=dev`). `backup/` tenía otras 7, todas de `vitest` 3.
El objetivo es dejar las dos en 0 sin cambiar el comportamiento de la app.

Las 15 tenían 5 causas:

| Causa | Qué arrastraba | ¿Production? | Arreglo |
|---|---|---|---|
| `pg-migrate` (dev) | `minimist`, `optimist`, `pg` 4–8.3, `semver` | No | Borrarlo: no lo usa ningún archivo de código, script ni test (`grep pg-migrate` solo lo encuentra en `server/package.json`). Las migraciones son `.sql` en `server/src/migrations/`. |
| `bcrypt` 5 | `@mapbox/node-pre-gyp` → `tar`, `rimraf`, `glob`, `minimatch` | Sí | `bcrypt` 6, que trae binarios ya compilados (`node-gyp-build`) y no usa `node-pre-gyp`. |
| `body-parser` 2.3.0 (de `express`) | DoS con cuerpos comprimidos | Sí | `npm audit fix` → 2.4.0, dentro del rango que pide `express`. |
| `zod` 3 | Consumo de memoria con colecciones grandes (arreglado en 4.6.6) | Sí | `zod` 4. Solo se usa en `server/src/modules/config/env.ts`. |
| `vitest` 3 (dev) | `@vitest/mocker`, `tinypool` | No | `vitest` 5 en `server` y en `backup` (el cliente ya la usaba). |

**Riesgo principal:** si `bcrypt` 6 no reconociera los hashes de `bcrypt` 5, nadie podría iniciar sesión. Para
probarlo, antes de cambiar nada se creó en staging una cuenta cuyo hash lo hizo `bcrypt` 5 (staging corría
`7840c35`). Después del deploy de la rama, esa cuenta tiene que poder iniciar sesión.

## Scope

**Entra:** las dependencias de `server` y `backup` de la tabla, el ajuste de `env.ts` a zod 4 y la prueba de login en staging.

**No entra:**
- Node 20 → 22+ (pendiente aparte, de la feature de IaC).
- Los avisos `npm warn install-scripts … not yet covered by allowScripts`: son la política nueva de npm sobre
  scripts de instalación. `bcrypt` 6 carga igual, porque trae los binarios compilados.

## Checklist

- [x] T1 — Rama `chore/npm-audit` desde `main` (`7840c35`), creada por Hernán.
- [x] T2 — Instalaciones en la raíz (Hernán): sacar `pg-migrate`; `bcrypt@^6.0.0`, `zod@^4.6.7`, `vitest@^5.1.0`,
  `@types/bcrypt@^6`; `npm audit fix`. Prueba: `npm audit` → `found 0 vulnerabilities`.
- [x] T3 — `env.ts` ajustado a zod 4. Server, cliente, type-check, lint y build en verde. Prueba: salida de cada comando.
- [x] T4 — `backup/`: `vitest` 5 y `@vitest/coverage-v8` 5. Tests y cobertura en verde. Prueba: `npm audit` en
  `backup` → 0, y salida de Vitest.
- [x] T5 — Staging con `railway up`: la cuenta con hash de `bcrypt` 5 inicia sesión (`200`), una contraseña
  incorrecta da `401` y `/api/health` da `200`.
- [ ] T6 — PR mergeado y deploys de staging, production y `db-backup` en `SUCCESS`.

## Evidence

- **T1** (2026-11-02): `git switch -c chore/npm-audit` → `Switched to a new branch 'chore/npm-audit'`.
- **Antes de cambiar nada** (2026-11-02): `bcrypt-compat.mjs create` (scratchpad) → `register … 201` con
  `qa-bcrypt5-1793654455826@example.com`, en staging con `7840c35` (`bcrypt` 5.1.1).
- **T2** (2026-11-02, Hernán): `npm uninstall pg-migrate -w server` → `removed 14 packages`, 10 vulnerabilidades.
  `bcrypt@6` + `zod@4` → `removed 48 packages`, 4 vulnerabilidades. `vitest@5` + `@types/bcrypt` → `removed 35
  packages`, 1 alta (`body-parser`). `npm audit fix` → **`found 0 vulnerabilities`**. `npm audit` de la raíz → `0`.
  `backup` falló con `ERESOLVE`: `@vitest/coverage-v8@3.2.7` pide `vitest@3.2.7` (T4).
- **T3** (2026-11-02): con zod 4, `env.test.ts` dio `6 failed`: `err.errors is not iterable` (en zod 4 es
  `err.issues`) y `expected 'true' to be true` (en zod 4, `.default()` no pasa por el `.transform()`). `tsc` marcó
  los mismos dos puntos. Arreglo: `err.issues`, y `.prefault('true')` en `TRUST_PROXY` (doc de zod vía Context7:
  `.default()` "short-circuits" y debe ser del tipo de salida; `.prefault()` se parsea). Resultado: server
  `Test Files 27 passed (27)`, `Tests 247 passed (247)`; `tsc -b` → exit 0; client `Tests 154 passed (154)`; lint →
  exit 0; `npm run build` → exit 0. `bcrypt` 6.0.0 carga su binding nativo: `hash` + `compare` → `true`.

- **T4** (2026-11-02, Hernán): `npm install -D vitest@^5.1.0 @vitest/coverage-v8@^5.1.0 --prefix backup` →
  `removed 82 packages`, `found 0 vulnerabilities`. `npm audit --prefix backup` → `found 0 vulnerabilities`.
  `npx vitest run --coverage` en `backup` → `Test Files 7 passed (7)`, `Tests 61 passed (61)`, líneas `84.37 %`
  (el umbral es 80 %), exit 0. `oxlint backup/src backup/tests` → sin avisos. La imagen de `db-backup` instala con
  `npm ci --omit=dev`, así que `vitest` no entra en ella.
- **T5** (2026-11-02): `railway up -s prestoteca -e staging --ci` → `Deploy complete`. `/api/health` →
  `200 {"status":"ok","db":"connected"}`. `bcrypt-compat.mjs check` con la cuenta cuyo hash hizo `bcrypt` 5:
  contraseña incorrecta → **`401`**, contraseña correcta → **`200`**, y después la cuenta se borró (`204`).
  **`bcrypt` 6 acepta los hashes de `bcrypt` 5.** Regresión: `request-loan-e2e.mjs` (ayer `400`, hoy `201`, snake_case
  `400`) y `paused-e2e.mjs` (`201`, `201`, `200`, `403`, `409`, `400`) dan lo mismo que antes. Esos scripts
  registran cuentas nuevas, así que también prueban hashes hechos por `bcrypt` 6. Limpieza completa.

## Next

T6: Hernán commitea, abre el PR y mergea. El merge también redeploya `db-backup`, porque cambia `backup/**`.
Después se verifican los tres deploys y la corrida de backup siguiente.
