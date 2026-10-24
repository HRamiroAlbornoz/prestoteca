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
  - `Dockerfile` basado en `postgres:18-alpine` más Node, `railway.json` con el cron y la política
    de reinicio `NEVER`, y un `README.md` con el procedimiento de restauración.
- Railway **staging**: bucket y servicio `db-backup` desplegados con `railway up`, sin conectar el
  repo, porque el source de un servicio es el mismo para todos los entornos. Las variables van por
  referencia (`${{Postgres.DATABASE_URL}}` y las credenciales del bucket).
- Railway **production**: bucket y servicio `db-backup` conectados a `main`, con root directory
  `backup` y watch paths `backup/**`.

**No entra:**
- Alertas cuando falla un backup. Queda para la feature de monitoreo, que tiene que avisar si un día no se generó la copia.
- Una copia fuera de Railway (R2 u otro proveedor). Se puede sumar más adelante.
- Cifrar las copias del lado del cliente (el bucket ya cifra en reposo y es privado).
- El resto del backlog: herramientas pausadas, tests con fechas fijas, `npm audit`, mensajes en
  inglés y cuentas de prueba.

## Checklist

- [ ] T1 — Rama `feat/db-backups` desde `main`, creada por Hernán. Prueba: `git branch --show-current`.
- [ ] T2 — Lógica pura (nombre de la copia y retención) con tests en rojo y después en verde.
  Prueba: salida de `npx vitest run` en `backup/`.
- [ ] T3 — Flujo completo con dependencias falsas. Casos: camino feliz; si el dump falla, no se sube
  ni se borra nada; si la subida falla, no se borra nada; solo se borran archivos con el formato
  propio. Prueba: salida de Vitest.
- [ ] T4 — `Dockerfile`, `railway.json` y `README.md` con la restauración. Prueba: el build de
  staging queda en `SUCCESS` y el log muestra `pg_dump (PostgreSQL) 18.x`.
- [ ] T5 — Staging: bucket, servicio y variables por referencia. Una corrida manual sube la copia.
  Prueba: el log de la corrida y el archivo listado en el bucket.
- [ ] T6 — Retención en staging con `BACKUP_KEEP=2` y 3 corridas: quedan solo 2 copias. Después se
  vuelve a 14. Prueba: listado del bucket.
- [ ] T7 — Restauración en staging (`restore-check`): la cantidad de filas de `users`, `tools` y
  `loans` coincide, y la base temporal se borra. Prueba: log de la corrida.
- [ ] T8 — Tests, lint y build sin regresiones en `client` y `server`. Los mismos rojos que antes:
  los 4 de `requestLoan.test.tsx`. Prueba: salida de cada comando.
- [ ] T9 — PR mergeado a `main`. Prueba: el commit está en `origin/main`.
- [ ] T10 — Production: bucket y servicio conectados a `main`. Una corrida manual sube la copia, que
  pasa `pg_restore --list`. El próximo cron queda programado a las 06:00 UTC. Prueba: log, listado
  del bucket y `railway status`.

## Evidence

(vacío)

## Next

Hernán crea la rama (T1). Después: escribir los tests de T2 en rojo.
