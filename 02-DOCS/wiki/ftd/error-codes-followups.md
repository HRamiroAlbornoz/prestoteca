---
author: HRamiroAlbornoz
branch: feat/error-codes-followups
spec: error-codes
status: in-progress
---
# Seguimientos de error-codes: error de carga con Reintentar y foco al cambiar de pantalla

## Intent

Dos seguimientos que propuso la [revisión de cierre de error-codes](../sdd/reviews/error-codes.md), aprobados por
Hernán el 2026-11-12.

1. **Error de carga (L65).** En Perfil y en Mis préstamos, cuando la carga falla, hoy se ve el error y abajo las
   pestañas con "(0)" y "No tenés herramientas publicadas" o "No tenés préstamos solicitados". Eso es falso: no es
   que no haya nada, es que no se pudo cargar. Pasa a verse solo el error, con un botón **Reintentar**.
2. **Foco al cambiar de pantalla.** Hoy la app nunca mueve el foco del teclado, así que queda en el enlace que se
   tocó (en staging quedó en "Crear cuenta" después de la redirección al login). Una persona que usa lector de
   pantalla no se entera de que cambió la página. Pasa a moverse el foco al contenido principal (`<main>`) cada vez
   que cambia la pantalla.

## Scope

**Entra:**
- `MyLoansPage.tsx`: con error de carga se ven el título, el error y un botón "Reintentar". No se ven las pestañas
  "Pedí (0)" / "Me pidieron (0)" ni el mensaje de vacío. "Reintentar" vuelve a pedir los dos listados (con la misma
  regla de dos pedidos de hoy) y mientras tanto muestra "Cargando...".
- `ProfilePage.tsx`: con error de carga se ven el título, el error, el botón "Reintentar" y **solo** la pestaña
  "Configuración" (sin contador), elegida. Cambiar la contraseña y borrar la cuenta no dependen de los datos que
  fallaron, así que siguen disponibles. Las pestañas de datos ("Mis herramientas", "Pedidos recibidos", "Pedidos
  hechos", "Historial") no se ven. "Reintentar" vuelve a pedir todo; si sale bien, vuelven las cinco pestañas.
- `App.tsx`: cuando cambia la **dirección** (`location.pathname`), el foco va a `<main id="main">`, que ya tiene
  `tabIndex={-1}`. No se mueve en la primera carga de la app, ni cuando solo cambian los parámetros (`?q=`,
  `?page=`: el inicio los cambia mientras se escribe en la búsqueda y le sacaría el foco al campo), ni cuando
  solo cambia el `#` (el enlace "Saltar al contenido" ya lo resuelve).
- Tests de cada caso, con el ID en el nombre (ver Checklist).

**No entra:**
- El test en navegador real (e2e) del recorrido de sesión: Hernán eligió dejarlo para más adelante, como feature
  aparte (Playwright y dónde corre).
- Cambiar el título de la pestaña del navegador (`document.title`) por pantalla.
- Otras pantallas con error de carga: Detalle de herramienta, Detalle de préstamo y Editar ya ocultan los datos
  cuando la carga falla.
- Que el error de carga se resuelva solo (reintento automático).

**Quién:** el código lo escribe Qwen (OpenCode vía Orca), un pedido por ítem, lanzado después de preguntarle a
Hernán. Claude corre los checks, revisa el diff y aplica la revisión que pida `rsc risk`.

## Checklist

- [ ] **F1 — Mis préstamos con error de carga.** Tests en `myLoans.test.tsx`:
  - F1a: un listado da 500 → se ve el único `role="alert"` con el texto de `INTERNAL_ERROR` y un botón
    "Reintentar"; no hay `role="tab"` ni "No tenés préstamos solicitados".
  - F1b: "Reintentar" con el server ya bien → se ven los dos listados con sus contadores reales y no queda el error.
  - F1c: "Reintentar" que vuelve a fallar → sigue el error, sigue el botón, y se hicieron 4 pedidos en total.
  - F1d: un 401 `SESSION_REQUIRED` al reintentar → lleva al login (la misma regla de hoy).
  - Prueba: los tests nuevos fallan contra el código de hoy y pasan después; la suite del cliente en verde.
- [ ] **F2 — Perfil con error de carga.** Tests en `profilePage.test.tsx`:
  - F2a: la carga da 500 → error + "Reintentar"; la única pestaña es "Configuración", elegida, sin "(0)"; no se ve
    "No tenés herramientas publicadas".
  - F2b: desde ese estado se puede cambiar la contraseña (el formulario está y envía).
  - F2c: "Reintentar" con el server ya bien → vuelven las cinco pestañas con sus contadores y no queda el error.
  - F2d: "Reintentar" que vuelve a fallar → sigue el error.
  - Prueba: los tests nuevos fallan contra el código de hoy y pasan después; la suite del cliente en verde.
- [ ] **F3 — Foco al cambiar de pantalla.** Tests con el `App` real (como `App.test.tsx` / `session.test.tsx`):
  - F3a: clic en un enlace de la barra que cambia la dirección → `document.activeElement` es `<main>`.
  - F3b: primera carga de la app → el foco **no** está en `<main>`.
  - F3c: en el inicio, escribir en la búsqueda (cambia `?q=`) → el foco sigue en el campo de búsqueda.
  - F3d: sesión terminada → redirección a `/login?returnTo=…` → el foco está en `<main>` y el aviso sigue en
    `role="alert"`.
  - Prueba: F3a y F3d fallan contra el código de hoy; F3b y F3c pasan antes y después; suite en verde.
- [ ] **Controles:** `npx vitest run`, `npx tsc -b` y `npm run lint` en `client/` en verde; `axe` sin violaciones en
  los tests de accesibilidad; `rsc risk` del diff y la revisión que pida.
- [ ] **Staging:** Perfil y Mis préstamos con un error forzado no se pueden provocar en staging sin tocar el
  server, así que alcanzan los tests. El foco sí se prueba a mano en staging (navegar por la barra y por la
  redirección al login), con captura.

## Evidence

### F1 — ronda 1 (2026-11-12, commit `5886274`)

- **Hecho por:** Qwen, en el worktree `f1-myloans-retry` (base `ee048f0`). Tocó solo sus 2 archivos, no borró ningún
  `it(` y mandó `worker_done`. Escribió la pantalla antes que los tests (el pedido pedía al revés), así que Claude
  comprobó el rojo por su cuenta.
- **Rojo (Claude):** F1a-F1e contra el `MyLoansPage.tsx` de `ee048f0` → 5 fallan, 19 pasan.
- **Mutantes (Claude), todos detectados:** sin `reloadKey` en las dependencias → 4 tests fallan; sin
  `setError('')` → F1b, F1e; sin `setLoading(true)` → F1e; pestañas junto al error → F1a-F1e. (La primera pasada
  de M3/M4 no se aplicó por los CRLF del archivo; se repitió contando las coincidencias.)
- **Test viejo que chocaba:** `accessibility.test.tsx` "tabs have ARIA roles" pasaba con la pantalla en error (el
  `fetch` del archivo nunca daba listas válidas). Qwen lo reportó sin tocarlo, como pedía el pedido; Claude lo
  ajustó para que simule dos listas vacías válidas.
- **Controles en `main`:** cliente 20 archivos, **463/463**; `tsc -b` exit 0; lint exit 0.
- **Riesgo:** `rsc risk` → tier 1, 1 revisor de contexto fresco. Ronda 1: 0 bloqueantes; L69 (para corregir: el
  foco se pierde al reintentar y "Cargando..." no se anuncia), L70 (nit: destello de "0 préstamos" con
  `SESSION_REQUIRED`), L71 (pregunta: clics fuera de `act` en F1c/F1d). Los tres van a la ronda 2.

## Next

F1 ronda 2 en Qwen (worktree `f1-round2`, base `5886274`): L69, L70, L71 y los tests F1f-F1i. Después: rojo,
mutantes, controles y revisor; luego F2 (Perfil).
