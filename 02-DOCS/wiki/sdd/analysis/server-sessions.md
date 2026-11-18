---
type: analysis
title: Analyze — server-sessions (control cruzado antes de implementar)
description: Cruce de constitución v1.3.0, spec server-sessions (AC-1 a AC-37), plan y tareas T001-T016.
tags: [sdd, analysis, auth, session]
timestamp: 2026-11-18T23:59:00Z
topic: sdd
slug: server-sessions
---

# Analyze — server-sessions

> Constitución: [v1.3.0](../constitution.md) · Spec: [server-sessions](../specs/server-sessions.md) (approved, AC-1 a
> AC-37) · Plan + tareas: [server-sessions](../plans/server-sessions.md) (approved, T001-T016) · Corrida 2, 2026-11-18

## Veredicto

**GATE: PASS** (corrida 2) — 0 CRITICAL abiertos, 0 HIGH, 0 MEDIUM, 0 LOW abiertos.

- **Corrida 1** (misma fecha): BLOCKED — 1 CRITICAL (F1), 1 MEDIUM (F2), 4 LOW (F3-F6). Detalle en la tabla de abajo.
- **Resolución:** F1 aceptado conscientemente por Hernán con la opción C (decisión [D15](../decisions.md): Zod en
  todas las rutas como feature propia, anotada en el backlog). F2, F3, F4 y F6 corregidos en el plan (ver su
  *Revisions*, "arreglos de `analyze`"). F5 aceptado, ya cubierto por D14.
- **Corrida 2:** se verificó que cada arreglo está en el plan (§0 con los valores de accesibilidad y 320 px, la frase
  de tier, `ACTIVE_SESSION_CONDITION` en §0 y en las interfaces de T003, el borrado de cuentas de prueba en T009, la
  nota del smoke en T010) y que no introducen contradicciones nuevas. Sin hallazgos nuevos.

## Mapa de cobertura (spec → plan → tareas)

| Criterio | Qué pide (corto) | Plan | Tareas | Estado |
| --- | --- | --- | --- | --- |
| AC-1, AC-2, AC-3 | plazo de 7 d, bordes, renovación | §0, §3.1, §3.2, §5 | T002, T003, T009 | covered |
| AC-4, AC-5 | logout anula solo esta sesión | §3.4, §5 | T004, T009 | covered |
| AC-6, AC-7 | cerrar las otras, sin tocar otra cuenta | §3.2, §3.4, §5 | T003, T004, T009 | covered |
| AC-8, AC-27 | contraseña cierra las otras, conserva modo | §3.2, §3.4, §5 | T003, T004, T009 | covered |
| AC-9, AC-33 | cuenta borrada: sin sesiones guardadas | §3.2b, §3.4, §5 | T001, T003, T004, T009 | covered |
| AC-10 | cookie JWT vieja → 401 | §0, §3.3, §5 | T004, T006, T009 | covered |
| AC-11, AC-32 | errores de "cerrar las otras" (39, 35) | §3.5, §5 | T014 | covered |
| AC-12, AC-30 | logout idempotente; base caída no da éxito | §3.4, §5 | T004 | covered |
| AC-13, AC-16 | `Origin` y sin sesión en la ruta nueva | §3.4, §5 | T004 | covered |
| AC-14, AC-21, AC-22 | atributos y vencimiento de la cookie | §0, §3.1, §5 | T002, T004, T009 | covered |
| AC-15, AC-36 | concurrencia; logout no revive | §2, §3.2, §5 | T003, T009 | covered |
| AC-17 | base caída en el middleware | §3.3, §5 | T004 | covered |
| AC-18, AC-19 | diálogo accesible; éxito sin otras sesiones | §3.5, §5 | T013, T014 (T004 lado server de AC-19) | covered — ver F2 |
| AC-20 | casilla "Recordarme" accesible | §3.5, §5 | T011, T012 | covered — ver F2 |
| AC-23, AC-24, AC-26 | modo corto, registro, sin `remember` | §0, §3.4, §5 | T002, T004 | covered |
| AC-25 | `remember` inválido → 400 | §0, §3.4, §5 | T004 | covered — ver F1 |
| AC-28, AC-34 | login/registro anulan la sesión previa | §3.4, §5 | T004 | covered |
| AC-29, AC-31 | cookie inútil al cargar (pública, privada) | §3.3, §3.5, §5 | T004, T012 | covered |
| AC-35 | identificador imposible de adivinar | §0, §3.1, §5 | T001, T002 | covered |
| AC-37 | retención ≤ 1 h tras vencer | §3.2, §5, §6 paso 5 | T005, T009 | covered |

Sin **GAP**: los 37 criterios tienen plan y tarea. Sin **DRIFT** con costo: lo que el plan agrega sin un criterio
directo (formato de la cookie, `FOR SHARE`, purga al arrancar, quitar el encabezado `Bearer`) se deriva de un
criterio o de un *non-goal* de la spec (ver F5).

## Hallazgos (corrida 1, con su estado después de la corrida 2)

Estado: F1 **aceptado (D15)** · F2 **resuelto** · F3 **resuelto** · F4 **resuelto** · F5 **aceptado (D14)** · F6
**resuelto**.

| # | Severidad | Tipo | Artefacto A (lugar) | Artefacto B (lugar) | Conflicto | Resolver en |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | CRITICAL | Constitución | constitución, principio 13 ("All external data validated server-side (Zod schemas, length limits, safeParse)") | plan §3.4 y T004 (`remember` validado con `typeof`); código: ninguna ruta usa Zod (solo `server/src/modules/config/env.ts`) | el plan suma un dato de entrada nuevo validado sin Zod, siguiendo el patrón real de `authRoutes.ts`, que ya no cumple el principio | `constitution` (enmendar a la práctica real) **o** `plan`/`tasks` (validar el cuerpo del login con Zod en T004) |
| F2 | MEDIUM | Ambigüedad (portador) | constitución, principios 14 y 15 (área táctil ≥ 24×24 px, contraste 4,5:1 y 3:1, foco visible, base a 320 px) | plan §0 y las interfaces de T012, T013, T014 | esos valores no están en §0: Qwen (T012, T013) solo ve su tarea y §0, así que no los ve | `tasks` (copiar los valores a §0 o a las interfaces) |
| F3 | LOW | Contradicción | plan §0 ("todo el cambio es tier 2 (`rsc risk` …)") | tareas: `rsc risk` da tier 1 en T007 y T011-T014 | la frase de §0 no es lo que mide la herramienta; la puerta del PR 2 queda más estricta de lo que el guard exige, lo que está bien, pero el texto lo atribuye a `rsc risk` | `tasks` (decir "el PR 2 se trata como tier 2 por decisión, aunque sus tareas midan 1") |
| F4 | LOW | Ambigüedad | plan §6 paso 9 (cuentas `qa-sessions-*` en staging) y paso 10 (smoke en producción) | backlog, punto 7 (cuentas de prueba acumuladas en producción, ya limpiadas) | no se dice cuándo se borran las cuentas de prueba de staging; `smoke.mjs` en producción deja una fila anonimizada ("Usuario eliminado") | `tasks` (agregar el borrado de las cuentas de prueba a T009 y anotar la fila de T010) |
| F5 | LOW | Alcance | plan §3.3 (deja de leer `Authorization: Bearer`) | spec *Non-goals* ("Sesión en apps nativas … La app es solo web") | quita una capacidad que existe hoy; no es drift porque la spec la excluye, pero conviene que quede escrito como decisión | aceptar (ya está en D14) |
| F6 | LOW | Ambigüedad (portador) | plan §0 (el fragmento SQL "exportado por `SessionRepository`") | interfaces de T003 ("el fragmento SQL exportado de §0") | el nombre del export no está; T003 lo crea y lo usa solo, así que no rompe nada, pero el revisor no puede chequear un nombre | `tasks` (nombrarlo, p. ej. `ACTIVE_SESSION_CONDITION`) |

### Por qué importa F1

La constitución gana por definición, así que una tarea que valida un dato nuevo sin Zod viola una regla escrita. Pero
la regla tampoco se cumple hoy en ninguna ruta del server, así que pedir Zod solo para `remember` dejaría el
formulario de login con dos estilos de validación en el mismo archivo. Es el mismo caso que resolvió D8 con el
linter: una regla que nadie puede cumplir enseña a ignorar las reglas.

- **Opción A — enmendar el principio 13** a lo que hace el código: validación en el server con chequeos de tipo y
  largo explícitos por campo, y Zod donde ya está (variables de entorno, formularios del cliente). Costo: ninguno en
  el código. Riesgo: la regla queda más débil por escrito, aunque no en la práctica.
- **Opción B — Zod en el cuerpo del login y del registro dentro de T004.** Costo: T004 crece (y ya es la tarea más
  grande); hay pruebas que afirman los textos de desarrollo de esas validaciones (`originWiring.test.ts:64`) y no
  pueden cambiar. Riesgo: mezclar un refactor de validación con el cambio de sesiones.
- **Opción C — Zod en todas las rutas como cambio propio,** después de server-sessions, y aceptar F1 conscientemente
  para este ciclo (anotado en el backlog). Costo: una feature más. Riesgo: ninguno para este ciclo.

**Recomendación:** C, con la aceptación anotada en `decisions.md` por la fase que la tome. Mantiene T004 enfocada y
no debilita la regla.

### Por qué importa F2

Qwen implementa T012 y T013 viendo solo su tarea y §0. Sin el área táctil de 24×24 px, una casilla o los botones del
diálogo pueden quedar chicos en un celular, y ni la prueba ni el revisor por tarea lo van a buscar si el valor no
está escrito donde miran.

## Ruteo recomendado

- **`constitution` o decisión de aceptación (F1):** elegir A, B o C. B además vuelve a `tasks` para ampliar T004.
- **`tasks` (F2, F3, F4, F6):** cuatro ajustes de texto en el plan, sin cambiar el diseño.
- **Aceptar (F5):** ya cubierto por D14.

Hecho: corrida 2 en PASS. Lo próximo es `implement`, empezando por T001 y T002 (paralelos) con Qwen.
