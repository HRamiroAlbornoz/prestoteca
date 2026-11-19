---
type: verification
title: server-sessions — verificación del PR 1 en staging (T009)
description: Migración 005 y deploy del PR 1 en staging, con cada comprobación del plan contra el Postgres real. En curso.
tags: [sdd, verification, auth, session, staging]
timestamp: 2026-11-19T18:40:00Z
topic: sdd
slug: server-sessions
---

# server-sessions — verificación del PR 1 en staging (T009)

> Tarea T009 del [plan](../plans/server-sessions.md) · [spec](../specs/server-sessions.md) ·
> [progreso](../progress/server-sessions.md). Rama `feat/server-sessions-server`, commit `dee7ae2` (no pusheado).

**Veredicto:** en curso.

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

## 2. Deploy del PR 1 a staging — pendiente

## 3. Comprobaciones contra el Postgres real — pendiente

## 4. Smoke, purga y latencia (R3) — pendiente

## 5. Limpieza — pendiente
