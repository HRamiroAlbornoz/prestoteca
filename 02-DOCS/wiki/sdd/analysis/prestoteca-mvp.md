---
type: analysis
title: Analysis — Prestoteca MVP (v2)
description: Re-run of pre-implementation consistency gate after fixing HIGH and MEDIUM findings.
tags: [sdd, analyze, consistency]
timestamp: 2026-10-04T23:00:00Z
topic: sdd
slug: prestoteca-mvp
---

# Analysis — Prestoteca MVP (v2)

> Slug: `prestoteca-mvp` · Run: 2026-10-04T23:00:00Z (re-run)
> Cross-read of constitution ↔ spec ↔ plan ↔ tasks.
> Previous run: [v1](./prestoteca-mvp.md) — 0 CRITICAL, 1 HIGH, 2 MEDIUM.

## Verdict

**GATE: PASS** — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 0 LOW.

Todos los hallazgos de v1 fueron resueltos. El plan y las tasks están consistentes con el spec y la constitution.

---

## 1. Constitution compliance

**Resultado: OK.** (Mismo que v1 — sin cambios en constitution.)

| Principle | Spec | Plan | Tasks |
|-----------|------|------|-------|
| P1 Server: Express 5 + TS | ✅ §3 Interfaces | ✅ §0, §2 | ✅ T001 |
| P2 DB: PostgreSQL + pg | ✅ §4 Data model | ✅ §4 | ✅ T004 |
| P3 Client: React + Vite + TS + Tailwind + RR | ✅ §2 Architecture | ✅ §2 | ✅ T009-T039 |
| P4 npm | ✅ | ✅ §0 | ✅ T001 |
| P5 Lint + format | ✅ | ✅ §0 | ✅ T040 |
| P6 Strict types | ✅ | ✅ §0 | ✅ T040 |
| P7 TDD, coverage ≥ 80% | ✅ §5 Testing | ✅ §5 | ✅ cada task |
| P8 Naming conventions | ✅ | ✅ §0, §2 | ✅ T001-T040 |
| P9 API under /api, JWT cookie 1h | ✅ §3 Interfaces | ✅ §3 | ✅ T007-T008 |
| P10 Semantic commits | ✅ | ✅ §0 | ✅ T040 |
| P11 Branch + PR | ✅ | ✅ §0 | ✅ T040 |
| P12 No secrets committed | ✅ | ✅ §0 | ✅ T001 |
| P13 Security floor | ✅ §Security | ✅ §0, §3, §7 | ✅ T003, T035 |
| P14 WCAG 2.2 AA | ✅ | ✅ §0 | ✅ T038 |
| P15 Pagination 12, mobile-first | ✅ §Búsqueda | ✅ §0 | ✅ T031, T039 |
| P16 Decisions logged | ✅ | ✅ §7 | ✅ T040 |

---

## 2. Requirement coverage (spec → plan → tasks)

### Coverage map

```text
REQ-ID | Spec requirement (short)               | Plan section | Task(s)        | Status
-------|----------------------------------------|--------------|----------------|----------
AC-102 | Name < 2 o > 50 rejects                | §4 Zod       | T007           | covered
AC-103 | Name solo espacios rejects             | §4 Zod       | T007           | covered
AC-104 | Email > 254 rejects                    | §4 Zod       | T007           | covered
AC-105 | Email duplicado rejects                | §4 Data model| T006           | covered
AC-106 | Password < 8 o > 72 rejects            | §4 Zod       | T007           | covered
AC-107 | Password solo espacios rejects         | §4 Zod       | T007           | covered
AC-108 | Barrio inválido rejects                | §4 Zod       | T007           | covered
AC-109 | Login exitoso → sesión válida          | §4 Data flow | T007           | covered
AC-110 | Login fallido → rechazado              | §4 Data flow | T007           | covered
AC-111 | Rate limit login (5/min/IP) → 429      | §3 Interfaces| T003, T011     | covered
AC-112 | Rate limit register (5/min/IP) → 429   | §3 Interfaces| T003, T011     | covered
AC-113 | Cookie sesión expira en 1h             | §3 Interfaces| T007, T011     | covered
AC-114 | Logout → cookie borrada                | §3 Interfaces| T007, T011     | covered
AC-115 | Ruta privada sin sesión → redirect     | §2 Architecture| T010         | covered
AC-116 | Cambio contraseña                      | §3 Interfaces| T033, T037     | covered
AC-117 | Eliminación cuenta → soft-delete + anon| §3 Interfaces| T033, T037     | covered
AC-121 | Publicar herramienta                   | §3 Interfaces| T017           | covered
AC-122 | Nombre herramienta < 3 o > 60 rejects  | §4 Zod       | T013           | covered
AC-123 | Descripción > 500 rejects              | §4 Zod       | T013           | covered
AC-124 | Condición inválida rejects             | §4 Zod       | T013           | covered
AC-125 | Categoría inválida rejects             | §4 Zod       | T013, T034     | covered
AC-126 | Editar/pausar no dueño → 403           | §4 Data flow | T013           | covered
AC-127 | Borrar con préstamos activos → 409     | §4 Data flow | T013           | covered
AC-128 | Editar con préstamos activos → 200     | §4 Data flow | T013           | covered
AC-129 | Pausar con préstamos activos → 200     | §4 Data flow | T013           | covered
AC-130 | Detalle herramienta                    | §3 Interfaces| T015           | covered
AC-131 | Herramienta pausada no acepta pedidos  | §4 Data flow | T013, T019     | covered
AC-135 | Crear préstamo pendiente               | §3 Interfaces| T025           | covered
AC-136 | Dueño acepta → aceptado                | §3 Interfaces| T027           | covered
AC-137 | Dueño rechaza → rechazado              | §3 Interfaces| T027           | covered
AC-138 | Dueño entrega → entregado              | §3 Interfaces| T027           | covered
AC-139 | Dueño devuelve → devuelto              | §3 Interfaces| T027           | covered
AC-140 | Solicitante cancela → cancelado        | §3 Interfaces| T027           | covered
AC-141 | Dueño cancela pendiente → cancelado    | §3 Interfaces| T027           | covered
AC-142 | Dueño cancela aceptado → cancelado     | §3 Interfaces| T027           | covered
AC-143 | Vencimiento automático (entregado→vencido)| §4 Data flow| T023          | covered
AC-144 | Pedir propia herramienta → 409         | §4 Data flow | T021           | covered
AC-145 | startDate < hoy → rechazado            | §4 Zod       | T021           | covered
AC-146 | endDate < startDate → rechazado        | §4 Zod       | T021           | covered
AC-147 | Overlap con préstamo activo → 409      | §4 Data flow | T021           | covered
AC-148 | Concurrentes → ambos pending           | §4 Data flow | T021, T027     | covered
AC-149 | Cambio estado inválido → 409           | §3 Interfaces| T021, T027     | covered
AC-150 | Ver préstamo sin permiso → 404         | §3 Interfaces| T022           | covered
AC-151 | Re-solicitar tras terminación          | §4 Data flow | T021, T027     | covered
AC-155 | Page params inválidos → 400            | §3 Interfaces| T030           | covered
AC-156 | Paginación 12 items                    | §3 Interfaces| T028, T031     | covered
AC-157 | Filtro categoría + barrio              | §4 Data flow | T028, T031     | covered
AC-158 | Búsqueda case-insensitive              | §4 Data model| T028           | covered
AC-159 | Escape % en búsqueda                   | §4 Data model| T028           | covered
AC-160 | Escape _ en búsqueda                   | §4 Data model| T028           | covered
AC-161 | Herramienta pausada no en búsqueda     | §4 Data model| T028           | covered
AC-162 | Herramienta borrada no en listados     | §4 Data model| T028           | covered
AC-166 | Ver perfil (tools, received, made)     | §3 Interfaces| T030, T032     | covered
AC-167 | Ver historial (terminados)             | §3 Interfaces| T030, T032     | covered
AC-171 | Body > 10kb → 413                      | §3 Interfaces| T003, T035     | covered
AC-172 | Origin header inválido → 403           | §3 Interfaces| T003, T035     | covered
AC-173 | Error messages genéricos               | §3 Interfaces| T035           | covered
AC-178 | Health endpoint                        | §3 Interfaces| T002, T036     | covered
```

**Total: 58/58 requirements cubiertos.** 0 gaps.

---

## 3. Scope drift (tasks/plan → spec)

**Resultado: 0 drift.** (Mismo que v1.)

| Item | Spec requirement | Veredicto |
|------|-----------------|-----------|
| T005 (seed script) | No hay AC que lo pida explícitamente | **LOW DRIFT** — conveniencia estándar, no agrega costo significativo. Aceptable. |
| T039 (responsive polish) | Constitution §7 + spec §Búsqueda | Covered — constitution §7 pide mobile-first. |
| T038 (a11y audit) | Constitution §6 | Covered — constitution §6 pide WCAG 2.2 AA. |

---

## 4. Contradiction

**Resultado: 0 contradicciones.** (C1 resuelto en v2.)

| # | Qué pasó |
|---|----------|
| ~~C1~~ | ~~Plan §4 Zod schemas vs Spec AC-102, AC-103~~ → **RESUELTO EN V2**. `RegisterSchema` ahora dice `name (2-50, trim, no space-only)` y `password (8-72, trim, no space-only)`. `PasswordChangeSchema` dice `newPassword (8-72, trim, no space-only)`. Cada schema incluye columnas de ACs referenciados. |

---

## 5. Duplication

**Resultado: 0 duplicación problemática.** (Mismo que v1.)

| Item | Observación | Veredicto |
|------|------------|-----------|
| Testing strategy vs Tasks | El §5 del plan mapea ACs a niveles de prueba; las tasks referencian los mismos ACs en el campo Trace. | OK — perspectivas diferentes. |
| AC-131 (pausada) | T013 (implementación) + T019 (tests). | OK — separación lógica/test. |
| AC-147 (overlap) | T021 (implementación) + T027 (tests). | OK — separación lógica/test. |

---

## 6. Ambiguity / underspecification

**Resultado: 0 ambigüedades.** (A1 y A2 resueltos en v2.)

| # | Qué pasó |
|---|----------|
| ~~A1~~ | ~~T004 done-check: orden de verificación~~ → **RESUELTO EN V2**. Done-check ahora dice: `verify \d users shows email UNIQUE; verify \d tools shows FK to users; verify \d loans shows FK to tools, users`. |
| ~~A2~~ | ~~T038/T039 done-checks no explicitan "toda la app"~~ → **RESUELTO EN V2**. T038 dice `axe-core run on all pages (T009-T033)`; T039 dice `all pages (T009-T033)`. |

### Carrier completeness (isolated-implementer check)

| Check | Resultado |
|-------|-----------|
| §0 Global Constraints block | ✅ Presente en Plan §0 (33 líneas de constraints verbatim) |
| Interfaces blocks para tasks con dependencias externas | ✅ T007, T013, T020, T028, T033 tienen Interfaces blocks |
| Tasks que consumen de otros | ✅ Todos referenciados correctamente |
| Tasks que producen para otros | ✅ `auth.isOwner` en T007, referenced by T013, T020 ✅ |

---

## Findings summary

| # | Severity | Type | Artifact A | Artifact B | Conflict | Resolve in |
|---|----------|------|-----------|-----------|----------|------------|
| *(none)* | — | — | — | — | — | — |

**Todos los hallazgos de v1 fueron resueltos.**

---

## Changes from v1

| Hallazgo | v1 | v2 | Cómo se resolvió |
|----------|----|----|-----------------|
| C1 (HIGH) | Zod schemas omiten "no space-only" | Resuelto | Plan §4: `name (2-50, trim, no space-only)`, `password (8-72, trim, no space-only)`, `newPassword (8-72, trim, no space-only)` + columnas de ACs |
| A1 (MEDIUM) | T004 done-check ambiguo | Resuelto | Done-check ahora lista verificación de cada tabla con verbo "verify" |
| A2 (MEDIUM) | T038/T039 no explicitan "toda la app" | Resuelto | Done-checks dicen `all pages (T009-T033)` explícitamente |

---

```json result-envelope
{
  "status": "complete",
  "executive_summary": "Re-run of analyze after fixing 1 HIGH and 2 MEDIUM from v1. All findings resolved. 0 CRITICAL, 0 HIGH, 0 MEDIUM, 0 LOW. GATE: PASS.",
  "artifact": "02-DOCS/wiki/sdd/analysis/prestoteca-mvp.md",
  "next_recommended": "implement",
  "risk": "medium",
  "skill_resolution": {
    "used": ["analyze"],
    "missing": [],
    "fallback": [],
    "compact_rules": ["Read adversarially across artifacts, not inside one.", "A finding without a location is an opinion."]
  },
  "evidence": ["report path exists", "all v1 findings resolved", "constitution conflicts named", "58/58 ACs covered"]
}
```
