---
type: plan
title: Plan — Prestoteca MVP
description: Technical blueprint for Prestoteca — a neighborhood tool lending app.
tags: [sdd, plan]
timestamp: 2026-10-04T00:00:00Z
topic: sdd
slug: prestoteca-mvp
status: draft
---

# Plan — Prestoteca MVP

> Slug: `prestoteca-mvp` · Status: draft · Created: 2026-10-04
> Inherits: [spec](../specs/prestoteca-mvp.md) · [constitution](../constitution.md)

## §0 — Global constraints

Estos valores deben honrarse en **cada tarea**. No se parafrasean: se copian tal cual.

- **Stack canon:** Node.js + Express 5 + TypeScript · PostgreSQL (pg, sin ORM) · React + Vite + TypeScript + Tailwind + React Router · npm
- **Testing:** Vitest (unit) · Supertest (API) · Testing Library (components) · TDD red→green→refactor · coverage ≥ 80%
- **Auth:** JWT en cookie `httpOnly`, `Secure`, `SameSite=Lax`, 1 hora de expiración
- **Zona horaria:** `America/Argentina/Tucuman` (todas las comparaciones de fechas)
- **Listas fijas:** Barrios (8 opciones) · Categorías (6 opciones)
- **Seguridad:** Zod en servidor · SQL parametrizado · bcrypt (max 72) · XSS: React escaping, no `dangerouslySetInnerHTML` · CSRF: `SameSite=Lax` + Origin header · Rate limiting 5/min/IP · Body max 10kb · Helmet + CORS · Secrets en `.env` · Mensajes genéricos al cliente
- **Accesibilidad:** WCAG 2.2 AA · keyboard-navigable · visible focus · `prefers-reduced-motion` · labels · screen reader errors · contrast 4.5:1 text / 3:1 borders
- **Responsive:** mobile-first · base 320px · tablet 768px · desktop 1024px
- **Paginación:** 12 items por página
- **Naming:** `server/src/modules/<module>/` · `client/src/<layer>/`
- **Commits:** semantic (`feat:`, `fix:`, `test:`, `docs:`…)
- **Branching:** branch off `main` · merge via PR · no direct pushes
- **Monorepo:** true · `server/` + `client/` · lockfile por workspace

## §1 — Context & constraints

| # | Fuente | Restricción |
|---|--------|-------------|
| C1 | spec §Behaviour | 7 estados de préstamo con transiciones restringidas por rol |
| C2 | spec §AC Préstamos | Overlap de fechas rechazado; concurrentes → ambos pending → dueño decide |
| C3 | spec §AC Cuentas | Rate limiting 5/min/IP en login y registro |
| C4 | spec §AC Seguridad | Origin header check en POST/PATCH/DELETE; body max 10kb |
| C5 | spec §AC Herramientas | Borrado lógico; editar/pausar permitido con préstamos activos |
| C6 | spec §AC Préstamos | Vencido automático (background process) |
| C7 | spec §Non-goals | Sin pagos, sin fotos, sin mapa, sin chat, sin notificaciones email, sin calificaciones |
| C8 | constitution §5 | Security floor: bcrypt, Zod, parameterized SQL, Helmet, CORS |
| C9 | constitution §6 | WCAG 2.2 AA accessibility floor |
| C10 | brief §API | Todas las rutas bajo `/api`; health endpoint sin auth |
| C11 | brief §Modelo de datos | 3 tablas: users, tools, loans |
| C12 | spec §AC Cuentas | Account deletion con borrado lógico de herramientas + historial anónimo |
| C13 | spec §AC Cuentas | Password change desde perfil (sin email recovery) |

## §2 — Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                    React SPA (client)                    │
│  Pages: Home, ToolDetail, Register, Login, Profile,      │
│         PublishForm                                      │
│  Components: ToolCard, LoanStatus, SearchFilters         │
│  Router: React Router (client-side)                      │
│  HTTP client: fetch wrapper with auth header injection   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP (JSON)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Express 5 Server (server)                   │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │  Middlewares │  │  Controllers │  │  Background    │  │
│  │  - auth      │  │  auth/       │  │  - loan-scan   │  │
│  │  - rate-limit│  │  tools/      │  │   (vencimiento)│  │
│  │  - origin    │  │  loans/      │  │                │  │
│  │  - body-size │  │  me/         │  │                │  │
│  │  - helmet    │  │              │  │                │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────────┘  │
│         │                │                               │
│  ┌──────┴────────────────┴──────┐                        │
│  │     Services (business logic) │                       │
│  │  - authService               │                       │
│  │  - toolService               │                       │
│  │  - loanService               │                       │
│  │  - searchService             │                       │
│  └──────┬───────────────────────┘                        │
│         │                                                │
│  ┌──────┴───────────────────────┐                        │
│  │   Repositories (data access) │                        │
│  │  - userRepo (pg)             │                        │
│  │  - toolRepo (pg)             │                        │
│  │  - loanRepo (pg)             │                        │
│  └──────────────────────────────┘                        │
└──────────────────────┬──────────────────────────────────┘
                       │ pg (TCP)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   PostgreSQL                              │
│  Tables: users, tools, loans                             │
│  DBs: prestoteca_dev, prestoteca_test                    │
└─────────────────────────────────────────────────────────┘
```

### Component responsibilities

| Component | Single responsibility | Internal / External |
|---|---|---|
| **React SPA** | UI rendering, client routing, form validation, HTTP calls to API | External (browser) |
| **Express middlewares** | Cross-cutting concerns: auth check, rate limiting, origin validation, body size, helmet headers | Internal |
| **Controllers** | Request/Response mapping, validate input via Zod schemas, delegate to services | Internal |
| **Services** | Business logic: state transitions, date validation, overlap checks, permission checks | Internal |
| **Repositories** | Data access: parameterized SQL queries, CRUD operations | Internal |
| **Background loan-scan** | Periodic check for overdue loans (entregado → vencido) | Internal |
| **PostgreSQL** | Data persistence, constraints, transactions | External |

### Key architectural decision

**Monolith (Express + React) vs. split services → Monolith.**

El MVP no necesita microservicios. Un solo servidor Express maneja todas las rutas, un solo cliente React consume la API. Esto reduce complejidad, deployment y acoplamiento. Si el producto escala, se separa después. La decisión está alineada con C7 (no-goals: sin pagos, sin notificaciones, sin chat — el MVP es simple).

## §3 — Interfaces & contracts

### API endpoints

Cada endpoint sigue el patrón: `METHOD /api/<resource>[/<id>][/<action>]`.

| Method | Route | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/health` | No | — | `{ status: "ok", db: "connected" | "disconnected" }` |
| POST | `/api/auth/register` | No | `{ name, email, password, neighborhood }` | `{ token }` + cookie |
| POST | `/api/auth/login` | No | `{ email, password }` | `{ token }` + cookie |
| POST | `/api/auth/logout` | Sí | — | 204 (borra cookie) |
| GET | `/api/tools` | No | Query: `q`, `category`, `neighborhood`, `page`, `limit` | `{ items: Tool[], total, page, pages }` |
| GET | `/api/tools/:id` | No | — | `Tool` (detalle completo) |
| POST | `/api/tools` | Sí, dueño | `{ name, description, category, condition }` | `Tool` (creada) |
| PATCH | `/api/tools/:id` | Sí, dueño | `{ name?, description?, category?, condition?, isPaused? }` | `Tool` (actualizada) |
| DELETE | `/api/tools/:id` | Sí, dueño | — | 204 (borrado lógico) |
| POST | `/api/tools/:id/loans` | Sí | `{ startDate, endDate, note? }` | `Loan` (pendiente) |
| GET | `/api/loans/:id` | Sí, dueño o solicitante | — | `Loan` (detalle) |
| PATCH | `/api/loans/:id/status` | Sí, según rol | `{ status }` | `Loan` (actualizada) |
| GET | `/api/me/tools` | Sí | — | `{ tools: Tool[], receivedLoans: Loan[], madeLoans: Loan[] }` |
| GET | `/api/me/history` | Sí | — | `{ loans: Loan[] }` (terminados) |
| PATCH | `/api/me/password` | Sí | `{ currentPassword, newPassword }` | 204 |
| DELETE | `/api/me/account` | Sí | `{ password }` (confirmación) | 204 |

### Error envelope

Todos los errores siguen este formato:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Mensaje genérico para el cliente"
  }
}
```

Códigos de error: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401/403), `NOT_FOUND` (404), `CONFLICT` (409), `PAYLOAD_TOO_LARGE` (413), `TOO_MANY_REQUESTS` (429), `INTERNAL_ERROR` (500).

### State transitions (loans)

```
pendiente ──acepta──→ aceptado ──entregado──→ entregado ──devuelto──→ devuelto (final)
    │                    │                      │
    │                    │                      └──vencido──→ vencido (final)
    │                    │
    │                    └──cancela──→ cancelado (final)
    │
    └──rechaza──→ rechazado (final)
    └──cancela──→ cancelado (final)
```

**Reglas:**
- Solo el dueño puede: aceptar, rechazar, entregar, devolver, cancelar (pendiente/aceptado)
- Solo el solicitante puede: cancelar (aceptado, antes de entregado)
- El sistema cambia automáticamente: entregado → vencido (si pasó la fecha de fin)

### Zod validation schemas (server-side)

| Schema | Campos | Reglas |
|---|---|---|
| `RegisterSchema` | `name` (2-50, trim), `email` (≤254, lowercase, unique), `password` (8-72, trim), `neighborhood` (fixed list) | — |
| `LoginSchema` | `email` (≤254), `password` (≤72) | — |
| `ToolSchema` | `name` (3-60), `description` (≤500), `category` (fixed list), `condition` (nuevo/bueno/usado) | — |
| `LoanSchema` | `startDate` (≥today in Tucuman TZ), `endDate` (≥startDate), `note` (≤300, optional) | — |
| `SearchParamsSchema` | `q` (≤60, optional), `category` (fixed list, optional), `neighborhood` (fixed list, optional) | — |
| `PaginationSchema` | `page` (≥1, integer), `limit` (12, fixed) | — |
| `PasswordChangeSchema` | `currentPassword`, `newPassword` (8-72, trim) | — |

## §4 — Data model & flow

### Database tables

```sql
-- users
id           UUID         PRIMARY KEY
name         VARCHAR(50)  NOT NULL
email        VARCHAR(254) NOT NULL UNIQUE (stored lowercase)
password_hash VARCHAR(128) NOT NULL
neighborhood VARCHAR(50)  NOT NULL  -- fixed list value
created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()

-- tools
id             UUID         PRIMARY KEY
owner_id       UUID         NOT NULL REFERENCES users(id)
name           VARCHAR(60)  NOT NULL
description    TEXT         NOT NULL
category       VARCHAR(50)  NOT NULL  -- fixed list value
condition      VARCHAR(10)  NOT NULL  -- 'nuevo', 'bueno', 'usado'
is_paused      BOOLEAN      NOT NULL DEFAULT false
deleted_at     TIMESTAMPTZ  NULL  -- borrado lógico
created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()

-- loans
id             UUID         PRIMARY KEY
tool_id        UUID         NOT NULL REFERENCES tools(id)
borrower_id    UUID         NOT NULL REFERENCES users(id)
owner_id       UUID         NOT NULL  -- denormalized for queries
start_date     DATE         NOT NULL
end_date       DATE         NOT NULL
status         VARCHAR(20)  NOT NULL  -- pendiente, aceptado, rechazado, entregado, devuelto, cancelado, vencido
note           TEXT         NULL  -- máx. 300 chars
created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
```

### Indexes

| Table | Index | Reason |
|---|---|---|
| tools | `idx_tools_owner` (owner_id) | Listar herramientas del dueño |
| tools | `idx_tools_category` (category) | Filtrar por categoría |
| tools | `idx_tools_neighborhood` (neighborhood) | Filtrar por barrio |
| tools | `idx_tools_deleted` (deleted_at) | Borrado lógico (WHERE deleted_at IS NULL) |
| loans | `idx_loans_tool` (tool_id) | Buscar préstamos de una herramienta |
| loans | `idx_loans_borrower` (borrower_id) | Mis pedidos |
| loans | `idx_loans_owner` (owner_id) | Pedidos recibidos |
| loans | `idx_loans_status` (status) | Filtrar por estado |
| loans | `idx_loans_dates` (end_date) | Background scan para vencimiento |

### Data flow

1. **Registro:** Browser → POST `/api/auth/register` → middleware body-size → controller Zod validate → service bcrypt hash + check email uniqueness → repo INSERT → return JWT + set cookie
2. **Login:** Browser → POST `/api/auth/login` → middleware rate-limit → controller Zod validate → service compare bcrypt + check email → repo find → return JWT + set cookie
3. **Publicar herramienta:** Browser (auth) → POST `/api/tools` → middleware auth + origin → controller Zod validate → service check owner → repo INSERT → return tool
4. **Buscar herramientas:** Browser → GET `/api/tools` → controller Zod validate pagination → repo SELECT with filters + pagination → return paginated list
5. **Pedir préstamo:** Browser (auth) → POST `/api/tools/:id/loans` → middleware auth + origin → controller Zod validate dates → service check overlap + own-tool + paused → repo INSERT → return loan
6. **Cambiar estado:** Browser (auth) → PATCH `/api/loans/:id/status` → middleware auth → controller Zod validate transition → service check permission + valid transition (transactional) → repo UPDATE → return loan
7. **Vencimiento automático:** Background cron cada hora → repo SELECT loans WHERE status='entregado' AND end_date < now() (Tucuman TZ) → service UPDATE status to 'vencido'
8. **Cambiar contraseña:** Browser (auth) → PATCH `/api/me/password` → middleware auth → controller Zod validate → service compare current password → repo UPDATE password_hash → return 204
9. **Eliminar cuenta:** Browser (auth) → DELETE `/api/me/account` → middleware auth → controller Zod validate password → service soft-delete tools (set deleted_at) + anonymize loans (set borrower_id/name references) → repo UPDATE → return 204

## §5 — Testing strategy

Cada acceptance criterion tiene un nivel de prueba asignado. Lo que se fakea para mantener las pruebas rápidas.

### Cuentas (16 ACs — spec líneas 102-117)

| AC (spec line) | Level | What it asserts | Fakes |
|---|---|---|---|
| Línea 102 (name < 2 o > 50) | Unit | Zod schemas reject invalid name | Nothing — schemas are pure |
| Línea 103 (name solo espacios) | Unit | Trim + empty → reject | Nothing |
| Línea 104 (email > 254) | Unit | Zod rejects long email | Nothing |
| Línea 105 (email duplicado) | Integration | POST /auth/register with existing email → 409 | Test DB with pre-seeded user |
| Línea 106 (password < 8 o > 72) | Unit | Zod rejects invalid password length | Nothing |
| Línea 107 (password solo espacios) | Unit | Trim + empty → reject | Nothing |
| Línea 108 (barrio inválido) | Unit | Zod rejects barrio not in fixed list | Nothing |
| Línea 109 (login success) | Integration | POST /auth/login with correct creds → token + cookie | Test DB |
| Línea 110 (login failure) | Integration | POST /auth/login with wrong creds → 401 | Test DB |
| Línea 111 (rate limit login) | Integration | 6 requests in 1 min from same IP → 429 | In-memory store |
| Línea 112 (rate limit register) | Integration | 6 requests in 1 min from same IP → 429 | In-memory store |
| Línea 113 (session cookie 1h) | Integration | Cookie `Expires` / `Max-Age` = 1h | Nothing |
| Línea 114 (logout) | Integration | POST /auth/logout → cookie deleted | Nothing |
| Línea 115 (private route redirect) | E2E | Unauthenticated GET /tools → redirect to /login | React DOM test |
| Línea 116 (password change) | Integration | PATCH /api/me/password → 204, old password fails | Test DB |
| Línea 117 (account deletion) | Integration | DELETE /api/me/account → tools soft-deleted, loans anonymized | Test DB |

### Herramientas (11 ACs — spec líneas 121-131)

| AC (spec line) | Level | What it asserts | Fakes |
|---|---|---|---|
| Línea 121 (publish tool) | Integration | POST /api/tools with valid data → 201 + tool in search | Test DB |
| Línea 122 (name < 3 o > 60) | Unit | Zod rejects invalid name length | Nothing |
| Línea 123 (description > 500) | Unit | Zod rejects long description | Nothing |
| Línea 124 (condition inválido) | Unit | Zod rejects condition not in {nuevo, bueno, usado} | Nothing |
| Línea 125 (category inválida) | Unit | Zod rejects category not in fixed list | Nothing |
| Línea 126 (edit/pause non-owner) | Integration | PATCH /api/tools/:id as wrong owner → 403 | Test DB with 2 users |
| Línea 127 (delete with active loans) | Integration | DELETE /api/tools/:id with active loans → 409 | Test DB with pre-seeded loan |
| Línea 128 (edit with active loans) | Integration | PATCH /api/tools/:id with active loans → 200, loan unchanged | Test DB |
| Línea 129 (pause with active loans) | Integration | PATCH /api/tools/:id set paused with active loans → 200 | Test DB |
| Línea 130 (tool detail) | E2E | GET /api/tools/:id returns full detail | Test DB |
| Línea 131 (paused tool rejects loans) | Integration | POST /api/tools/:id/loans on paused tool → 409 | Test DB |

### Préstamos (17 ACs — spec líneas 135-151)

| AC (spec line) | Level | What it asserts | Fakes |
|---|---|---|---|
| Línea 135 (create loan) | Integration | POST /api/tools/:id/loans → 201, status='pendiente' | Test DB |
| Línea 136 (owner accepts) | Integration | PATCH /api/loans/:id/status → aceptado | Test DB |
| Línea 137 (owner rejects) | Integration | PATCH /api/loans/:id/status → rechazado | Test DB |
| Línea 138 (owner delivers) | Integration | PATCH status entregado | Test DB |
| Línea 139 (owner returns) | Integration | PATCH status devuelto | Test DB |
| Línea 140 (borrower cancel) | Integration | PATCH status cancelado por solicitante → 200 | Test DB |
| Línea 141 (owner cancel pending) | Integration | PATCH status cancelado por dueño (pending) → 200 | Test DB |
| Línea 142 (owner cancel accepted) | Integration | PATCH status cancelado por dueño (accepted) → 200 | Test DB |
| Línea 143 (auto-vencido) | Integration | Background scan finds overdue loan → status='vencido' | Mock Date.now() to simulate overdue |
| Línea 144 (own tool) | Integration | POST /api/tools/:id/loans on own tool → 409 | Test DB |
| Línea 145 (startDate < today) | Unit + Integration | startDate < today in Tucuman TZ → reject | Mock Tucuman TZ date |
| Línea 146 (endDate < startDate) | Unit + Integration | endDate < startDate → reject | Mock Tucuman TZ date |
| Línea 147 (overlap) | Integration | POST loan overlapping existing active loan → 409 | Test DB with pre-seeded loan |
| Línea 148 (concurrent requests) | Integration | Two POST loans same tool → both pending → owner decides | Test DB + mock concurrent calls |
| Línea 149 (invalid state change) | Integration | PATCH invalid transition → 409, no DB change | Test DB |
| Línea 150 (loan detail permission) | Integration | GET /api/loans/:id as non-owner/non-borrower → 404 | Test DB with 3 users |
| Línea 151 (re-request after termination) | Integration | POST loan after previous loan terminated → 201 | Test DB |

### Búsqueda (8 ACs — spec líneas 155-162)

| AC (spec line) | Level | What it asserts | Fakes |
|---|---|---|---|
| Línea 155 (invalid page params) | Integration | GET /api/tools?page=-1 → 400 | Nothing |
| Línea 156 (pagination 12) | Integration | GET /api/tools → items.length ≤ 12 | Test DB with 20 tools |
| Línea 157 (filter by category+neighborhood) | Integration | GET /api/tools?category=X&neighborhood=Y → only matching | Test DB |
| Línea 158 (case-insensitive) | Integration | Search "TALADRO" finds "taladro" | Test DB |
| Línea 159 (escape %) | Integration | Search "%" returns literal matches, not SQL wildcard | Test DB with tool named "100%" |
| Línea 160 (escape _) | Integration | Search "_" returns literal matches, not SQL wildcard | Test DB with tool named "test_tool" |
| Línea 161 (paused not in search) | Integration | GET tools with paused tool → not in results | Test DB |
| Línea 162 (deleted not in listings) | Integration | GET tools with soft-deleted tool → not in results | Test DB |

### Perfil (2 ACs — spec líneas 166-167)

| AC (spec line) | Level | What it asserts | Fakes |
|---|---|---|---|
| Línea 166 (view profile) | Integration | GET /api/me/tools → tools + receivedLoans + madeLoans | Test DB |
| Línea 167 (view history) | Integration | GET /api/me/history → loans with status in {devuelto, rechazado, cancelado} | Test DB |

### Seguridad (3 ACs — spec líneas 171-173)

| AC (spec line) | Level | What it asserts | Fakes |
|---|---|---|---|
| Línea 171 (body size) | Integration | POST with body > 10kb → 413 | In-memory body parser |
| Línea 172 (Origin header) | Integration | POST/PATCH/DELETE without valid Origin → 403 | Mock Origin header |
| Línea 173 (generic error messages) | Integration | Any error response → no stack trace, no DB details | Nothing — assert response shape |

### Infraestructura (1 AC — spec línea 178)

| AC (spec line) | Level | What it asserts | Fakes |
|---|---|---|---|
| Línea 178 (health endpoint) | Integration | GET /api/health → {status, db} | Test DB connection |

### Testing infrastructure

| Aspect | Approach |
|---|---|
| Test DB | Separate PostgreSQL database (name must contain "test") |
| Seeding | SQL seed script before each test run |
| Cleanup | Transactions: cada test envuelve su setup + assertion en una transacción que se hace rollback al finalizar. No destruye el seed entre tests. |
| Date mocking | Mock `new Date()` to return fixed Tucuman TZ date for date-dependent tests |
| Auth mocking | Inject JWT token in test requests |
| Background scan | For spec línea 143, mock the cron trigger directly (call the scan function) |

## §6 — Sequencing & dependencies

El orden de construcción sigue la dependencia natural: sin cuentas no hay autenticación, sin autenticación no hay herramientas privadas, sin herramientas no hay préstamos.

### Fase A: Servidor base + Infraestructura

| # | Tarea | Depende de | Verifica |
|---|---|---|---|
| A1 | Config del servidor: Express, TypeScript, env vars validadas | — | Server starts, env vars required |
| A2 | Conexión a PostgreSQL: pg pool, health endpoint | A1 | GET /api/health returns db status |
| A3 | Middlewares: auth, rate-limit, origin check, body-size, helmet | A1 | Middleware chain works |
| A4 | Migraciones SQL: crear tablas users, tools, loans + indexes | A2 | Tables exist, constraints valid |
| A5 | Seed script: datos de ejemplo | A4 | Seed runs without errors |

### Fase B: Cuentas (auth)

| # | Tarea | Depende de | Verifica |
|---|---|---|---|
| B1 | Repo: userRepo (CRUD, unique email check) | A4 | SQL queries work |
| B2 | Service: authService (register, login, bcrypt, JWT) | B1 | Business logic correct |
| B3 | Controller + routes: auth/register, auth/login, auth/logout | B2 | Endpoints work (Supertest) |
| B4 | Frontend: Register page, Login page | B3 | Forms work, navigation |
| B5 | Frontend: Auth context + protected route wrapper | B4 | Redirect to login if unauthenticated |
| B6 | Tests: Línea 102-115 (register, login, rate limit, session) | B3 | All account ACs pass |

### Fase C: Herramientas

| # | Tarea | Depende de | Verifica |
|---|---|---|---|
| C1 | Repo: toolRepo (CRUD, soft delete, filter by paused/deleted) | A4 | SQL queries work |
| C2 | Service: toolService (publish, edit, pause, delete, permission) | C1 | Business logic correct |
| C3 | Controller + routes: tools CRUD | C2 | Endpoints work (Supertest) |
| C4 | Frontend: ToolCard component, Tool detail page | C3 | UI renders, data flows |
| C5 | Frontend: Publish tool form | C3 | Form validation + submit |
| C6 | Frontend: Edit/Pause/Delete tool UI (owner only) | C3 | Owner-only actions |
| C7 | Tests: Línea 121-131 (publish, validation, edit, pause, delete, detail) | C3 | All tool ACs pass |

### Fase D: Préstamos

| # | Tarea | Depende de | Verifica |
|---|---|---|---|
| D1 | Repo: loanRepo (CRUD, overlap check, status transition) | A4 | SQL queries work |
| D2 | Service: loanService (create, transition, permission, overlap, auto-vencido) | D1 | Business logic correct |
| D3 | Controller + routes: loans CRUD + status change | D2 | Endpoints work (Supertest) |
| D4 | Background: loan-scan cron (entregado → vencido) | D2 | Overdue loans auto-transition |
| D5 | Frontend: Loan status badge, Loan detail page | D3 | UI renders, transitions visible |
| D6 | Frontend: Request loan form (on tool detail) | D3 | Form validation + submit |
| D7 | Frontend: "Mis préstamos" tabs (pedí / me pidieron) | D3 | Tabs filter correctly |
| D8 | Tests: Línea 135-151 (create, transitions, overlap, concurrent, permissions) | D3 | All loan ACs pass |

### Fase E: Búsqueda + Perfil

| # | Tarea | Depende de | Verifica |
|---|---|---|---|
| E1 | Repo: searchRepo (filtered list, pagination, case-insensitive, escape wildcards) | A4 | SQL queries work |
| E2 | Service: searchService (filter, paginate, escape) | E1 | Business logic correct |
| E3 | Controller + routes: tools list, me/tools, me/history | E1 | Endpoints work (Supertest) |
| E4 | Frontend: Home page with search bar + filters | E3 | Search + filters work |
| E5 | Frontend: Profile page (tools, received loans, made loans, history) | E3 | Profile renders correctly |
| E6 | Frontend: Password change + account deletion UI | E3 | Account management works |
| E7 | Tests: Línea 155-162 (search, pagination, filters, wildcards) + Línea 166-167 (profile) | E3 | All search + profile ACs pass |

### Fase F: Seguridad + Integración

| # | Tarea | Depende de | Verifica |
|---|---|---|---|
| F1 | Tests: Línea 171-173 (security: body size, origin, generic errors) | E3 | Security ACs pass |
| F2 | Tests: Línea 178 (health endpoint) | A2 | Health AC passes |
| F3 | Tests: Línea 116 (password change) + Línea 117 (account deletion) | E3 | Account management ACs pass |
| F4 | Frontend polish: accessibility audit, keyboard nav, focus, contrast | E6 | WCAG 2.2 AA pass |
| F5 | Frontend polish: responsive (320px, 768px, 1024px) | E6 | Responsive layout works |

### Dependency graph

```
A1 → A2 → A3 → A4 → A5
          │      │
          ▼      ▼
         B1
          │
          ▼
         B2 → B3 → B4 → B5 → B6  (Fase B)
                              │
                              ▼
C1 → C2 → C3 → C4 → C5 → C6 → C7  (Fase C)
                              │
                              ▼
D1 → D2 → D3 → D4 → D5 → D6 → D7 → D8  (Fase D)
                              │
                              ▼
E1 → E2 → E3 → E4 → E5 → E6 → E7  (Fase E)
                              │
                              ▼
F1 → F2 → F3 → F4 → F5  (Fase F)
```

**Nota:** B1 depende de A4 (migraciones SQL), no de A1. A2 y A3 pueden ir en paralelo (ambas solo necesitan A1).

### Parallelism opportunities

- **Fase A:** A2 (DB connection) y A3 (middlewares) pueden ir en paralelo (ambas dependen solo de A1)

- **Fase C:** C1 (repo) y C4 (frontend ToolCard) pueden ir en paralelo (C4 solo necesita la API contract, no la implementación)

## §7 — Risks & open decisions

| # | Risk | Trigger | Impact | Mitigation |
|---|------|---------|--------|------------|
| R1 | **Overlapping loans race condition** | Dos personas solicitan la misma herramienta al mismo tiempo | Ambos pedidos se crean, pero el dueño solo puede aceptar uno | La línea 151 del spec cubre este caso: ambos quedan "pendientes" y el dueño decide. La validación de overlap (línea 147) se hace en el servicio, no en la BD. Si el dueño acepta uno, el otro queda pendiente (el dueño debe rechazarlo). |
| R2 | **Background scan timezone drift** | El servidor corre en UTC pero las fechas se comparan en Tucuman TZ | Préstamos se marcan "vencido" en el momento equivocado | Todas las comparaciones de fechas usan `America/Argentina/Tucuman` explícitamente. El cron job convierte `now()` a Tucuman TZ antes de comparar. |
| R3 | **Soft delete consistency** | Herramienta borrada aún referenciada en loans.tool_id | Query failures o datos inconsistentes | `deleted_at` es NULLABLE y las queries de listado filtran `WHERE deleted_at IS NULL`. Los préstamos mantienen la referencia a `tool_id` (la herramienta borrada sigue existiendo en la BD, solo está marcada como borrada). |
| R4 | **Account deletion anonymization** | Eliminar cuenta requiere soft-delete herramientas + anonymize loans | Datos inconsistentes si el proceso falla a mitad | Transacción única: soft-delete tools + anonymize loans + delete user. Si falla, rollback completo. |
| R5 | **Rate limiting with proxy** | Detrás de Railway proxy, `req.ip` es la IP del proxy, no del usuario | Todos los usuarios comparten la misma IP → rate limit los bloquea | `app.set('trust proxy', 1)` en Express. El `x-forwarded-for` header se lee correctamente. |
| R6 | **CSRF with SameSite=Lax** | Frontend y API en dominios diferentes (localhost:3000 vs localhost:3001) | Cookie SameSite=Lax no viaja → 401 en requests | En desarrollo, configurar CORS para permitir localhost:3000. En producción, frontend y API deben verse como el mismo sitio (proxy rewrite). |
| R7 | **bcrypt max 72 chars** | Usuario envía contraseña de más de 72 caracteres | bcrypt ignora lo que sigue → colisiones potenciales | Zod schema rechaza contraseñas de más de 72 caracteres (spec línea 106). |
| R8 | **SQL wildcard escape** | Usuario busca "%" o "_" en el nombre de herramienta | SQL interpreta como wildcard → resultados incorrectos | Escapar `%` como `\\%` y `_` como `\\_` en la query SQL (spec líneas 159-160). |

### Decisions taken during planning

| # | Decision | Options | Why | Logged in |
|---|----------|---------|-----|-----------|
| D1 | Monolith (Express + React) vs. split services | Monolith, microservices, serverless | MVP simplicity, single deploy surface | `02-DOCS/wiki/sdd/decisions.md` |
| D2 | Background scan for vencimiento vs. on-demand check | Cron cada hora, on-demand en cada query, event-driven | Cron cada hora es simple y suficiente para MVP (no hay miles de préstamos activos) | `02-DOCS/wiki/sdd/decisions.md` |
| D3 | In-memory rate limiter vs. Redis | In-memory store, Redis, database-backed | In-memory es suficiente para MVP (una sola instancia de Express). Si se escala a múltiples instancias, se migra a Redis. | `02-DOCS/wiki/sdd/decisions.md` |
| D4 | Account deletion: soft-delete tools + anonymize loans | Full delete, soft-delete tools + anonymize loans, soft-delete everything | Soft-delete tools conserva el historial de préstamos (spec línea 117). Anonymize loans preserva el historial sin exponer datos personales. | `02-DOCS/wiki/sdd/decisions.md` |

## Result envelope

```json result-envelope
{
  "status": "complete",
  "executive_summary": "Technical plan for Prestoteca MVP: monolith architecture (Express + React), 3 PostgreSQL tables, 6 implementation phases (A-F), 40+ tasks, TDD strategy mapped to all 58 acceptance criteria with spec line references.",
  "artifact": "02-DOCS/wiki/sdd/plans/prestoteca-mvp.md",
  "next_recommended": "tasks",
  "risk": "medium",
  "skill_resolution": {
    "used": ["plan"],
    "missing": [],
    "fallback": [],
    "compact_rules": ["The plan answers HOW; the spec owns WHAT.", "Name the isolation choice before the build starts."]
  },
  "evidence": ["plan path exists", "each spec acceptance criterion has an approach", "risks and rollback stated"]
}
```
