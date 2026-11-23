---
type: analysis
title: Analyze — zod-routes (control cruzado antes de implementar)
description: Cruce de constitución v1.3.0, spec zod-routes (33 criterios), plan y tareas T001-T013.
tags: [sdd, analysis, validation, server]
timestamp: 2026-11-23T23:00:00Z
topic: sdd
slug: zod-routes
---

# Analyze — zod-routes

> Constitución: [v1.3.0](../constitution.md) · Spec: [zod-routes](../specs/zod-routes.md) (approved, 33 criterios) ·
> Plan + tareas: [zod-routes](../plans/zod-routes.md) (approved, T001-T013) · Corrida 1, 2026-11-23

## Veredicto

**GATE: BLOCKED** — 1 CRITICAL (F1), 0 HIGH, 5 MEDIUM (F2-F6), 3 LOW (F7-F9).

El diseño no está en duda. F1 es una regla escrita que la feature promete cumplir y que, leída al pie de la letra, no va a
cumplir del todo. Los cinco MEDIUM son ajustes de texto en las tareas.

## Mapa de cobertura (spec → plan → tareas)

| Criterio | Qué pide (corto) | Plan | Tareas | Estado |
| --- | --- | --- | --- | --- |
| AC-1, AC-18 | mismas respuestas; bordes de hoy | §0, §5 (`B`, `M`) | T001, T009 | covered — ver F5, F6 |
| AC-2 | gana el mismo error | §3.3, §5 (51 pares) | T001, T004-T007, T009 | covered |
| AC-3, AC-4, AC-4b, AC-4c, AC-5, AC-5b | fecha mal formada (fila 40) y su orden | §3.3, §3.6, §5 | T006, T009 | covered |
| AC-6 | fechas con espacios | §3.3, §5 | T001, T006, T009 | covered |
| AC-7, AC-8 | página | §0, §3.3, §5 | T001 (AC-8), T005, T009 | covered |
| AC-9 | sin base ni hashes | §5 (espías) | T004-T007, T009 | covered |
| AC-10, AC-10b | id que no es UUID; herramienta ajena | §3.3, §5 | T001, T009 | covered |
| AC-11, AC-12, AC-23 | sin sesión; formulario; campo desconocido | §3.3, §5 | T001, T009 | covered — ver F5 |
| AC-13 a AC-13f | cambio de contraseña | §3.3, §5 | T007, T009 | covered |
| AC-14 | control de la suite | §3.7, §5 | T008 | covered |
| AC-15, AC-19 | texto de la fila 40; 40 filas | §3.6, §5 | T006 | covered — ver F3, F7 |
| AC-16 | el `message` no repite el valor | §0, §5 | T002-T007, T009 | covered |
| AC-17 | staging antes y después | §5, §6 paso 11 | T011 | covered |
| AC-20 | carácter nulo | §0, §3.3, §5 | T001, T004-T007, T009 | covered — ver F6 |
| AC-21, AC-22 | id mal codificado; cuerpo ilegible | §3.5, §5 | T002, T009 | covered |
| AC-24 | email que crece en minúsculas | §0, §3.3, §5 | T004, T009 | covered |

- **GAP:** ninguno. Los 33 criterios (contados en la spec) tienen plan y tarea.
- **DRIFT:** ninguno con costo. Lo que el plan agrega sin criterio directo se deriva de uno o de una decisión: la lista única
  de categorías (D18), la regla de dónde se importa `zod` (AC-14), los tres huecos heredados (AC-1).
- **Números cruzados:** 51 pares (8 nuevos, 43 en T001), 14 bordes, 9 reglas y 21 filas coinciden entre la spec, el §5 y la
  columna *Done-check*. Las lecturas directas de hoy en el código son 15, más `req.path` en `index.ts`, como dice el plan.

## Hallazgos

| # | Severidad | Tipo | Artefacto A (lugar) | Artefacto B (lugar) | Conflicto | Resolver en |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | CRITICAL | Constitución | constitución, principio 13 ("**All** external data validated server-side (Zod schemas, **length limits**, safeParse)") | spec *Non-goals* (cookie y `Origin` sin tocar; "reglas nuevas que hoy no existen" fuera) contra spec *Goals* ("El principio 13 se cumple en las rutas y F1 deja de aparecer") | al cerrar la feature, la cookie y `Origin` siguen sin Zod (D16 lo acepta, la constitución no lo dice), y varios textos siguen **sin largo máximo propio**: email y contraseña del login, contraseña actual, categoría y barrio de la búsqueda, id, `status`. Ninguna decisión anotada cubre los largos | `constitution` (enmendar el texto) **o** decisión de aceptación |
| F2 | MEDIUM | Contradicción | plan §0, §6 paso 10, *Cierre de tier 2* ("la versión fijada en `.rsc.json`, 4.1.8") | `.rsc.json` en el árbol: 4.1.9, sin commitear (rsc se actualizó solo) | el plan nombra dos veces la misma cosa con valores distintos: "la de `.rsc.json`" y "4.1.8" | decisión de Hernán (adoptar o volver) y `tasks` |
| F3 | MEDIUM | Ambigüedad | plan §7, T006 en dos entregas: primero "esquemas y rutas", después "fila 40" | `loanSchemas.ts` usa `LOAN_DATE_INVALID`; `client/src/errors/messages.ts` es `Record<ClientErrorCode, string>` y `messages.test.ts` recorre `ERROR_CODES` y la tabla de la spec | la primera entrega no compila sin el código nuevo, y con él deja al cliente en rojo. Ninguna de las dos se puede revisar sola | `tasks` (invertir: primero la fila 40 de los dos lados, después esquemas y rutas) |
| F4 | MEDIUM | Ambigüedad (portador) | plan, *Interfaces por tarea* ("En T004 a T007, el brief copia además entera la fila del §3.3 …") | T001, T002, T003, T008 y T009 dependen de listas que viven en §5, §3.5, §3.1-3.2, §3.7 y la spec; T009 no tiene bloque de interfaces | quien implementa aislado no ve esas listas, y ninguna línea dice qué copiar en esas tareas | `tasks` |
| F5 | MEDIUM | Ambigüedad | plan §5 y T001 (`IDS zodToday` sobre los tres archivos juntos) | plan §7 (tres entregas) | no está escrito qué ids van en cada archivo. Y los ids que valen en varias rutas (`B-5`, `M-1`, `M-2`, `M-8`, `M-9`, `AC-11`, `AC-23`) dan "todos" con que pasen en uno solo | `tasks` (una lista de ids por archivo, con los repetidos en cada uno) |
| F6 | MEDIUM | Ambigüedad | spec, criterios con varios casos: AC-4 (9 entradas), AC-7 (8), AC-20 (7 cláusulas), AC-22 (5), y cada `B-n` y `FILA-n` | done-checks con `IDS` | el control prueba "al menos una prueba con ese id", no que estén todos los casos. En particular, "fila 40 gana al nulo en la nota" (AC-20) no tiene par ni id propio | `tasks` (cada brief lista los casos y el revisor los tilda; id propio para ese par) |
| F7 | LOW | Contradicción | plan, *Cobertura de criterios* ("AC-15 y AC-19 se prueban en el cliente") | spec AC-19 (también la tabla del server, con status 400) | AC-19 también se prueba en `server/tests/errorCodes.test.ts` (VERDE de T006 lo corre) | `tasks` (una frase) |
| F8 | LOW | Contradicción | spec, primera *suposición tomada* (cada `message` de hoy se conserva "palabra por palabra") | plan §0, dos excepciones de `message` | están decididas y aprobadas con el plan, pero la spec no las menciona | `clarify` (una frase) o aceptar |
| F9 | LOW | Ambigüedad | plan, `IDS` (`check-test-ids.mjs` fuera del repo) | done-checks T001 a T009 | quien lea la evidencia después no puede repetir el control solo con el repo | aceptar, o copiar la salida completa en `progress/` |

### Por qué importa F1

Es como aprobar una obra con el cartel "todas las puertas tienen cerradura" cuando dos tienen tranca y varias, pestillo.
Cierran igual, pero el próximo control va a leer el cartel y marcar lo mismo. Con esta feature, todo texto que **se guarda**
tiene largo máximo, y el resto queda acotado por el cuerpo de 10 kb y el tope de encabezados de Node. La seguridad no
depende de F1; depende que la regla escrita diga la verdad.

- **Opción A — enmendar el principio 13 (v1.4.0):** cuerpo, query e id con esquema Zod y `safeParse`; cookie de sesión y
  `Origin` con sus chequeos estrictos propios; largo máximo en todo texto que se guarda, y el resto acotado por el tope de
  10 kb. Costo: un párrafo y una decisión. Riesgo: ninguno en el código; un largo nuevo se discutiría como regla nueva.
- **Opción B — aceptarlo en una decisión (D19)** sin tocar la constitución. Costo: menor. Riesgo: `analyze` lo vuelve a
  marcar en cada feature, justo lo que esta venía a terminar.
- **Opción C — agregar los largos que faltan.** Costo: cambia respuestas (hoy un email de login largo da 401, y es un borde
  que la spec fija). Contradice la spec aprobada, y la cookie y `Origin` seguirían fuera.

**Recomendación:** A, en el mismo PR de documentos.

### Por qué importan los MEDIUM

- **F2:** una puerta que corre con una versión que nadie adoptó no es la puerta que el equipo aprobó.
- **F3:** la primera entrega de T006 llegaría en rojo sin culpa de Qwen, y costaría una vuelta entera.
- **F4, F5, F6:** Qwen ve solo su brief. Lo que no esté copiado ahí no se prueba, y el control de ids podría dar "todos".

## Ruteo recomendado

- **`constitution` (F1):** Hernán elige A, B o C.
- **Decisión de Hernán (F2):** adoptar 4.1.9 (como las subidas anteriores, en un commit `chore(rsc)`) o volver a 4.1.8; después
  `tasks` ajusta las menciones del plan.
- **`tasks` (F3 a F7):** ajustes de texto, sin cambiar el diseño.
- **`clarify` (F8) y aceptar (F9).**

Con eso se corre `analyze` otra vez sobre los cambios.

## Límites de esta corrida

- La hizo la misma sesión que escribió el plan, no un agente con ojos frescos.
- No se ejecutó ninguna tarea. Lo que otra revisión midió (mutantes, comparaciones viejo/nuevo) no se repitió.
