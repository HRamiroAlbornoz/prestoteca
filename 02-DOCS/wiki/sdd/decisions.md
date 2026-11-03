---
type: decisions
title: Prestoteca — Decision Records
description: Architectural and design decisions for Prestoteca MVP.
tags: [sdd, decisions, adr]
timestamp: 2026-10-04T00:00:00Z
---

# Prestoteca — Decision Records

> Append-only. Each decision gets a new entry; never edit past entries.

## D1 — Monolith vs. split services

- **Fecha:** 2026-10-04
- **Contexto:** El MVP necesita backend + frontend. ¿Un solo servidor Express o servicios separados?
- **Opciones:**
  - Monolith (Express + React)
  - Microservicios (servicios separados, comunicación por API)
  - Serverless (functions + static frontend)
- **Decisión:** Monolith (Express + React)
- **Por qué:** MVP simplicity, single deploy surface, sin necesidad de desacoplar. Si el producto escala, se separa después. Alineado con los no-goals del MVP (sin pagos, sin notificaciones, sin chat — el MVP es simple).
- **Consecuencias:**
  - ✅ Menor complejidad inicial
  - ✅ Un solo equipo, un solo deploy
  - ⚠️ Si escala, la refactorización será trabajo adicional

## D2 — Background scan para vencimiento vs. on-demand

- **Fecha:** 2026-10-04
- **Contexto:** ¿Cómo se marcan los préstamos "vencidos" automáticamente?
- **Opciones:**
  - Cron cada hora (background job)
  - On-demand en cada query (verificar al leer)
  - Event-driven (trigger en BD)
- **Decisión:** Cron cada hora
- **Por qué:** Simple y suficiente para MVP. No hay miles de préstamos activos. On-demand agrega complejidad a cada query; event-driven requiere triggers de BD que complican las migraciones.
- **Consecuencias:**
  - ✅ Implementación simple (una función + cron)
  - ✅ No afecta rendimiento de queries
  - ⚠️ Hay un window de hasta 1 hora entre vencimiento real y detección

## D3 — Rate limiter: in-memory vs. Redis

- **Fecha:** 2026-10-04
- **Contexto:** ¿Dónde se almacena el contador de rate limiting?
- **Opciones:**
  - In-memory store (en proceso)
  - Redis (servicio externo)
  - Database-backed (tabla en PostgreSQL)
- **Decisión:** In-memory store
- **Por qué:** MVP con una sola instancia de Express. In-memory es suficiente y no requiere infraestructura adicional. Si se escala a múltiples instancias, se migra a Redis.
- **Consecuencias:**
  - ✅ Sin dependencia externa
  - ✅ Implementación simple (Map en memoria)
  - ⚠️ Si hay múltiples instancias de Express, cada una tiene su propio contador (rate limiting menos preciso)

## D4 — Account deletion: soft-delete tools + anonymize loans

- **Fecha:** 2026-10-04
- **Contexto:** ¿Qué pasa cuando un usuario elimina su cuenta?
- **Opciones:**
  - Full delete (borrar todo, herramientas y préstamos)
  - Soft-delete tools + anonymize loans (marcar herramientas como borradas, anonymizar préstamos)
  - Soft-delete everything (marcar todo como borrado)
- **Decisión:** Soft-delete tools + anonymize loans
- **Por qué:** Soft-delete tools conserva el historial de préstamos (spec línea 117). Anonymize loans preserva el historial sin exponer datos personales. Full delete destruiría el historial de préstamos que otros usuarios necesitan ver.
- **Consecuencias:**
  - ✅ Cumple con regulaciones de privacidad (derecho al olvido)
  - ✅ Conserva historial de préstamos para otros usuarios
  - ⚠️ Los datos del usuario existen en la BD (anonymizados), no eliminados físicamente
  - ⚠️ Transacción única necesaria para evitar inconsistencias

## D5 — Errores de cara al usuario: códigos específicos + mapa en el cliente

- **Fecha:** 2026-11-02
- **Contexto:** Punto 5 del backlog. Los errores llegan a la pantalla en inglés porque el cliente muestra el texto del
  server, y los códigos actuales (7 clases genéricas) no distinguen una situación de otra. Spec:
  [error-codes](./specs/error-codes.md).
- **Opciones:**
  - Traducir al español los ~60 textos del server y seguir mostrándolos tal cual (FTD, una tarde).
  - Un código por situación accionable en un catálogo único del server, y un mapa código → mensaje en español en el
    cliente (lo que pide el checklist de errores).
- **Decisión:** Códigos específicos + mapa en el cliente. Texto del server solo para desarrollo. Uno por situación
  accionable (~30). `retryable` diferido.
- **Por qué:** Separa el texto para personas del texto para depurar, deja que el cliente decida cómo hablarle al
  usuario y sigue el checklist de errores del proyecto.
- **Consecuencias:**
  - ✅ Ningún texto del server llega a la pantalla; el usuario ve mensajes en español con qué hacer.
  - ⚠️ Cada situación nueva toca server y cliente. Mitigación: un test que falla si un código no tiene mensaje (AC-5).
  - ⚠️ Objeción registrada en specify y no tomada: con traducir en el server, el mensaje viajaba solo.

## D6 — Spec de códigos de error aprobada; sesión terminada lleva al login

- **Fecha:** 2026-11-03
- **Contexto:** La spec [error-codes](./specs/error-codes.md) se adaptó al formato de ASDD (rsc 4.0.1), pasó una
  revisión con contexto limpio (4 problemas, corregidos y verificados contra el código) y Hernán la aprobó: "Sí,
  apruebo la spec tal como está."
- **Decisiones:**
  - Cuando no hay sesión (o terminó), la app muestra "Tu sesión terminó. Iniciá sesión para continuar.", lleva al
    login y después vuelve a la pantalla donde estaba. Un login fallido nunca lo hace. Ir al login depende del código
    del error, no del status 401.
  - "No hay sesión", "venció" y "no es válida" son una sola situación: la cookie dura lo mismo que la sesión (1 h).
  - Los 36 textos de la tabla de *What result they get* son la referencia aprobada; el cliente los copia tal cual.
  - "Salir" que falla deja la sesión abierta y lo dice.
- **Consecuencias:**
  - ✅ El usuario nunca queda trabado en una pantalla privada con la sesión terminada.
  - ⚠️ Lo escrito en un formulario se pierde al ir al login; guardarlo queda fuera de este ciclo.

## D7 — Dónde vive el catálogo de códigos y cómo lo lee el cliente

- **Fecha:** 2026-11-03
- **Contexto:** Fase `plan` de la spec [error-codes](./specs/error-codes.md). AC-5 pide que falte un mensaje se detecte
  antes del merge; AC-5b, que ningún código quede fuera del catálogo. Plan: [error-codes](./plans/error-codes.md).
- **Opciones:**
  - Duplicar la lista de códigos en el cliente.
  - Un paquete compartido (`shared/`) como tercer workspace.
  - El catálogo en un archivo del server sin dependencias (`errorCodes.ts`, código → status), y el mapa del cliente
    tipado contra él con un `import type`.
- **Decisión:** la tercera. Además: `AppError(code, mensaje)` deriva el status del catálogo y es el único escritor del
  JSON de error; el cliente reacciona con un hook (`useApiError`) en vez de envolver `fetch`; la tabla de la spec es el
  oráculo del test de AC-14; el aviso de sesión terminada viaja en el state del router, no en la URL.
- **Por qué:** `tsc -b` del cliente falla si un código no tiene mensaje, sin sumar un workspace; el `import type` se
  borra al compilar y el bundle no incluye nada del server. Un código → un status impide que el mismo código salga con
  dos status distintos.
- **Consecuencias:**
  - ✅ Agregar un código sin mensaje rompe el build y un test, no la pantalla.
  - ⚠️ El build del cliente depende de que exista `server/src` (Railway construye desde la raíz). Plan B: un JSON
    generado en el cliente, comparado por test.
  - ⚠️ `TOOL_EDIT_EMPTY` conserva el 404 de hoy, aunque no sea el status correcto; se corrige aparte.
