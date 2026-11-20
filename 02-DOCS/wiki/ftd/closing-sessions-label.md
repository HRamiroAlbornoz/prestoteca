---
author: HRamiroAlbornoz
branch: feat/closing-sessions-label
spec: server-sessions
status: in-progress
---
# "Cerrando sesiones..." mientras se cierran las otras sesiones

## Intent

Mejora anotada en T015 de server-sessions (revisión a mano en staging, 2026-11-20): al tocar "Cerrar sesiones" en el
diálogo de confirmación, mientras se espera la respuesta del servidor, la única señal visible es que los dos botones
se atenúan. El foco está en el panel del diálogo, sin indicador visible; el lector de pantalla tiene `aria-busy`.
Quien ve la pantalla no sabe si la app está trabajando o se trabó.

**Decisiones de Hernán (2026-11-20):**
- Mientras espera, el botón de confirmar muestra **"Cerrando sesiones..."** en vez de "Cerrar sesiones". Se escribe
  con tres puntos, como los otros textos de espera de la app ("Ingresando...", "Eliminando...", "Guardando...").
- La spec `server-sessions` se enmienda: la fila de la confirmación suma el texto de espera.
- Rama propia `feat/closing-sessions-label`, un solo PR. El código lo escribe Qwen desde un brief de especificación
  (opción D), revisado y con el OK de Hernán antes de lanzarlo.
- **Contraste mientras espera (2026-11-20, después de la revisión tier 1):** los dos botones deshabilitados usaban
  `opacity-50`, así que el texto quedaba en ~2,28:1 (claro) y ~3,06:1 (oscuro), por debajo de 4,5:1 (AA). Hernán
  eligió arreglarlo en este mismo FTD y rama: el botón de confirmar deshabilitado pasa a `red-800` sin opacidad
  (blanco sobre `red-800` = 8,31:1) y su hover solo aplica habilitado (`enabled:hover:bg-red-700`); "Cancelar"
  deshabilitado pasa a texto `gray-500` sin opacidad (4,83:1 en claro) con un override de modo oscuro `#A1A1AA`
  (6,91:1; `gray-500` sobre la tarjeta oscura daría 3,66:1).

## Scope

**Entra:**
- `client/src/components/ConfirmDialog.tsx`: una prop opcional nueva, `busyLabel`. Mientras `busy` es verdadero y
  `busyLabel` existe, el botón de confirmar muestra `busyLabel`; si no, muestra `confirmLabel` como hoy. Sin
  `busyLabel`, el diálogo se comporta exactamente igual que ahora.
- `client/src/components/OtherSessionsSection.tsx`: le pasa `busyLabel="Cerrando sesiones..."`.
- Pruebas: casos nuevos en `ConfirmDialog.test.tsx`; en `OtherSessionsSection.test.tsx`, S8 busca el botón por su
  nombre de espera y afirma que "Cerrar sesiones" vuelve después de la respuesta.
- Enmienda de la spec: fila "Tocar «Cerrar sesión en los otros dispositivos»" de *What result they get* y una entrada
  en *Revisions*.
- Contraste: clases de los dos botones de `ConfirmDialog.tsx` (sin `disabled:opacity-50`) y una línea de override de
  modo oscuro en `client/src/index.css`; pruebas C21 (clases) y C22 (override).

**No entra:**
- Anunciar la espera al lector de pantalla con una región viva: ya tiene `aria-busy` en el diálogo, y un anuncio más
  se sumaría al del resultado (AC-18 pide anunciar el resultado, no la espera).
- Indicador de foco visible en el panel mientras espera (el foco queda ahí por decisión de T013; se puede mirar
  aparte).
- Otros botones de la app con texto de espera (ya lo tienen).

**Límite conocido (aceptado):** el nombre accesible del botón cambia mientras está deshabilitado y el foco está en
el panel, así que el lector de pantalla no lee "Cerrando sesiones..."; para él la señal de espera sigue siendo
`aria-busy`. La mejora es para quien ve la pantalla.

## Checklist

- [ ] **Spec enmendada.** Prueba: el diff de `02-DOCS/wiki/sdd/specs/server-sessions.md` muestra la fila con
  "Cerrando sesiones..." y la entrada de *Revisions* del 2026-11-20.
- [ ] **Brief de opción D** escrito, probado en seco (implementación descartable de Claude), dos revisiones con ojos
  frescos, hallazgos mostrados a Hernán y su OK. Prueba: el brief y los hallazgos en la conversación.
- [x] **`busyLabel` en `ConfirmDialog`.** Prueba: las pruebas nuevas del diálogo en verde; C1-C19 sin cambios y en
  verde (sin `busyLabel` nada cambia); un mutante que ignora `busyLabel` y otro que lo muestra sin `busy` caen.
- [x] **`OtherSessionsSection` lo usa.** Prueba: S8 en verde con "Cerrando sesiones..." mientras espera y
  "Cerrar sesiones" después; un mutante sin la prop cae.
- [x] **Controles.** Prueba: `npm test`, `npx tsc -b` y `npm run lint` del cliente en verde; cobertura de líneas ≥ 80 %
  en los dos archivos cambiados; ningún `it(` viejo borrado (diff de nombres contra `main`).
- [x] **Riesgo y revisión.** Prueba: `rsc risk --base main` y la revisión que pida su tier.
- [ ] **Contraste mientras espera.** Prueba: C21 y C22 en verde; un mutante con `opacity-50` de vuelta, otro con el
  hover sin `enabled:` y otro sin el override de modo oscuro caen; el CSS compilado (`npm run build`) trae
  `.disabled\:bg-red-800:disabled`, `.enabled\:hover\:bg-red-700:enabled:hover` y el override `#a1a1aa`; suite,
  `tsc -b` y lint en verde.
- [ ] **Riesgo y revisión del contraste.** Prueba: `rsc risk` y la revisión que pida su tier.
- [ ] **Staging, a mano.** Prueba: con el `DELETE` demorado desde la página, el botón muestra "Cerrando sesiones...",
  deshabilitado, y al terminar el diálogo se cierra y el éxito se anuncia como antes. Colores calculados en el
  navegador, en modo claro y oscuro: texto ≥ 4,5:1 en los dos botones mientras espera.
- [ ] **PR, merge y producción.** Prueba: PR fusionado, deploys SUCCESS en los dos entornos, el bundle servido trae
  "Cerrando sesiones...", `smoke.mjs` contra producción `SMOKE OK`.

## Evidence

- Rojo: con solo las pruebas, `Tests  2 failed | 39 passed (41)` (C20 y S8).
- Verde en `src/components`: `Tests  41 passed (41)`.
- Suite completa del cliente: `Tests  541 passed (541)`.
- `tsc -b`: exit 0.
- `npm run lint`: exit 0.
- Mutante 1 (ignorar `busyLabel`): `Tests  2 failed | 39 passed (41)`.
- Mutante 2 (quitar prop `busyLabel`): `Tests  1 failed | 40 passed (41)`.
- Mutante 3 (mostrar `busyLabel` sin `busy`): `Tests  17 failed | 24 passed (41)`.
- Diff de nombres de test: C20 añadido, S8 renombrado.
- Cobertura: `ConfirmDialog.tsx` lines 100, branches 97.29; `OtherSessionsSection.tsx` lines 100, branches 96.42.
- Risk tier: tier 1, classes: default, docs, reviewers: 1, human approval: not required, base: main.
- Escrito por Qwen (opción D, tarea completa: pruebas, código, mutantes, cobertura, riesgo y esta evidencia) en
  **un solo intento**, con `worker_done` (resumido en vez de pegado).
- Verificación de Claude: el código es idéntico byte a byte a la referencia de Claude (oculta para Qwen); las
  pruebas siguen el brief (en S8 la aserción del texto visible quedó después de los dos clics, todavía durante la
  espera: equivalente); suite del cliente `22 passed`, `541 passed`, `tsc -b` 0; 4 mutantes propios caen: texto solo
  en `aria-label`, texto solo en un `span` `sr-only`, sin la guarda (`busy ? busyLabel : confirmLabel`, cae por C6 y
  C14) y "Cerrando sesiones…" con el carácter `…` (cada uno `2 failed` o `1 failed`).
- Brief revisado tres veces con ojos frescos (cada revisor armó una versión descartable; la segunda revisión encontró
  dos mutantes que sobrevivían y se cerraron con las aserciones de `textContent`).
- `rsc risk --base HEAD` en el checkout principal → tier 1 (`default, docs`), 1 revisor.
- Revisión tier 1: **APPROVE WITH NITS**, sin bloqueos ni should-fix.
  - "busy" sin `busyLabel` sin prueba propia: intentional, lo fijan C6 y C14 (buscan el botón deshabilitado por
    "Cerrar sesiones").
  - el cambio de texto no se anuncia: intentional, límite conocido de arriba.
  - contraste: el botón deshabilitado usa `opacity-50` (blanco sobre rojo atenuado, ~2,2:1). WCAG excluye los
    controles deshabilitados, pero ahora el texto está para leerse → seguimiento, decide Hernán.

## Next

Contraste: brief de opción D (tarea completa) para Qwen, revisión con ojos frescos y OK de Hernán; después staging a
mano y PR. (El "Cerrando sesiones..." ya está commiteado en `9cd1fd8`.)
