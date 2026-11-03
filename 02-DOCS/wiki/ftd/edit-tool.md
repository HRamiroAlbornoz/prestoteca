---
author: HRamiroAlbornoz
branch: feat/edit-tool
status: in-progress
---
# Editar una herramienta

## Intent

Punto 3 del backlog. En el detalle de una herramienta propia, el botón "Editar" lleva a `/publish/:id`, una ruta
que no existe (la app muestra una pantalla vacía). Además, el formulario de publicar siempre hace `POST`: no sabe
cargar una herramienta existente ni guardar cambios.

El servidor ya está listo: `PATCH /api/tools/:id` valida los campos y solo deja editar al dueño (`403` si no lo
es, `404` si no existe). Lo que falta es todo del lado del cliente.

## Scope

**Entra:**
- Ruta privada `/tools/:id/edit` (sigue el patrón de `/tools/:id/request`), y "Editar" lleva ahí.
- `PublishForm` en dos modos: sin `id` publica (`POST`) como hoy; con `id` carga la herramienta, completa el
  formulario y guarda con `PATCH` solo los 4 campos editables (nombre, descripción, categoría, estado). Al guardar
  vuelve al detalle.
- Estados de la carga: cargando, no existe (`404`), error de red. Al guardar: `403` → "Solo podés editar tus propias
  herramientas", `404`, error de red, y cualquier otro error con un mensaje en castellano. Si falla, el formulario
  conserva lo escrito.
- Checklist de formularios: validación con Zod (un solo esquema para publicar y editar), cada campo se valida al
  perder el foco y, si ya muestra un error, también mientras se corrige; `aria-invalid` y `aria-describedby` en
  cada campo con error; campos y botón deshabilitados mientras se guarda.
- La descripción pasa a ser obligatoria en el formulario. Hoy el formulario la deja vacía, pero la spec del MVP
  la pide y el servidor rechaza el `POST` sin descripción con un `400` en inglés.
- `zod` como dependencia del cliente (hoy solo la tiene `server`; funciona en local porque npm la instala en la raíz).
  Se usa `zod/mini`: con Zod completo el JS subía de 91 a 116 KB comprimido; con `zod/mini` sube a 97,3 KB
  (Context7: 24,1 KB contra 4,6 KB para un esquema de 4 campos).
- Modo oscuro: los mensajes de error de los campos (`text-red-600`) tenían ~3,7:1 de contraste sobre la tarjeta
  oscura (AA pide 4,5:1). Se agregó su color a los ajustes de `index.css`; ahora 9,33:1. Vale para todos los formularios.

**No entra:**
- Cambios en el servidor.
- Avisar "no sos el dueño" al abrir el formulario (el servidor lo rechaza al guardar, y el botón "Editar" solo lo
  ve el dueño).
- Los mensajes de error del resto de la app (los define la spec de códigos de error).
- Bugs vistos al pasar, anotados para después: en `ToolDetailPage`, "Iniciar sesión para pedir" usa `?returnUrl=`
  pero el login lee `?returnTo=` (no vuelve al detalle); el dueño ve "Pedir prestada" en su propia herramienta;
  `PATCH` con un `name` que no es texto da `500` en vez de `400`.

## Checklist

- [x] T1 — Tests que fallan: editar (carga, guarda con `PATCH`, vuelve al detalle, `403`, `404`, error de red
  conserva lo escrito, deshabilitado mientras guarda), publicar (descripción vacía, validación al perder el foco),
  la ruta privada y el botón "Editar". Prueba: Vitest en rojo.
- [x] T2 — Código. Prueba: los tests en verde.
- [x] T3 — Suite completa, type-check, lint y build en verde. Prueba: salida de cada comando.
- [x] T4 — Se ve y se usa bien a 375 px (claro y oscuro). Prueba: capturas.
- [ ] T5 — Hernán instala `zod` en el cliente (`npm install zod -w client`) y el build sigue en verde.
- [ ] T6 — PR mergeado, staging/production en `SUCCESS`; editar una herramienta en staging.

## Evidence

- **T1** (2026-11-03): `editTool.test.tsx` nuevo (8 tests: carga y completa, guarda con `PATCH` solo los 4 campos
  recortados y vuelve al detalle, `403`, sin conexión conserva lo escrito, deshabilitado mientras guarda, `404` al
  cargar, sin conexión al cargar, no envía con un campo inválido); en `publishForm.test.tsx`, descripción vacía y
  validación al perder el foco con `aria-invalid`/`aria-describedby`; en `App.test.tsx`, la ruta y que sea privada;
  en `toolPages.test.tsx`, "Editar" navega a `/tools/tool-1/edit`. Resultado: `Tests 13 failed | 39 passed (52)`:
  fallan los 13 nuevos.
- **T2** (2026-11-03): `utils/toolForm.ts` (esquema y listas), `PublishForm.tsx` en dos modos, la ruta en `App.tsx` y
  `ToolDetailPage.tsx` → `Tests 52 passed (52)`. Prueba de que los tests detectan fallas: con `<fieldset disabled={false}>`
  y con el `403` cambiado a `999`, fallan justo "disables the fields…" y "explains that only the owner…"
  (`2 failed | 6 passed`); se restauró el código.
- **T3** (2026-11-03): `npx vitest run` → `Test Files 15 passed (15)`, `Tests 181 passed (181)`; `npx tsc -b` → exit 0
  (antes marcó un `waitFor` sin usar en el test nuevo; se sacó); `npm run lint` → los mismos 2 avisos de siempre;
  `npm run build` → exit 0, JS `97.30 kB` comprimido (con Zod completo había dado `115.76 kB`).
- **T4** (2026-11-03): `vite` en el puerto 5179 y Chrome DevTools, con la sesión y la herramienta simuladas en el
  navegador (`initScript`). A 375 px en claro: título "Editar herramienta", los 4 campos completos ("Taladro Bosch",
  la descripción, "Herramientas eléctricas", "bueno"), "Guardar cambios" y "Cancelar". En oscuro, con el nombre "AB"
  y el foco fuera del campo: borde rojo y "El nombre debe tener al menos 3 caracteres"; `aria-invalid="true"`,
  `aria-describedby="tool-name-error"`; contraste del mensaje 9,33:1 (`rgb(252,165,165)` sobre `rgb(24,24,27)`).

## Next

T5: Hernán instala `zod` en el cliente (`npm install zod -w client`) y corre el build. Después el PR.
