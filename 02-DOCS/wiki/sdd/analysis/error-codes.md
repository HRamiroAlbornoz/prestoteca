---
type: analysis
title: Analyze — error-codes (control cruzado antes de implementar)
description: Cruce de constitución, spec, plan y tareas de error-codes; segunda corrida tras los arreglos de la primera.
tags: [sdd, analysis, errors]
timestamp: 2026-11-03T22:00:00Z
topic: sdd
slug: error-codes
---

# Analyze — error-codes

> Artefactos cruzados: [constitución v1.1.0](../constitution.md) · [spec](../specs/error-codes.md) (approved
> 2026-11-03, con enmienda del mismo día) · [plan + tareas](../plans/error-codes.md) (approved, T001-T017) ·
> [decisiones D5-D8](../decisions.md). Este informe no cambia ningún artefacto.

## Veredicto

**GATE: PASS** — 0 CRITICAL · 0 HIGH · 0 MEDIUM · 2 LOW.

Segunda corrida. La primera (mismo día) dio `BLOCKED` con 3 HIGH, 3 MEDIUM y 2 LOW. Hernán aprobó todos los arreglos
("Sí, aplicá todo") y se aplicaron en la fase dueña de cada uno:

| Hallazgo de la 1.ª corrida | Cómo se resolvió | Dónde |
| --- | --- | --- |
| H1 — AC-6 prohibía la excepción de status que el plan aprobó | La spec nombra la única excepción en *Non-goals*, *What it must respect*, la suposición de status y AC-6 | spec, *Revisions* 2026-11-03 |
| H2 — la cobertura no se podía medir | Tarea nueva T017 (instalar `@vitest/coverage-v8`, línea base); T016 mide por archivo cambiado | plan, *Tasks* |
| H3 — el principio 4 pedía herramientas que el repo no tiene | Constitución v1.1.0: oxlint en el cliente, server sin linter como deuda registrada, sin Prettier ni pre-commit | constitución + D8 |
| M1 — dos numeraciones (pasos y `Txxx`) | Cada paso de §6 lleva su `Txxx`, tabla de equivalencias; §3, §5 y §7 citan IDs | plan §6 |
| M2 — los briefs de Qwen no cargaban §3.1/§3.7 | Tabla de qué secciones copia el brief de cada tarea delegada | plan, *Tasks* |
| M3 — sin estrategia de ramas | Una rama por PR; worktrees de Qwen salen de esa rama; docs con la rama del PR activa | plan, *Tasks* |
| L1 — la spec decía 401 para el origen | Corregido a 403 | spec |
| L2 — regla de carga parcial solo en el plan | Agregada a *Behaviour* de la spec | spec |

## Mapa de cobertura

| REQ | Requisito (corto) | Plan | Tareas | Estado |
| --- | --- | --- | --- | --- |
| R1 | AC-1: mensaje en español del código en toda pantalla | §3.3, §3.7 | T010-T015 | covered |
| R2 | AC-2: código desconocido → genérico | §3.4 | T008 | covered |
| R3 | AC-3: respuesta sin formato → genérico | §3.4 | T008 | covered |
| R4 | AC-4: sin conexión → mensaje de conexión | §3.4, §3.7 | T008, T011, T012, T014 | covered |
| R5 | AC-5: falta de mensaje detectada por un test | §2 (D7), §5 | T008 | covered |
| R6 | AC-5b: toda respuesta de error es JSON del catálogo | §3.2, §5 | T003, T009 | covered |
| R7 | AC-5c: errores de búsqueda visibles, distintos de "sin resultados" | §3.7 | T006, T012 | covered |
| R8 | AC-6: código distinto por situación; status igual salvo la excepción nombrada | §3.1, §3.2 | T001-T007 (T005 nombra la excepción) | covered |
| R9 | AC-7: forma del cuerpo intacta | §0, §3.2 | T001, T002, T009 | covered |
| R10 | AC-8: error interno sin detalles | §0, §3.2 | T003, T009 | covered |
| R11 | AC-9: errores anunciados | §0, §3.7 | T011, T014, T015 | covered |
| R12 | AC-9b: el detalle sigue visible si pausar/eliminar falla | §3.7 | T013 | covered |
| R13 | AC-9c: "esperá un minuto" | §3.1, §3.3 | T003, T008 | covered |
| R14 | AC-10: sin textos de error en inglés en el cliente | §0, §5 | T015 | covered |
| R15 | AC-11: sesión terminada → aviso 8, login y vuelta | §2, §3.5 | T010 | covered |
| R16 | AC-12: login fallido no navega ni borra el email | §0, §3.7 | T004, T010 | covered |
| R17 | AC-13: "Salir" que falla deja la sesión y lo dice | §3.6 | T010 | covered |
| R18 | AC-14: textos idénticos a la tabla | §5 | T008 | covered |
| R19 | *Behaviour*: dos cargas a la vez (error de carga, sesión gana, nada si ya se fue) | §3.7 | T011, T014 | covered (ver L-b) |
| R20 | Respetar: límites 5/min y 30/min | §0 | T003 | covered |
| R21 | Respetar: vuelta solo a páginas propias | §0 | T010 | covered |
| R22 | Respetar: validaciones de `toolForm.ts` sin cambios | §0 | T013 | covered |
| R23 | Respetar: "no existe" = "no es tuyo" en préstamos | §3.1 | T007 | covered |
| R24 | Cómo se prueba: staging + archivo de verificación | §5 | T016 | covered |
| R25 | Constitución 4 (v1.1.0): oxlint del cliente limpio | §0, *Tasks* (done-check común) | todas | covered |
| R26 | Constitución 6: cobertura ≥ 80 % por archivo cambiado | §0 | T017, T016 | covered |

Sin `GAP`, sin `DRIFT`.

## Hallazgos

| # | Severidad | Tipo | Artefacto A (lugar) | Artefacto B (lugar) | Conflicto | Se resuelve en |
| --- | --- | --- | --- | --- | --- | --- |
| L-a | LOW | Trazabilidad | *Tasks*, T017 (traza a "Constitución 6") | Spec (ningún AC pide medir cobertura) | T017 no traza a un criterio de la spec sino a la *Definition of Done*. Es legítimo (la constitución obliga a todo cambio), solo que se sale del formato "cada tarea → un AC" | Aceptar conscientemente |
| L-b | LOW | Ambigüedad menor | Spec, *Behaviour* ("si la persona ya se fue de la pantalla, no pasa nada") | *Tasks*, done-check de T014 ("my-loans two-requests rule") | El done-check de T011 nombra el caso "señal cancelada → nada"; el de T014 lo cubre solo por referencia a la regla. El brief de T014 copia la regla completa (M2), así que el caso llega igual al implementador | Aceptar, o precisarlo al armar el brief de T014 en `implement` |

## Notas para `implement`

- **Deuda registrada, fuera de este cambio:** el server no tiene linter (constitución v1.1.0, principio 4). El cierre
  no puede ni debe marcarlo como FAIL de error-codes.
- **Primer paso:** T017 necesita que Hernán corra el `npm install` (dependencias: los corre él). Va en la rama
  `feat/error-codes-server`, junto con T001-T007.
- **Prueba piloto de Orca + OpenCode + Qwen** antes de T005, como dice *Tasks*.
- **Docs:** los cambios de esta corrida (spec, constitución, plan, D8 y este informe) quedan en `main` local por el
  hook de rsc. Hay que moverlos a un PR de docs antes de abrir la primera rama de código.
