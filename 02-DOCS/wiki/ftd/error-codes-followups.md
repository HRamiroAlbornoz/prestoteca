---
author: HRamiroAlbornoz
branch: main
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

- [x] **F1 — Mis préstamos con error de carga.** (Hecho: ver Evidence, rondas 1 y 2; más F1e-F1i.) Tests en `myLoans.test.tsx`:
  - F1a: un listado da 500 → se ve el único `role="alert"` con el texto de `INTERNAL_ERROR` y un botón
    "Reintentar"; no hay `role="tab"` ni "No tenés préstamos solicitados".
  - F1b: "Reintentar" con el server ya bien → se ven los dos listados con sus contadores reales y no queda el error.
  - F1c: "Reintentar" que vuelve a fallar → sigue el error, sigue el botón, y se hicieron 4 pedidos en total.
  - F1d: un 401 `SESSION_REQUIRED` al reintentar → lleva al login (la misma regla de hoy).
  - Prueba: los tests nuevos fallan contra el código de hoy y pasan después; la suite del cliente en verde.
- [x] **F2 — Perfil con error de carga.** (Hecho: ver Evidence, F2; tests F2a-F2h.) Tests en `profilePage.test.tsx`:
  - F2a: la carga da 500 → error + "Reintentar"; la única pestaña es "Configuración", elegida, sin "(0)"; no se ve
    "No tenés herramientas publicadas".
  - F2b: desde ese estado se puede cambiar la contraseña (el formulario está y envía).
  - F2c: "Reintentar" con el server ya bien → vuelven las cinco pestañas con sus contadores y no queda el error.
  - F2d: "Reintentar" que vuelve a fallar → sigue el error.
  - Prueba: los tests nuevos fallan contra el código de hoy y pasan después; la suite del cliente en verde.
- [x] **F3 — Foco al cambiar de pantalla.** (Hecho: ver Evidence, F3; tests F3a-F3f.) Tests con el `App` real (como `App.test.tsx` / `session.test.tsx`):
  - F3a: clic en un enlace de la barra que cambia la dirección → `document.activeElement` es `<main>`.
  - F3b: primera carga de la app → el foco **no** está en `<main>`.
  - F3c: en el inicio, escribir en la búsqueda (cambia `?q=`) → el foco sigue en el campo de búsqueda.
  - F3d: "atrás" del navegador (cambia la dirección) → el foco está en `<main>`.
  - F3e (`session.test.tsx`): sesión terminada → redirección a `/login?returnTo=…` → el foco está en `<main>` y el
    aviso sigue en `role="alert"`.
  - Prueba: F3a, F3d y F3e fallan contra el código de hoy; F3b y F3c pasan antes y después; suite en verde.
  - Caso borde aceptado: abrir directo una página privada sin sesión redirige a `/login`, y eso cambia la dirección,
    así que el foco va a `<main>`. Está bien: es una página nueva, y el foco estaba en el `<body>`.
- [x] **Controles:** (Hecho en `main` tras F3: 481/481, `tsc -b` y lint exit 0; `rsc risk` y revisiones en cada
  ítem, ver Evidence.) `npx vitest run`, `npx tsc -b` y `npm run lint` en `client/` en verde; `axe` sin violaciones en
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

### F1 — ronda 2 (2026-11-12)

- **Hecho por:** Qwen, en el worktree `f1-round2` (base `5886274`), en una sola entrega con `worker_done`. Tocó solo
  sus 2 archivos y no borró ningún `it(`. Por su cuenta, movió el clic de F1b-F1e para después de preparar las
  respuestas del reintento (antes andaba de casualidad, por el orden en que corre todo).
- **Cambios:** L69, el foco vuelve a "Reintentar" solo después de un reintento que falla (`retryButtonRef`,
  `retriedRef` y un `useEffect` antes de los `return`), y "Cargando..." lleva `role="status"`; L70, con
  `SESSION_REQUIRED` la pantalla queda en "Cargando..." hasta el login; L71, `fireEvent.click`, y F1c espera los 4
  pedidos. Tests nuevos: F1f-F1i.
- **Rojo (Claude):** los tests contra la pantalla de la ronda 1 → fallan F1f, F1h, F1i (F1g pasa antes y después,
  como se esperaba).
- **Mutantes (Claude), todos detectados y verificados como aplicados:** sin `.focus()` → F1f; foco también en la
  primera carga → F1g; sin `role="status"` → F1h; `setLoading(false)` de vuelta con `SESSION_REQUIRED` → F1i.
- **Controles:** cliente 20 archivos, **467/467**; `tsc -b` exit 0; lint exit 0.
- **Revisión ronda 2 (1 revisor, solo el diff nuevo):** L69, L70 y L71 verificados → `fixed`. Nuevos: L72 (nit:
  `retriedRef` queda en `true` si el reintento sale bien; un error posterior por cambio de usuario o de dirección
  daría el foco a "Reintentar") → `intentional`, porque en ese caso el foco igual se perdería y "Reintentar" es un
  buen lugar; L73 (pregunta: una recarga por cambio de usuario o de dirección no muestra "Cargando...") →
  `irrelevant`, porque ya pasaba antes de F1.
- **Staging:** no aplica para F1 (no se puede forzar un error de carga sin tocar el server); alcanzan los tests.

### F2 (2026-11-12)

- **Hecho por:** Qwen, en el worktree `f2-profile-retry` (base `41f82f8`), en una sola entrega con `worker_done`.
  Tocó solo sus 2 archivos, no borró ningún `it(` y no usó `writeFileSync|execSync|spawnSync` ni `vi.mock` nuevos.
  Siguió el patrón de `MyLoansPage.tsx` al pie de la letra. Reportó, sin tocarlos, 5 tests viejos que chocaban: C6 y
  los 4 C8c afirmaban "No tenés herramientas publicadas" e "Historial (0)" con la carga en error.
- **Ajustes (Claude):** C6 y C8c ahora piden una sola pestaña, "Configuración", y nada del estado vacío falso. F2a y
  C8c exigen el texto exacto `^Configuración$` (antes aceptaba "Configuración (0)"). F2b ya no hace clic en
  "Configuración" antes de llenar el formulario (ese clic tapaba el mutante M3).
- **Rojo (Claude):** contra el `ProfilePage.tsx` de `41f82f8` → 13 fallan (F2a-F2h, C6, 4 × C8c), 34 pasan.
- **Mutantes (Claude), todos detectados y verificados como aplicados:** M1 sin `reloadKey` en las dependencias →
  F2c, F2d, F2g; M2 cinco pestañas con error → C6, C8c, F2a, F2b; M3 `activeTab` en el contenido → F2b, F2h; M4 sin
  `.focus()` → F2d; M5 foco también en la primera carga → F2e; M6 sin `role="status"` → F2f.
- **Controles en `main`:** cliente 20 archivos, **475/475**; `tsc -b` exit 0; lint exit 0.
- **Riesgo:** `rsc risk` → tier 1, 1 revisor de contexto fresco. 0 bloqueantes. N1 (nit: tocar "Configuración" en
  la vista de error deja esa pestaña elegida tras un reintento bueno) → `intentional`, el pedido pide conservar
  `activeTab`; N2 (nit: `retriedRef` queda en `true`) → `intentional`, igual que L72 de F1; N3 (nit: con error de
  carga y de contraseña hay dos `role="alert"`) → `irrelevant`, ningún test lo pisa y los dos avisos son ciertos;
  N4 (`queryByText('Pala')` pasaba siempre) → `fixed`, se sacó; Q1 (reintento bueno deja el foco en `<body>`) →
  `intentional`, igual que F1 y fuera del alcance.
- **Staging:** no aplica para F2, como en F1; alcanzan los tests.

### F3 (2026-11-13)

- **Hecho por:** Qwen, en el worktree `f3-route-focus` (base `ba52d01`), en una sola entrega con `worker_done`. El
  diff es el del pedido, sin desvíos: `FocusMainOnPathChange` en `App.tsx` y los tests F3a-F3e. Tocó solo sus 3
  archivos, no borró ningún `it(` y no agregó `vi.mock`, `writeFileSync`, `execSync`, `spawnSync` ni esperas fijas.
- **Ajuste (Claude):** test F3f (cambia solo el `#` → el foco no se mueve), que pidió el revisor de tests.
- **Rojo (Claude):** contra el `App.tsx` de `ba52d01` → fallan F3a, F3d, F3e; pasan F3b, F3c, F3f, como se esperaba.
- **Mutantes (Claude), todos detectados:** M1 foco también en la primera carga → F3b; M2 clave `pathname + search`
  → F3c; M5 clave `pathname + hash` → F3f; M3 sin `.focus()` → F3a, F3d, F3e; M4 foco en otro elemento → F3a, F3d,
  F3e. El revisor de tests probó 9 mutantes más (`location.key`, `setTimeout`, `requestAnimationFrame`, ref sin
  actualizar, ref en `''`, `blur()`, saltar `/login`, saltar `/`) y todos quedaron detectados.
- **Controles en el worktree:** cliente 20 archivos, **481/481**; `tsc -b` exit 0; lint exit 0.
- **Riesgo:** `rsc risk` → **tier 2** (clase `auth`, solo por el nombre de `session.test.tsx`; ahí solo se agregó
  F3e), 3 revisores y aprobación de Hernán. Seguridad: 0 hallazgos. Corrección: 0 bloqueantes; F3-1 (nit: al volver
  atrás, `.focus()` sin `preventScroll` puede pisar el scroll que el navegador devuelve) → se mira en staging antes
  de decidir; F3-2 (nit: `/loans/` o `/Loans` contra `/loans` mueven el foco) → `irrelevant`, ningún enlace de la
  app lo hace y no daña nada. Tests: falta el caso del `#` → `fixed` con F3f; F3c afirma el foco sin esperar un
  momento más → `irrelevant`, ningún mutante lo aprovecha; componente después de `</main>` → mutante equivalente.
- **Aprobación de Hernán (tier 2):** dada el 2026-11-13, con F3-1 (scroll al volver atrás) para decidir en staging.
- **Staging:** pendiente (navegar por la barra, "atrás" y la redirección al login, con captura).

## Next

F1, F2 (`ba52d01`) y F3 (`78f24f9`) commiteadas en el `main` local; los worktrees `f2-profile-retry` y
`f3-route-focus` y sus ramas, borrados. Queda: decidir cómo sube todo (push directo a `main` o PR; F3 es tier 2, así que `rsc risk` pide una spec vinculada a la
rama que pase `npx @ericrisco/rsc spec gate` antes del push o PR); y con F1-F3 en staging, la prueba a mano del
foco (barra, "atrás", redirección al login) con captura, donde se decide F3-1 (`preventScroll`). F1, F2 y F3 siguen
sin subir.
