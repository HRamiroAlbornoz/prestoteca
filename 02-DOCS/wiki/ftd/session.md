---
author: HRamiroAlbornoz
branch: fix/session
status: in-progress
---
# Sesión que funciona: saber quién está logueado, rutas privadas y rutas que faltan

## Intent

En la segunda revisión de la spec `error-codes` (2026-11-02) apareció que el cliente **nunca sabe si hay sesión**:

1. `PrivateRoute` (`client/src/App.tsx:11-23`) decide si hay sesión buscando `token=` en `document.cookie`. El server
   crea esa cookie con `httpOnly: true` (`authRoutes.ts:54` y `:84`) y el navegador no deja que JavaScript la lea.
   Entonces `/profile`, `/publish` y `/tools/:id/request` redirigen siempre al login, también recién logueado.
2. `LoginPage.tsx:32-33` solo navega a `returnTo` después del login: no avisa al contexto, `currentUser` queda en `null`.
3. `AuthContext.tsx:29-33` también lee `document.cookie` al arrancar: después de recargar, la app te ve deslogueado.
4. `logout()` intenta borrar la cookie desde JavaScript, que con `httpOnly` no funciona, y nunca llama a
   `POST /api/auth/logout`.
5. `App.tsx` no define `/loans/:id` (adonde navega `RequestLoanPage` después de pedir) ni una ruta para `MyLoansPage`.

Los tests no lo vieron porque cada uno renderiza una página suelta con `currentUser` simulado. Ninguno pasa por `App`,
`PrivateRoute` ni una cookie real.

Alcance elegido por Hernán el 2026-11-02: la sesión más las rutas que faltan.

## Scope

**Entra:**
- Server: `GET /api/me` → `200 { id, name }` con una sesión válida, `401` sin sesión, con una vencida o con una
  cuenta eliminada. Va bajo `/api` (detrás del middleware de autenticación y del límite general) y no bajo `/api/auth`,
  porque `/api/auth` tiene un límite de 5 pedidos por minuto y la app consulta `/api/me` en cada carga.
- `returnTo` del login solo acepta rutas del mismo sitio (evita que el login sirva de redirección abierta).
- Cliente:
  - `AuthContext` pregunta a `/api/auth/me` al arrancar y expone `isLoading` hasta saberlo.
  - Login y registro actualizan el contexto con el usuario.
  - `logout()` llama a `POST /api/auth/logout` y limpia el contexto.
  - `PrivateRoute` usa el contexto: mientras carga no decide; sin usuario, redirige al login con `returnTo`.
  - Rutas `/loans/:id` (detalle) y `/loans` ("Mis préstamos"), las dos privadas.
- Tests: uno que renderiza `App` con las rutas reales, más los de cada pieza.
- Prueba en un navegador real, en staging: el bug antes del arreglo y el flujo completo después.

**No entra:**
- "Editar" (`/publish/:id`): backlog, punto 7.
- Validar el barrio en el server: backlog, punto 8.
- Mensajes de error en español: spec `error-codes`.
- Renovar la sesión antes de que venza (la cookie dura 1 hora).

## Checklist

- [x] T1 — Rama `fix/session` desde `main` (`34f151d`), creada por Hernán.
- [x] T2 — Bug reproducido: con la `App` real en un test, después de iniciar sesión, `/profile` vuelve al login. (La
  reproducción en un navegador real quedó para T5, porque escribir credenciales en staging necesita el OK de Hernán.)
- [x] T3 — Tests en rojo: `/api/me` (200 y 401), `AuthContext` (carga el usuario, login, logout), `PrivateRoute`
  con sesión y sin sesión, y las rutas `/loans` y `/loans/:id`.
- [x] T4 — Arreglo: todo en verde. Type-check, lint y build sin errores.
- [ ] T5 — Staging con el navegador: iniciar sesión → `/profile` abre; recargar → sigue logueado; pedir un préstamo →
  abre su detalle; "Mis préstamos" abre; cerrar sesión → `/profile` vuelve al login.
- [ ] T6 — PR mergeado y deploys en `SUCCESS`.

## Evidence

- **T1** (2026-11-02): `git switch -c fix/session` → `Switched to a new branch 'fix/session'`.

- **T2 + T3, rojo** (2026-11-02):
  - Server: `meAccountRoutes.test.ts` → `GET /api/me` (200 solo con `id` y `name`; 401 sin sesión; 401 con la cuenta
    eliminada) y `userRepo.test.ts` → `findActiveById` (la consulta filtra `deleted_at IS NULL`). Rojo: `4 failed`.
  - Cliente: `App.test.tsx` renderiza la `App` real con un servidor falso que solo decide qué responde `/api/me`.
    Rojo: `5 failed | 1 passed`. Falla **"abre una página privada cuando el server dice que hay sesión"**: con sesión
    válida, `/profile` igual manda al login. Es el bug reproducido. También fallan el login que vuelve a `returnTo` y
    las rutas `/loans` y `/loans/:id`. El caso "sin sesión → login" ya pasaba, porque hoy *siempre* manda al login.
  - `AuthContext.test.tsx`: falla "pregunta al server al arrancar" y "logout llama a `POST /api/auth/logout`".
- **T4** (2026-11-02):
  - Server: `UserRepository.findActiveById` y `GET /api/me` en `meAccountRoutes.ts`.
  - Cliente: `AuthContext` consulta `/api/me` al arrancar (cancela si se desmonta), expone `refreshUser()` y un
    `logout()` que llama al server. `PrivateRoute` usa el contexto y muestra "Cargando..." mientras espera. `LoginPage`
    y `RegisterPage` llaman a `refreshUser()` antes de navegar. `App.tsx` suma `/loans` y `/loans/:id`, privadas.
    `LoginPage` filtra `returnTo` (`//…`, `https://…` y `/\…` vuelven a `/`), con 3 tests.
  - Tests viejos ajustados: `sessionPersist.test.tsx` comprobaba el comportamiento roto (plantaba una cookie legible
    `token=` que en un navegador real no existe); ahora comprueba que la sesión sale del server y que una cookie
    legible se ignora. `authPages.test.tsx` usa un contexto falso con `refreshUser`. Se borró `ProtectedRoute`, que no
    usaba nadie.
  - Verde: server `Test Files 27 passed (27)`, `Tests 266 passed (266)`; client `Test Files 14 passed (14)`,
    `Tests 163 passed (163)`. `tsc -b` en server y client → exit 0. Lint → exit 0. `npm run build` → exit 0.
- **Staging, API** (2026-11-02): `railway up -s prestoteca -e staging --ci` → `Deploy complete`. `me-e2e.mjs`: sin
  sesión → `401`; con sesión → `200 {"id":"…","name":"QA me"}`; mismo token después de eliminar la cuenta → `401`.

### Hallazgos que no entran

- **La app no tiene navegación.** Ninguna pantalla enlaza a "Mi perfil", "Mis préstamos", "Publicar", "Iniciar
  sesión" ni "Cerrar sesión" desde el inicio. Con este arreglo las rutas funcionan, pero solo se llega escribiendo la
  URL o desde otras pantallas (por ejemplo, el perfil abre el detalle de un préstamo). `logout()` ya funciona, pero
  no hay botón que lo llame. Va al backlog.
- `ProfilePage.tsx:145` hace `localStorage.removeItem('token')`, que no hace nada (el token nunca estuvo ahí). Es
  inofensivo y se deja.

## Next

T5: probar el flujo en un navegador real, en staging, con una cuenta descartable (necesita el OK de Hernán).
