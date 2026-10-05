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
