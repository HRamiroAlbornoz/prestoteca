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
- [ ] **`busyLabel` en `ConfirmDialog`.** Prueba: las pruebas nuevas del diálogo en verde; C1-C19 sin cambios y en
  verde (sin `busyLabel` nada cambia); un mutante que ignora `busyLabel` y otro que lo muestra sin `busy` caen.
- [ ] **`OtherSessionsSection` lo usa.** Prueba: S8 en verde con "Cerrando sesiones..." mientras espera y
  "Cerrar sesiones" después; un mutante sin la prop cae.
- [ ] **Controles.** Prueba: `npm test`, `npx tsc -b` y `npm run lint` del cliente en verde; cobertura de líneas ≥ 80 %
  en los dos archivos cambiados; ningún `it(` viejo borrado (diff de nombres contra `main`).
- [ ] **Riesgo y revisión.** Prueba: `rsc risk --base main` y la revisión que pida su tier.
- [ ] **Staging, a mano.** Prueba: con el `DELETE` demorado desde la página, el botón muestra "Cerrando sesiones...",
  deshabilitado, y al terminar el diálogo se cierra y el éxito se anuncia como antes.
- [ ] **PR, merge y producción.** Prueba: PR fusionado, deploys SUCCESS en los dos entornos, el bundle servido trae
  "Cerrando sesiones...", `smoke.mjs` contra producción `SMOKE OK`.

## Evidence

(vacío)

## Next

Escribir el brief de opción D para Qwen y probarlo en seco.
