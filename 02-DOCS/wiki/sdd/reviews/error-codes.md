---
type: review
title: error-codes — revisión de cierre (PR 3)
description: Revisión de cierre de la rama feat/error-codes-screens contra la spec. Panel de 3, tier 2. APPROVE WITH NITS, sin bloqueantes.
tags: [sdd, review, errors]
timestamp: 2026-11-12T19:55:00Z
topic: sdd
slug: error-codes
---

# error-codes — revisión de cierre (PR 3)

> [Spec](../specs/error-codes.md) · [plan](../plans/error-codes.md) ·
> [verificación de cierre](../verifications/error-codes-2026-11-12.md) · [progreso](../progress/error-codes.md)

**Veredicto (2026-11-12): APPROVE WITH NITS.** 7 hallazgos: 0 bloqueantes, 0 para corregir, 5 nits y 2 preguntas.

- **Qué se revisó**: `git diff 3fe39aa...f4b8756`, que es el PR 3 (T010-T016). Los PR 1 y 2 ya están en `main`.
- **Riesgo**: `rsc risk --base origin/main` → **tier 2** (clases auth, default y docs), 3 revisores, y el merge
  necesita aprobación humana.
- **Spec**: vinculada a la rama (`branch: feat/error-codes-screens`); `rsc spec gate` → PASS.
- **Ronda**: 1 de 3. Panel registrado con `rsc review ledger panel error-codes/closing --lenses correctness,security,tests`.
- **Revisores**: tres subagentes sin el contexto de la implementación. Cada uno recibió el contrato de la tarea, la
  spec, el commit exacto y el comando para volver a correr los checks.
- **Consolidación**: `rsc review consolidate` → 7 reportados → 7 únicos → 0 al `finding-verifier` (no hubo
  bloqueantes ni para corregir).

## Qué atacó cada lente

| Lente | Qué miró | Resultado |
| --- | --- | --- |
| Corrección | sesión (`useApiError`, `AuthContext`, `NavBar`, `App`); `returnTo`; regla de dos pedidos (Perfil, Mis préstamos); búsquedas viejas en el inicio; error de carga contra error de acción en 4 pantallas; cada AC del PR 3 contra el código, no contra los tests. Volvió a correr el cliente: 458/458, `tsc -b` y lint limpios | 3 nits, 1 pregunta |
| Seguridad | redirección abierta por `returnTo` (`//host`, `/\`, caracteres de control, URLs absolutas, `javascript:`, formas codificadas); aviso de sesión falsificado; estado después de un 401 o de un "Salir" fallido; texto del server en pantalla; filtración entre usuarios; secretos o datos personales en la verificación y las capturas | limpio |
| Tests | 55 mutantes con la suite completa: 49 detectados, 2 sobrevivientes; mapa AC → test que puede fallar; nombres de `it(` de 11 archivos contra `3fe39aa` (ninguno borrado ni aflojado: los 10 nombres que faltan son renombres o tests más estrictos) | 2 nits, 1 pregunta |

## Hallazgos y cómo se cerraron

| Ledger | Sev. | Dónde | Hallazgo | Cierre |
| --- | --- | --- | --- | --- |
| L62 | nit | `NavBar.tsx:78` | El `currentUser &&` del aviso de "Salir" fallido no tiene test | **intentional**. Es repetido de L45 (T010), ya aceptado: solo cambia algo si la sesión termina por otro camino con el aviso en pantalla |
| L63 | nit | `noServerText.test.ts:22` | La guardia busca texto, no estructura: `setError(data.message)` se le escaparía | **intentional**. Es el diseño de AC-10 del plan; en la revisión de T015 ya se amplió a `error|err|e` y a más frases en inglés. Hoy no hay ningún infractor |
| L64 | nit | `useApiError.ts:36` | Las dependencias del `useCallback` de `handle` no están fijadas por un test | **irrelevant**. El código es correcto; ninguna pantalla de hoy llega a un `returnTo` viejo |
| L65 | nit | `ProfilePage.tsx:297` | Con error de carga, abajo sigue el texto de vacío ("No tenés herramientas publicadas") | **irrelevant** para este cambio: ya pasaba antes. Seguimiento propuesto |
| L66 | nit | `ToolDetailPage.tsx:80` | `loadError` no se reinicia si cambia el `:id` sin desmontar | **irrelevant**: anterior al cambio y sin enlace en la app que lo dispare (igual que L57, L58 y L61) |
| L67 | pregunta | `App.tsx:45` | Sacar `useTransitions={false}`, o invertir `navigate`/`markSignedOut`, deja la suite en verde: jsdom agrupa las dos llamadas | **intentional**. La decisión vale y el navegador real la muestra funcionando: en staging, la sesión terminada llevó al login **con** el aviso ([captura 2a](../verifications/error-codes-2026-11-12/2a-session-ended-login.png)). Lo que no hay es un test que falle si se quita. Seguimiento propuesto: un e2e en navegador real |
| L68 | pregunta | `AuthContext.tsx:36` | Un `/api/me` con 429 o 500 al abrir la app se trata como "sin sesión" | **intentional**: el plan lo dejó igual a propósito |

## Seguimientos propuestos (fuera de este PR)

1. Ocultar el estado vacío cuando hay error de carga en Perfil y en Mis préstamos (L65).
2. Un test en navegador real (e2e) del recorrido "sesión terminada → login con aviso → vuelta", que fije
   `useTransitions={false}` y el orden `navigate` → `markSignedOut` (L67).
3. Foco del teclado después de la redirección al login (observación 1 de la verificación).

`rsc review ledger stats` después de esta ronda: 66 hallazgos únicos, 2 repetidos detectados, tasa de falsos 0 %,
ningún hallazgo abierto.
