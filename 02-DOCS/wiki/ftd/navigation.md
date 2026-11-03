---
author: HRamiroAlbornoz
branch: feat/navigation
status: done
merged: 2026-11-02
pr: #30
---
# Barra de navegación

## Intent

Punto 2 del backlog. Hoy no hay forma de moverse por la app sin escribir la URL: ninguna pantalla enlaza a
perfil, mis préstamos, publicar, login o registro, y no hay botón para cerrar sesión (aunque `logout()` ya
existe en `AuthContext` y le pide al servidor que borre la cookie).

Una barra arriba de todas las pantallas resuelve las dos cosas.

## Scope

**Entra:**
- Componente `client/src/components/NavBar.tsx`, montado una sola vez en `App.tsx` (así aparece en todas las rutas).
- Sin sesión: "Prestoteca" (inicio), "Iniciar sesión" y "Crear cuenta".
- Con sesión: "Prestoteca", "Publicar", "Mis préstamos", "Perfil" y el botón "Salir" (cierra la sesión).
  Primero se llamó "Cerrar sesión", pero con ese texto la barra ocupaba 3 filas a 375 px; con "Salir" ocupa 2.
- Mientras la app todavía no sabe si hay sesión (`isLoading`): solo "Prestoteca", para no mostrar enlaces
  equivocados por un instante.
- "Salir" lleva al inicio y llama a `logout()`.
- Accesibilidad: `<nav aria-label>`, enlace "Saltar al contenido" (skip link) hacia un `<main id="main">`,
  `aria-current="page"` en el enlace de la página actual (marcado también con subrayado, no solo con color),
  foco visible y áreas táctiles de 44 px de alto.
- Mobile-first: en celular la marca va en una fila y los enlaces debajo, en una fila que se acomoda sola; desde
  `sm` todo va en una fila.

**No entra:**
- Menú hamburguesa (con 4 enlaces cortos no hace falta).
- Mostrar el nombre de la persona en la barra.
- Ajustar el `min-h-screen` de cada pantalla: con la barra arriba, las pantallas centradas (login, registro)
  quedan un poco más altas que la ventana. Es cosmético; se puede ver después.
- Mensaje si el `logout` falla por red (va con la spec de códigos de error).

## Checklist

- [x] T1 — Tests nuevos en `App.test.tsx` que fallan antes del cambio (enlaces sin sesión, enlaces con sesión,
  cerrar sesión, `aria-current`). Prueba: salida de Vitest en rojo.
- [x] T2 — `NavBar.tsx` y `App.tsx`. Prueba: los tests nuevos en verde.
- [x] T3 — Suite completa, type-check, lint y build en verde. Prueba: salida de cada comando.
- [x] T4 — Se ve y se usa bien a 375 px y 1280 px, claro y oscuro, y con teclado (skip link y foco). Prueba: capturas.
- [ ] T5 — PR mergeado, staging/production en `SUCCESS`, y la barra se ve en production.

## Evidence

- **T1** (2026-11-03): 6 tests nuevos en `describe('Navigation bar')` de `App.test.tsx`: sin sesión, con sesión,
  mientras carga, cerrar sesión desde una página privada, `aria-current` y skip link. Antes del cambio:
  `Tests 6 failed | 9 passed (15)`; fallan los 6 nuevos y pasan los 9 que ya estaban.
- **T2** (2026-11-03): con `NavBar.tsx` y el `<main id="main">` en `App.tsx` → `Tests 15 passed (15)`. El test de
  cerrar sesión comprueba la llamada `POST /api/auth/logout`, la vuelta a `/` y que reaparezca "Iniciar sesión".
- **T3** (2026-11-03): `npx vitest run` → `Test Files 14 passed (14)`, `Tests 169 passed (169)`; `npx tsc -b` → exit 0;
  `npm run lint` → exit 0, con los mismos 2 avisos de siempre (`AuthContext.tsx:79`, `HomePage.tsx:70`);
  `npm run build` → exit 0.
- **T4** (2026-11-03): `vite` en el puerto 5179 y Chrome DevTools. La sesión se simuló con un `initScript` que
  responde `/api/me` dentro del navegador.
  - 375 px con sesión, en `/loans`: la primera versión ocupaba 3 filas (~140 px) por "Cerrar sesión". Con "Salir",
    2 filas: marca arriba; "Publicar · **Mis préstamos** (subrayado) · Perfil · Salir" abajo, alineado con la marca.
  - 375 px sin sesión: una sola fila ("Prestoteca", "Iniciar sesión", "Crear cuenta").
  - 1280 px en modo oscuro: barra gris oscura. Con Tab aparece "Saltar al contenido" (violeta, arriba a la
    izquierda). Con Enter, `document.activeElement` es `MAIN#main` y la URL termina en `#main`.
  - Cada enlace y botón de la barra mide 44 px de alto.
  - Visto también: en escritorio, las pantallas centradas (login) ahora tienen una barra de scroll por los ~52 px
    de la barra (anotado en "No entra").

## Next
Fusionado en main el 2026-11-02 (2442b8a).
