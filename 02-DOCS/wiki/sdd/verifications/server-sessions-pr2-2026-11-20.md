---
type: verification
title: server-sessions — verificación del PR 2 (cliente), staging y producción (T015)
description: Puerta de push de tier 2, panel de cierre en dos rondas, revisión a mano en staging y deploy en producción del PR 2 (#53). PASS.
tags: [sdd, verification, auth, session, staging, client]
timestamp: 2026-11-20T08:30:00Z
topic: sdd
slug: server-sessions
---

# server-sessions — verificación del PR 2 (cliente), staging y producción (T015)

> Tarea T015 del [plan](../plans/server-sessions.md) · [spec](../specs/server-sessions.md) ·
> [progreso](../progress/server-sessions.md) · verificación del PR 1: [server-sessions-2026-11-19](./server-sessions-2026-11-19.md).
> PR #53, rama `feat/server-sessions-client` (borrada), merge `2821bec`.

**Veredicto (2026-11-20): PASS** (ver el final).

**Reglas de este archivo:** nunca va el valor de una cookie, de un secreto ni de la contraseña de prueba. Todo comando
de Railway lleva `-e staging` o `-e production` explícito; la CLI es `~/.railway/bin/railway.exe`.

## 1. Qué trae el PR 2

| Tarea | Qué | Criterios |
| --- | --- | --- |
| T012 | Casilla "Recordarme" en `LoginPage`; el login manda siempre `remember: true/false` | AC-20, AC-26 (lado cliente), AC-29, AC-31 |
| T013 | `ConfirmDialog`, diálogo de confirmación reutilizable (Qwen, opción D) | AC-18 |
| T014 | `OtherSessionsSection` en Configuración: un `DELETE /api/me/other-sessions` con sus mensajes | AC-11, AC-18, AC-19, AC-32 |
| T015a | Dos pruebas del panel de cierre: el `replace` de `PrivateRoute` y un solo error de carga (Qwen, opción D) | AC-31 |

Sin migración ni variables nuevas. Dependencia nueva de desarrollo: `@testing-library/user-event`.

## 2. Puerta de push de tier 2

| Paso | Resultado |
| --- | --- |
| 1. Spec ligada a la rama | `branch: feat/server-sessions-client` (commit automático `9a1962a`) ✅ |
| 2. `verify` | cliente `22 passed`, `540 passed`; server `37 passed`, `817 passed`; `tsc -b` 0 y lint 0 en los dos ✅ |
| 2. Cobertura por archivo cambiado (líneas / ramas) | `ConfirmDialog.tsx` 100 / 96,96 · `OtherSessionsSection.tsx` 100 / 96,42 · `LoginPage.tsx` 100 / 92,85 · `ProfilePage.tsx` 89,92 / 84,8 → todos ≥ 80 % ✅ |
| 3. `rsc risk --base origin/main` | tier 2 (clase `auth` por `client/src/session.test.tsx`), 3 revisores, aprobación humana ✅ |
| 4. `rsc spec gate` | `1/1 pass` ✅ |
| 5. Panel de 3 + ledger | dos rondas (abajo); `server-sessions/pr2-client` registrado sobre `354b0b3`, después del último commit de código ✅ |
| 6. Aprobación humana | Hernán, 2026-11-20 ✅ |

La línea `escalate: asdd` de `rsc risk` sale siempre que el tier es 2 (`scripts/lib/risk.js:55`); el que exige la spec
es el guard de push, que no frenó el push.

## 3. Panel de cierre

**Ronda 1 (rama entera):** seguridad APPROVE (0 hallazgos); corrección APPROVE WITH NITS (`res.ok` en vez de `204`,
ya anotado en T014); pruebas APPROVE WITH NITS, con el mapa AC → prueba completo y dos huecos: N1, ninguna prueba
fijaba el `replace` de `PrivateRoute`; N2, los ayudantes del error de carga no prohibían el mensaje duplicado dentro
del panel. Los dos se cerraron en T015a (`354b0b3`), escrita por Qwen desde un brief con tres revisiones de ojos
frescos, en un solo intento.

**Ronda 2 (`354b0b3`):** pruebas APPROVE (sin `replace` falla solo la prueba nueva; estable con orden aleatorio);
seguridad APPROVE; corrección APPROVE WITH NITS (los ayudantes prohíben cualquier alerta con texto dentro del panel,
también una legítima de contraseña o de sesiones; hoy ninguna prueba junta los dos estados).

## 4. Staging (2026-11-20)

- Deploy: `railway up -e staging --service prestoteca --ci` desde `85286ac` → `Deploy complete`. Producción siguió en
  `03b1635` mientras tanto.
- Bundle servido `assets/index-ZsIom9ol.js` con "Recordarme", "Cerrar sesión en los otros dispositivos" y "Cerramos la
  sesión en tus otros dispositivos".
- `node server/scripts/smoke.mjs https://prestoteca-staging.up.railway.app` → `SMOKE OK`, exit 0.

**Revisión a mano** (Claude con Chrome, pedido por Hernán; cuenta `qa-sessions-pr2@example.com` creada con su
confirmación y borrada al final):

| Qué | Resultado |
| --- | --- |
| Login | "Recordarme" desmarcada y con etiqueta; `aria-describedby="remember-help"`; texto de ayuda debajo, 12 px, contraste 6,91:1 en modo oscuro; foco con Tab visible (anillo violeta de 2 px); barra espaciadora y clic en la etiqueta la cambian ✅ |
| 320 px | sin scroll horizontal; casilla 24 × 24 px; fila de 44 px; texto de ayuda en 2 líneas. Medido con un iframe de 320 px (la ventana maximizada no se pudo achicar), no en un teléfono real ✅ |
| Cuerpo del login | `remember: true` (booleano) con la casilla marcada → 200 ✅ |
| Sesión B sin "Recordarme" (por `curl`) | `Set-Cookie` `HttpOnly; Secure; SameSite=Lax`, sin `Max-Age` ✅ |
| Diálogo solo con teclado | Enter lo abre; nombre "¿Cerrar la sesión en tus otros dispositivos?", descripción, `aria-modal`; foco en "Cancelar"; Tab y Shift+Tab dan la vuelta adentro; Escape lo cierra, el foco vuelve al botón y B sigue en 200 ✅ |
| Confirmar (con el `DELETE` demorado 3 s desde la página) | `aria-busy`, los dos botones deshabilitados, foco en el panel; 204; texto de éxito en la región `status`; foco de vuelta en el botón; **B → 401, A → 200** ✅ |
| Cambiar de pestaña mientras espera | el fondo del diálogo tapa las pestañas; "atrás" del navegador en plena espera deja la app en `/`, sin alertas ni aviso de sesión, con la sesión abierta y sin errores en la consola ✅ |
| Limpieza | `DELETE /api/me/account` → 204; `/api/me` → 401; login con esa cuenta → 401; archivos temporales borrados ✅ |

**Observación (no bloquea):** mientras espera, el foco está en el panel del diálogo sin indicador visible, y la única
señal visual es que los botones se atenúan (el lector de pantalla tiene `aria-busy`). Mejora posible: "Cerrando…" en
el botón de confirmar mientras espera.

## 5. Producción (2026-11-20)

- Merge de #53 con squash → `2821bec`; rama borrada en local y en GitHub.
- Deploys: producción SUCCESS `main` `2821bec`; staging SUCCESS `main` `2821bec` (volvió a seguir `main`).
- Bundle servido en producción `assets/index-ZsIom9ol.js` (el mismo que se probó en staging) con los tres textos.
- `node server/scripts/smoke.mjs https://prestoteca-production.up.railway.app` → `SMOKE OK`, exit 0.

## Veredicto (2026-11-20): PASS

Puerta de tier 2 completa, panel de cierre aprobado en dos rondas, revisión a mano en staging sin fallas y producción
desplegada con el smoke en verde. Criterios del cliente cubiertos con prueba y vistos en staging: AC-11, AC-18, AC-19,
AC-20, AC-26 (lado cliente), AC-29, AC-31, AC-32.

**Pendiente:**
- T016: las dos suites, `tsc`, lint y cobertura sobre `main` (Qwen corre y reporta, Claude confirma).
- Sacar `JWT_SECRET` de Railway en los dos entornos cuando el PR 2 lleve una semana estable (desde el 2026-11-27).
- Mejora opcional: indicador visible de espera en el diálogo.
