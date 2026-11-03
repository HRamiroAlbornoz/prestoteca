---
type: analysis
title: Analyze — error-codes (control cruzado antes de implementar)
description: Cruce de constitución, spec, plan y tareas de error-codes; hallazgos ordenados por severidad y fase que los resuelve.
tags: [sdd, analysis, errors]
timestamp: 2026-11-03T21:00:00Z
topic: sdd
slug: error-codes
---

# Analyze — error-codes

> Artefactos cruzados: [constitución](../constitution.md) · [spec](../specs/error-codes.md) (approved 2026-11-03) ·
> [plan + tareas](../plans/error-codes.md) (approved 2026-11-03, T001-T016) · [decisiones D5-D7](../decisions.md).
> Este informe no cambia ningún artefacto: cada hallazgo indica qué fase lo resuelve.

## Veredicto

**GATE: BLOCKED** — 0 CRITICAL · 3 HIGH · 3 MEDIUM · 2 LOW.

Los tres HIGH no son errores de diseño: son promesas que el plan o la spec hacen y que, tal como están escritas, el
cierre (`verify`, T016) no va a poder cumplir. Se resuelven con decisiones cortas de Hernán, no con otra ronda de plan.

## Mapa de cobertura

| REQ | Requisito de la spec (corto) | Plan | Tareas | Estado |
| --- | --- | --- | --- | --- |
| R1 | AC-1: cualquier pantalla muestra el mensaje en español del código, nunca el inglés | §3.3, §3.7 | T010-T015 | covered |
| R2 | AC-2: código desconocido → genérico | §3.4 | T008 | covered |
| R3 | AC-3: respuesta sin formato → genérico | §3.4 | T008 | covered |
| R4 | AC-4: sin conexión → mensaje de conexión | §3.4, §3.7 | T008, T011, T012, T014 | covered |
| R5 | AC-5: comprobación que falla si un código no tiene mensaje | §2 (D7), §5 | T008 | covered |
| R6 | AC-5b: toda respuesta de error es JSON con código del catálogo | §3.2, §5 | T003, T009 | covered |
| R7 | AC-5c: el inicio muestra los errores de búsqueda y no los confunde con "sin resultados" | §3.7 | T006, T012 | covered |
| R8 | AC-6: código distinto por situación, **mismo status que antes** | §3.1, §3.2 | T001-T007 | **CONTRADICTION** (H1) |
| R9 | AC-7: forma `{ error: { code, message } }` intacta | §0, §3.2 | T001, T002, T009 | covered |
| R10 | AC-8: error interno → genérico, sin detalles internos | §0, §3.2 | T003, T009 | covered |
| R11 | AC-9: errores anunciados (`role="alert"`) | §0, §3.7 | T011, T014, T015 | covered |
| R12 | AC-9b: pausar/eliminar fallido no reemplaza el detalle | §3.7 | T013 | covered |
| R13 | AC-9c: demasiados pedidos → "esperá un minuto" | §3.1, §3.3 | T003, T008 | covered |
| R14 | AC-10: ningún texto de error en inglés en el cliente | §0, §5 | T015 | covered |
| R15 | AC-11: sesión terminada → aviso 8, login y vuelta (también desde el detalle de herramienta) | §2, §3.5 | T010 | covered |
| R16 | AC-12: login fallido no navega ni borra el email | §0, §3.7 | T004, T010 | covered |
| R17 | AC-13: "Salir" que falla deja la sesión y lo dice | §3.6 | T010 | covered |
| R18 | AC-14: textos idénticos a la tabla de la spec | §5 | T008 | covered |
| R19 | Respetar: límites de 5/min y 30/min sin cambios | §0 | T003 | covered |
| R20 | Respetar: vuelta solo a páginas propias (`//evil.example`) | §0 | T010 | covered |
| R21 | Respetar: validaciones del cliente (`toolForm.ts`) sin cambios | §0, §3.7 | T013 | covered |
| R22 | Respetar: "no existe" = "no es tuyo" en préstamos | §3.1 | T007 | covered |
| R23 | Cómo se prueba: staging (sesión vencida, límite, superposición) + archivo de verificación | §5 | T016 | covered |
| R24 | Constitución 4: formatter + linter limpios | §0 | — | **GAP** (H3) |
| R25 | Constitución 6: cobertura ≥ 80 % en código cambiado | §0 | — | **GAP** (H2) |
| — | Inicio: cancelar el pedido anterior (`AbortController`) | §3.7 | T012 | covered (sostiene R7: una respuesta vieja no pisa a la nueva) |
| — | Perfil/Mis préstamos: carga parcial se muestra como error de carga | §3.7 | T011, T014 | DRIFT menor (L2) |

## Hallazgos

| # | Severidad | Tipo | Artefacto A (lugar) | Artefacto B (lugar) | Conflicto | Se resuelve en |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | HIGH | Contradicción | Spec, AC-6 y *Non-goals* ("el status de cada caso queda igual") | Plan §0, §3.2 y D7 (excepción `ACCOUNT_NOT_FOUND` 404 al cambiar la contraseña de una cuenta eliminada) | El plan aprobó una excepción que la spec, que es la fuente de verdad, prohíbe. El test de AC-6 de ese caso no puede pasar "con el mismo status que antes" | `specify` (enmienda chica de la spec, aprobada por Hernán) |
| H2 | HIGH | Cobertura / constitución | Constitución, principio 6 y *Definition of Done* (cobertura ≥ 80 % en código cambiado) | Tareas T001-T016 (ninguna mide cobertura); `@vitest/coverage-v8` no está instalado (`node_modules/@vitest` solo tiene `mocker` y `spy`), aunque `server/vitest.config.ts:27-35` ya pide umbrales del 80 % | El cierre no puede probar el principio 6: el check quedaría "no corrido", y la verificación de `db-backups` ya falló por lo mismo | `tasks` (agregar instalar y medir cobertura) **o** `constitution` (si no se quiere medir) |
| H3 | HIGH | Constitución | Constitución, principio 4 ("Prettier + ESLint, zero warnings", "enforced by pre-commit") | Plan §0 ("oxlint/ESLint sin warnings") y nota de *Tasks* ("el server no tiene script de lint") | En el repo no hay Prettier, ni ESLint, ni pre-commit; el cliente usa oxlint y el server no tiene linter. El plan reescribió el principio en vez de señalarlo, y T016 no puede cumplirlo como está escrito | `constitution` (registrar oxlint y el estado real) **o** `tasks` (agregar linter al server, fuera de esta spec) |
| M1 | MEDIUM | Duplicación | Plan §3.2, §3.3, §6 y R-tabla ("la tarea 1", "la tarea 6 las borra", "tarea 7", "tarea 8") | *Tasks* (T001-T016, con otra numeración: el paso 6 de §6 es T009, el paso 3 es T004+T005) | Dos numeraciones conviven. Un implementador aislado que lea "la tarea 6 borra las subclases" puede creer que es T006 (tools) | `tasks` (reemplazar las referencias a pasos por IDs `Txxx` en §3 y §7) |
| M2 | MEDIUM | Ambigüedad (portador) | *Tasks*, filas T005-T007 y T011-T014 (citan "rows 11-16", "two-requests rule", "priority rule") | Plan §3.1 (tabla código ↔ fila), §3.7 (reglas por pantalla) | Las tareas que van a Qwen dependen de §3.1 y §3.7, pero los bloques *Interfaces* solo cargan firmas. Un worker aislado que reciba §0 + su fila no ve qué código va con cada fila ni las reglas de pantalla | `tasks` (decir que el brief de cada tarea delegada incluye §3.1 o §3.7, o copiar la parte que le toca) |
| M3 | MEDIUM | Ambigüedad (proceso) | Constitución, principio 10 (trabajo en rama, merge por PR) y *Review Workload Forecast* (3 PRs en cadena) | Tareas (no dicen en qué rama se trabaja); el hook de rsc commitea `02-DOCS/` solo en la rama activa | No está dicho dónde vive cada PR, ni cómo conviven los worktrees de Qwen con la rama de cada PR | `implement` (al arrancar: rama por PR y worktrees hijos de esa rama) |
| L1 | LOW | Contradicción (texto) | Spec, *What it must respect* ("el origen no permitido también responde 401") | Plan §3.1 y §4 (el origin check responde hoy 403, y se mantiene) | La spec describe mal el status de hoy; el plan ya lo detectó y respeta el código real | `specify` (corregir la frase junto con H1) |
| L2 | LOW | Drift menor | Spec (no dice qué hacer si una de dos cargas falla) | Plan §3.7 (carga parcial → error de carga, sin mostrar la parte que cargó) | Decisión de producto tomada en el plan, razonable y aceptada por Hernán en la tercera revisión, pero no está en la spec | Aceptar conscientemente, o sumarla a la spec junto con H1 |

## Por qué importan los HIGH

- **H1:** al cerrar, `verify` compara cada criterio de aceptación con la evidencia. AC-6 dice "mismo status que antes",
  el test de la excepción muestra un 404 donde antes había 401, y la regla "un check que no pasa no se da por bueno"
  deja el cierre en FAIL. Es como firmar un contrato que dice "no se cambia ningún mueble" y después aprobar mover uno:
  hay que anotarlo en el contrato, no solo en el plano.
- **H2:** sin la herramienta de cobertura, T016 no puede medir el 80 %. Ya pasó con `db-backups`: la primera
  verificación salió FAIL justamente por esto.
- **H3:** el principio 4 pide algo que el proyecto no tiene. Si no se decide ahora, T016 tendría que marcar FAIL o
  "no corrido" en un punto que este cambio no puede arreglar.

## Ruteo recomendado

| Fase | Hallazgos | Qué haría falta | Costo de dejarlo |
| --- | --- | --- | --- |
| `specify` | H1, L1, (L2) | Enmendar la spec: AC-6 y *Non-goals* nombran la única excepción (fila 15), corregir "401" → "403" del origen y, si se quiere, anotar la regla de carga parcial. Revisión en *Revisions* + aprobación de Hernán | El cierre falla AC-6 aunque el código haga lo acordado |
| `tasks` | H2, M1, M2 | Una tarea temprana: instalar `@vitest/coverage-v8` (comando para Hernán) y sumar `--coverage` al done-check de T016; reemplazar "tarea N" por `Txxx` en §3 y §7; decir qué secciones van en el brief de cada tarea delegada | Cobertura "no corrida" al cerrar; un worker que confunde tareas; Qwen sin la tabla de códigos |
| `constitution` | H3 (y H2 si no se quiere medir) | Enmendar el principio 4 al estado real (oxlint en el cliente; el server sin linter, con un pendiente) o decidir sumar el linter en un cambio aparte | T016 marca un FAIL que este cambio no puede resolver |
| `implement` | M3 | Al empezar: una rama por PR (`feat/error-codes-server`, …) y los worktrees de Qwen como hijos de esa rama | Commits automáticos en `main` y trabajo de Qwen en la rama equivocada |

Ningún hallazgo pide rehacer la arquitectura: el diseño (catálogo, mapa tipado, hook, navegación síncrona) cruza bien
con la spec y la constitución. Después de resolver los HIGH, alcanza con volver a correr `analyze`.
