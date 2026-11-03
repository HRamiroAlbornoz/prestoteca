---
author: HRamiroAlbornoz
branch: fix/tailwind-v4-styles
status: done
merged: 2026-11-02
pr: #28
---
# La app vuelve a tener estilos (Tailwind 4)

## Intent

Punto 1 del backlog. La app desplegada no tiene estilos: el CSS no trae ninguna clase de Tailwind.

Causa: el cliente instala **Tailwind 4** (`tailwindcss` y `@tailwindcss/postcss` 4.3.3), pero
`client/src/index.css` todavía usa las directivas de **Tailwind 3** (`@tailwind base; …`). La guía de
migración (Context7, `/tailwindlabs/tailwindcss.com`, upgrade guide) dice que en v4 se carga con
`@import "tailwindcss";`. Con las directivas viejas, v4 no genera nada.

Además, al pasar de v3 a v4 algunas clases cambiaron de tamaño o de nombre. Si solo se arregla el
`@import`, la app se vería un poco distinta a como se diseñó. Por eso entran también esos renombres.

## Scope

**Entra:**
- `index.css`: `@import "tailwindcss";`.
- Los ajustes de modo oscuro de `index.css` pasan a `@layer utilities`. Fuera de una capa, en v4
  le ganan a **todas** las clases de Tailwind, también a `hover:` y `focus:`. Por ejemplo, en modo
  oscuro `hover:bg-gray-200` dejaría de funcionar sobre `bg-gray-100`.
- Los botones vuelven a mostrar la manito (`cursor: pointer`). En v4 el reset de base la sacó.
- Renombres de v3 → v4 en los componentes (tabla de la guía de migración):
  `shadow-sm` → `shadow-xs` (6), `rounded` → `rounded-sm` (16),
  `focus:outline-none` → `focus:outline-hidden` (22). Ninguno de esos casos usa `shadow`, `ring` ni
  `blur` sueltos. Todos los `border` ya traen su color, así que el cambio de color por defecto de v4 no afecta.
- Borrar `client/tailwind.config.js`: v4 no lo lee solo y no tenía nada propio (theme vacío, sin plugins).
- Sacar `autoprefixer` de `postcss.config.js` y de las dependencias: v4 agrega los prefijos solo.

**No entra:**
- Rediseñar pantallas o cambiar colores.
- Reemplazar los ajustes de modo oscuro por la variante `dark:` (sería otra feature).
- Navegación (punto 2 del backlog).

## Checklist

- [x] T1 — Reproducir. Prueba: `npm run build` y el CSS no tiene `bg-violet-600`.
- [x] T2 — `index.css`, renombres, config. Prueba: el CSS generado tiene `bg-violet-600`, `shadow-xs`,
  `outline-hidden`, y los ajustes oscuros quedan dentro de `@layer utilities`.
- [x] T3 — Tests, type-check, lint y build en verde. Prueba: salida de cada comando.
- [x] T4 — Se ve bien en el navegador, en celular (375 px) y en escritorio. Prueba: capturas.
- [x] T5 — Hernán saca `autoprefixer` (`npm uninstall autoprefixer -w client`) y el build sigue en verde.
- [x] T6 — PR mergeado y staging/production en `SUCCESS`, con el CSS desplegado que tenga `bg-violet-600`.

## Evidence

- **T1** (2026-11-02): `npm run build` en `client` → `index-U4qFh5px.css 6.96 kB`, y `grep -c bg-violet-600` → `0`.
  Coincide con lo visto en staging (~7 KB, sin clases de Tailwind).
- **T2** (2026-11-02): después del cambio, `index-CsclUtDF.css 20.95 kB`. Aparecen `.bg-violet-600{`, `.rounded-sm{`,
  `.shadow-xs{`, `outline-hidden` y `.hover\:bg-violet-700:hover`. Un script de Node confirmó que el bloque
  `prefers-color-scheme:dark` queda **dentro** de `@layer utilities` (posición 17433, la capa va de 7582 a 18569).
  `git diff --word-diff` en `client/src/pages` muestra solo los renombres: 26 `focus:outline-none` → `focus:outline-hidden`,
  17 `rounded` → `rounded-sm`, 6 `shadow-sm` → `shadow-xs`. Ninguna otra palabra cambió.
  Tropiezo: el primer reemplazo de `rounded` pegó la clase siguiente (`rounded-smmb-4`), porque la herramienta de
  edición sacó el espacio final. Se vio porque `.rounded-sm{` no aparecía en el CSS; se corrigió y se volvió a comprobar.
- **T3** (2026-11-02): `npx vitest run` → `Test Files 14 passed (14)`, `Tests 163 passed (163)`; `npx tsc -b` → exit 0;
  `npm run lint` → exit 0, con 2 avisos que ya existían (`AuthContext.tsx:79` y `HomePage.tsx:70`, en archivos o
  líneas que este cambio no toca); `npm run build` → exit 0.
- **T4** (2026-11-02): `vite` en el puerto 5179 y Chrome DevTools. `/login` a 375 px en modo claro y oscuro: tarjeta
  blanca/gris oscuro con sombra, inputs con borde redondeado y botón violeta. `/` a 1280 px: título, buscador en fila
  y botón violeta. No se levantó el servidor, así que el listado sale vacío (`0 herramientas encontradas`).
  Fuera de alcance, para más adelante: en modo oscuro, el enlace violeta "Crear cuenta" tiene poco contraste con el fondo.
- **T5** (2026-11-02, Hernán): `npm uninstall autoprefixer -w client` → `removed 10 packages`, `found 0 vulnerabilities`.
  `npm run build -w client` → `index-CsclUtDF.css 20.95 kB` (el mismo hash que en T2), `built in 339ms`.
  `grep -c autoprefixer` en `client/package.json` y `package-lock.json` → `0` y `0`. Commit `342b341`, PR #28.
- **T6** (2026-11-03 UTC): PR #28 mergeado a las 02:21:56 UTC (`3635587`). Railway, servicio `prestoteca`:
  staging `ab59fe1f` → `SUCCESS` (02:22:57 UTC), production `b28c63a6` → `SUCCESS` (02:22:47 UTC). Las dos URLs
  (`prestoteca-staging` y `prestoteca-production.up.railway.app`) sirven `/assets/index-CsclUtDF.css` (el mismo hash
  que el build local) y ese CSS contiene `bg-violet-600`. `/api/health` → `200` en los dos. Captura de production a
  375 px: estado "Cargando…" con tarjetas esqueleto, y después "11 herramientas encontradas" con tarjetas
  blancas con sombra, etiquetas de colores y el botón "Buscar" violeta.

## Next
Fusionado en main el 2026-11-02 (3635587).
