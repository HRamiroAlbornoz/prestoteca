---
author: HRamiroAlbornoz
branch: chore/railway-iac
status: in-progress
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
- [ ] T2 — `npm install -D railway` en la raíz, corrido por Hernán. Prueba: `package.json` y `npm audit`.
- [ ] T3 — `.railway/railway.ts` generado y `.gitignore` corregido. Prueba: el archivo, y `git status`
  muestra `.railway/` como archivo nuevo.
- [ ] T4 — Staging: `railway config plan` muestra solo cambios en `start`, `healthcheck` y
  `healthcheckTimeout` de `prestoteca`, sin borrar nada. Después `apply`. Prueba: salida del plan y
  `get-service-config` con los tres valores.
- [ ] T5 — Production: lo mismo que T4. Prueba: salida del plan y `get-service-config`.
- [ ] T6 — `railway.json` borrado. Tests, lint y build sin regresiones. Prueba: salida de cada comando.
- [ ] T7 — PR mergeado. El deploy de staging y el de production arrancan con `cd server && npm start`, pasan el
  health check y `/api/health` responde 200. Prueba: log del build y respuesta HTTP.

## Evidence

- **T1** (2026-11-02): Hernán corrió `git switch -c chore/railway-iac` → `Switched to a new branch 'chore/railway-iac'`.

## Rollback

Hasta el 2026-12-01 se puede volver atrás: alcanza con revertir el PR, porque eso devuelve `railway.json` al repo.
Los valores que IaC escribe en el dashboard son los mismos, así que tenerlos de más no cambia nada.

## Next

T2: Hernán instala `railway` como devDependency en la raíz.
