---
type: verification
title: Verificación en staging — seguimientos de error-codes (F1-F3)
description: Prueba a mano del foco al cambiar de pantalla (F3) en staging, con capturas, para el PR #46.
tags: [sdd, verification, staging, a11y, focus]
timestamp: 2026-11-13T03:40:00Z
topic: sdd
slug: error-codes-followups
---

# Verificación en staging — seguimientos de error-codes (F1-F3)

Para el PR #46 (`feat/error-codes-followups`, `b9421ef`). Seguimiento:
[error-codes-followups](../../ftd/error-codes-followups.md).

## Deploy

- `railway up -s prestoteca -e staging --ci` desde el checkout limpio de la rama en `b9421ef`, sin cambiar la fuente
  del servicio.
- Staging: `2e440c28` → **`c8422f16`** (SUCCESS). Producción sigue en `beeb34e0`, sin tocar.
- `GET /api/health` → `200 {"status":"ok","db":"connected"}`. El HTML sirve `assets/index-CR9Ydp8Y.js`, el mismo
  archivo del build del deploy.
- La rama no toca el server ni trae migraciones.
- Dato de prueba creado: usuario "Prueba F3", `f3-1794538000@example.com`, barrio Centro.

## Foco al cambiar de pantalla (F3)

Chrome (DevTools MCP), contexto aislado, ventana de 390 px de ancho.

| Caso | Resultado | Evidencia |
| --- | --- | --- |
| Abrir `/profile` sin sesión → redirige a `/login?returnTo=%2Fprofile` | foco en `MAIN#main` (caso borde aceptado) | script |
| Clic en "Crear cuenta" de la barra → `/register` | foco en `<main>` (`main focusable focused`); antes de F3 se quedaba en el enlace | `1-nav-click-register.png`, `.txt` |
| Registro correcto → la app va a `/` | foco en `<main>` | snapshot |
| Escribir "tal" en la búsqueda → `?q=t`, `?q=ta`, `?q=tal` | foco sigue en `INPUT#search-input`, valor "tal" | `2-search-keeps-focus.png` |
| Clic en "Mis préstamos" → `/loans` | foco en `<main>` | `3-nav-click-loans.png` |
| "Atrás" desde `/loans` con el inicio bajado a 266 px | vuelve a `/`, scroll devuelto a **266**, foco en `<main>` | script (12 muestras) |
| Sesión cerrada en el server (`POST /api/auth/logout` → 204, `GET /api/me` → 401) con la app todavía logueada → clic en "Perfil" | `/login?returnTo=%2Fprofile`, foco en `<main>`, `role="alert"` = "Tu sesión terminó. Iniciá sesión para continuar." | `4-session-ended-login.png`, `.txt` |

## F3-1: scroll — hallazgo

- **Al volver atrás no pasa.** El navegador devuelve el scroll (266 px) y `.focus()` no lo pisa, porque `<main>`
  siempre se ve al menos en parte.
- **Al ir hacia adelante sí.** En `/login` (pantalla de 844 px, página de 897 px) el foco bajó la página **53 px**, el
  alto de la barra: `<main>` mide lo mismo que la pantalla (`min-h-screen`) y Chrome lo trae entero a la vista. La
  barra de navegación queda fuera de la pantalla (`navBottom: -1`), como se ve en `4-session-ended-login.png`.
- **Con `focus({ preventScroll: true })`**, en la misma página: el foco queda en `<main>` y el scroll queda en 0.

## Segunda pasada, con el arreglo (`979f386`)

- Push de la rama a `9101886`; `railway up -s prestoteca -e staging --ci` desde el checkout limpio en ese commit.
  Staging: `c8422f16` → **`65521d13`** (SUCCESS). Producción sigue en `beeb34e0`. `GET /api/health` → 200. El HTML
  sirve `assets/index-fm9BFuB_.js`, el del build nuevo.
- Pestaña nueva en contexto aislado, ventana de 500 × 844 (el ancho mínimo de la ventana; la primera pasada usó el
  mismo), sesión del usuario de prueba.

| Caso | Scroll | Barra (`nav` top–bottom) | Foco |
| --- | --- | --- | --- |
| Clic en "Mis préstamos" → `/loans` | 0 | 0–52, visible | `MAIN#main` |
| Clic en "Perfil" → `/profile` | 0 | 0–52, visible | `MAIN#main` |
| Sesión cerrada en el server → clic en "Mis préstamos" → `/login?returnTo=%2Floans`, aviso "Tu sesión terminó…" | 0 (antes: 53) | 0–52, visible (antes: oculta) | `MAIN#main` |
| "Atrás" | 0 | visible | `MAIN#main` |
| Escribir "ta" en la búsqueda | — | — | `INPUT#search-input`, valor "ta" |

Captura: `5-session-ended-login-prevent-scroll.png` (comparar con `4-session-ended-login.png`).
