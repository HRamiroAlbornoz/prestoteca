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

- **Stack canon:** Node.js >= 18 · Express 5.2.1 + TypeScript ~6.0.2 · PostgreSQL (pg, sin ORM) · React 19.2.7 + Vite 8.1.0 + TypeScript ~6.0.2 + Tailwind CSS + React Router 7.x · npm
- **Testing:** Vitest (unit) · Supertest (API) · Testing Library (components) · TDD red→green→refactor · coverage ≥ 80%
- **Auth:** JWT en cookie `httpOnly`, `Secure`, `SameSite=Lax`, 1 hora de expiración
- **Zona horaria:** `America/Argentina/Tucuman` (todas las comparaciones de fechas)
- **Listas fijas:** Barrios (8 opciones) · Categorías (6 opciones)
- **Seguridad:** Zod en servidor (strict mode TS, safeParse) · SQL parametrizado · bcrypt (max 72, salt rounds 12) · XSS: React escaping, no `dangerouslySetInnerHTML` · CSRF: `SameSite=Lax` + Origin header · Rate limiting 5/min/IP · Body max 10kb · Helmet 8+ (HSTS 365d default) + CORS · Secrets en `.env` · Mensajes genéricos al cliente · `app.disable('x-powered-by')` · `app.set('trust proxy', 1)`
- **Accesibilidad:** WCAG 2.2 AA · keyboard-navigable · visible focus · `prefers-reduced-motion` · labels · screen reader errors · contrast 4.5:1 text / 3:1 borders
- **Responsive:** mobile-first · base 320px · tablet 768px · desktop 1024px
- **Paginación:** 12 items por página
- **Naming:** `server/src/modules/<module>/` · `client/src/<layer>/`
- **Commits:** semantic (`feat:`, `fix:`, `test:`, `docs:`…)
- **Branching:** branch off `main` · merge via PR · no direct pushes
- **Monorepo:** true · `server/` + `client/` · lockfile por workspace
- **TypeScript:** strict mode · `verbatimModuleSyntax` · `noUnusedLocals` · `noUnusedParameters` · `moduleDetection: force`
- **Linter + formatter:** ESLint + Prettier (zero warnings), pre-commit

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
| `RegisterSchema` | `name` (2-50, trim, no space-only), `email` (≤254, lowercase, unique), `password` (8-72, trim, no space-only), `neighborhood` (fixed list) | AC-102, AC-103, AC-106, AC-107 |
| `LoginSchema` | `email` (≤254), `password` (≤72) | AC-109, AC-110 |
| `ToolSchema` | `name` (3-60), `description` (≤500), `category` (fixed list), `condition` (nuevo/bueno/usado) | AC-122, AC-123, AC-124, AC-125 |
| `LoanSchema` | `startDate` (≥today in Tucuman TZ), `endDate` (≥startDate), `note` (≤300, optional) | AC-145, AC-146 |
| `SearchParamsSchema` | `q` (≤60, optional), `category` (fixed list, optional), `neighborhood` (fixed list, optional) | AC-155 |
| `PaginationSchema` | `page` (≥1, integer), `limit` (12, fixed) | AC-155 |
| `PasswordChangeSchema` | `currentPassword` (any), `newPassword` (8-72, trim, no space-only) | AC-116 |

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

## Tasks
<!-- generated by tasks on 2026-10-04; IDs are stable, do not renumber -->

| ID | [P] | Task | Done-check | Depends-on | Trace |
| --- | --- | --- | --- | --- | --- |
| T001 |  | Add Express config, TypeScript setup, validated env vars | `npm run build` compila sin errores; server starts with required env vars | — | spec §3 Interfaces; constitution §1, §3 |
| T002 | [P] | Add pg pool connection and health endpoint | `GET /api/health` returns `{status:"ok",db:"connected"}` with test DB | T001 | spec §3 Interfaces; spec Línea 178 |
| T003 | [P] | Add middleware chain: auth, rate-limit, origin, body-size, helmet | Supertest: unauthenticated GET → 401; POST with large body → 413; POST without Origin → 403 | T001 | spec §3 Interfaces; spec Líneas 171-172 |
| T004 |  | Add `users` table migration with indexes | `npx pg-migrate up` applies clean; verify `\d users` shows email UNIQUE; verify `\d tools` shows FK to users; verify `\d loans` shows FK to tools, users | T002 | spec §4 Data model |
| T005 |  | Add seed script with example users, tools, loans | Seed runs without errors; `SELECT count(*) FROM users` returns expected rows | T004 | constitution §3 |
| T006 |  | Implement userRepo: CRUD, unique email check, find by email | `npm test server/src/modules/auth/userRepo.test.ts` green; duplicate email → conflict | T004 | spec §4 Data model; spec Línea 105 |
| T007 |  | Implement authService: register, login, bcrypt hash, JWT generation | Unit tests: bcrypt hash ≠ plain text; JWT decodes to user id; login with wrong pw → 401 | T006 | spec §4 Data flow #1-2; spec Líneas 109-110 |
| T008 |  | Wire auth routes: register, login, logout | Supertest: POST /api/auth/register → 201 + cookie; POST /api/auth/login → 200 + cookie; POST /api/auth/logout → 204 | T007 | spec §3 Interfaces; spec Líneas 102-114 |
| T009 |  | Build Register page and Login page | Register form submits → calls POST /api/auth/register; Login form submits → calls POST /api/auth/login | T008 | spec §2 Architecture; spec Líneas 102-110 |
| T010 |  | Build Auth context + protected route wrapper | Unauthenticated GET → redirects to /login with returnUrl; authenticated user sees protected page | T009 | spec §2 Architecture; spec Línea 115 |
| T011 |  | Test account ACs: register, login, rate limit, session, logout | `npm test server/src/modules/auth/` green; rate limit → 429 after 5 requests/min; cookie expires in 1h | T008 | spec Líneas 102-115 |
| T012 | [P] | Implement toolRepo: CRUD, soft delete, filter by paused/deleted | `npm test server/src/modules/tools/toolRepo.test.ts` green; soft deleted tool not in listings | T004 | spec §4 Data model; spec Líneas 121-131 |
| T013 |  | Implement toolService: publish, edit, pause, delete, permission checks | Unit tests: non-owner PATCH → 403; delete with active loans → 409; pause with active loans → 200 | T012 | spec §4 Data flow #3; spec Líneas 121-131 |
| T014 |  | Wire tools CRUD routes: POST /tools, PATCH /tools/:id, DELETE /tools/:id | Supertest: POST /api/tools → 201; PATCH /api/tools/:id as non-owner → 403; DELETE with active loans → 409 | T013 | spec §3 Interfaces; spec Líneas 121-131 |
| T015 |  | Wire GET /api/tools/:id detail endpoint | Supertest: GET /api/tools/:id → 200 with full tool detail (name, description, category, condition, neighborhood, status); GET non-existent → 404 | T014 | spec §3 Interfaces; spec Línea 130 |
| T016 | [P] | Build ToolCard component and ToolDetail page | ToolCard renders category icon, name, neighborhood, condition, status; ToolDetail shows full tool info + "Pedir" button | T015 | spec §2 Architecture; spec Línea 130 |
| T017 |  | Build PublishForm page | Form validates name (3-60), description (≤500), category (fixed list), condition (nuevo/bueno/usado); submits → POST /api/tools | T016 | spec §2 Architecture; spec Líneas 121-125 |
| T018 |  | Build Edit/Pause/Delete tool UI (owner only) | Owner sees edit/pause/delete buttons; non-owner sees none; actions call PATCH/DELETE /api/tools/:id | T016 | spec §2 Architecture; spec Líneas 126-129 |
| T019 |  | Test tool ACs: publish, validation, edit, pause, delete, detail | `npm test server/src/modules/tools/` green; all validation ACs pass; soft delete preserves loan history | T016 | spec Líneas 121-131 |
| T020 | [P] | Implement loanRepo: CRUD, overlap check, status transition, hasActiveLoans | `npm test server/src/modules/loans/loanRepo.test.ts` green; overlapping dates → conflict; status update is transactional; `hasActiveLoans(toolId)` returns correct boolean | T004 | spec §4 Data model; spec Líneas 135-151 |
| T021 |  | Implement loanService: create, transition, permission, overlap, auto-vencido | Unit tests: own tool → 409; overlap → 409; invalid transition → 409; overdue entregado → vencido | T020 | spec §4 Data flow #5-6, #7; spec Líneas 135-151 |
| T022 |  | Wire loans routes: POST /tools/:id/loans, GET /loans/:id, PATCH /loans/:id/status | Supertest: POST → 201 pending; PATCH invalid transition → 409; GET /loans/:id as non-owner → 404 | T021 | spec §3 Interfaces; spec Líneas 135-151 |
| T023 |  | Add background loan-scan cron (entregado → vencido) | `npm test server/src/modules/loans/loanScan.test.ts` green; overdue loan auto-transitioned to vencido | T021 | spec §4 Data flow #7; spec Línea 143 |
| T024 | [P] | Build LoanStatus badge component and LoanDetail page | LoanStatus renders color + text for each status; LoanDetail shows loan info + status change buttons | T022 | spec §2 Architecture; spec Línea 150 |
| T025 |  | Build RequestLoan form (on ToolDetail page) | Form validates startDate (≥today), endDate (≥startDate), note (≤300); submits → POST /api/tools/:id/loans | T022 | spec §2 Architecture; spec Líneas 135-146 |
| T026 |  | Build "Mis préstamos" tabs (pedí / me pidieron) | Tabs filter loans correctly; "pedí" shows madeLoans; "me pidieron" shows receivedLoans | T022 | spec §2 Architecture; spec Líneas 166-167 |
| T027 |  | Test loan ACs: create, transitions, overlap, concurrent, permissions, re-request | `npm test server/src/modules/loans/` green; all transition ACs pass; overlap detection works; re-request after termination works | T022 | spec Líneas 135-151 |
| T028 | [P] | Implement searchRepo: filtered list, pagination, case-insensitive, escape wildcards | `npm test server/src/modules/search/searchRepo.test.ts` green; "%" returns literal matches; case-insensitive search works | T004 | spec §4 Data model; spec Líneas 155-162 |
| T029 |  | Implement searchService: filter, paginate, escape | Unit tests: filter by category + neighborhood returns only matching; pagination returns ≤12 items | T028 | spec §4 Data flow #4; spec Líneas 155-162 |
| T030 |  | Wire tools list, me/tools, me/history routes | Supertest: GET /api/tools?page=-1 → 400; GET /api/me/tools → 200 + tools + receivedLoans + madeLoans; GET /api/me/history → 200 + terminated loans | T029 | spec §3 Interfaces; spec Líneas 155-167 |
| T031 |  | Build Home page with search bar and filters | Search bar filters by name, category, neighborhood; pagination works; 12 items per page | T030 | spec §2 Architecture; spec Líneas 155-162 |
| T032 |  | Build Profile page (tools, received loans, made loans, history) | Profile shows tools, received loans, made loans; history shows terminated loans (devuelto, rechazado, cancelado) | T030 | spec §2 Architecture; spec Líneas 166-167 |
| T033 |  | Wire me/password + me/account routes + build Password change + Account deletion UI | Supertest: PATCH /api/me/password → 204; DELETE /api/me/account → 204; UI forms validate inputs and call correct endpoints | T030 | spec §3 Interfaces; spec Líneas 116-117 |
| T034 |  | Test search + profile ACs: pagination, filters, wildcards, profile data, category validation | `npm test server/src/modules/search/` green; `npm test server/src/modules/me/` green; all ACs pass; category in fixed list validated | T030 | spec Líneas 155-167 |
| T035 |  | Test security ACs: body size, origin header, generic error messages | Supertest: POST with body > 10kb → 413; POST without Origin → 403; any error response has no stack trace | T003 | spec Líneas 171-173 |
| T036 |  | Test health endpoint | `GET /api/health` returns `{status:"ok",db:"connected"}` with dev DB; `{status:"ok",db:"disconnected"}` with bad DB URL | T002 | spec Línea 178 |
| T037 |  | Test password change + account deletion ACs | PATCH /api/me/password → 204, old password fails; DELETE /api/me/account → tools soft-deleted, loans anonymized | T033 | spec Líneas 116-117 |
| T038 |  | Accessibility audit: keyboard nav, visible focus, labels, contrast, screen reader errors | axe-core run on all pages (T009-T033) → 0 WCAG 2.2 AA violations; all forms have labels; focus visible on all interactive elements | T033 | constitution §6 |
| T039 |  | Responsive polish: mobile-first (320px), tablet (768px), desktop (1024px) | Layout renders correctly at 320px, 768px, 1024px; no horizontal scroll at 320px; touch targets ≥ 24×24px; all pages (T009-T033) | T033 | constitution §7 |
| T040 |  | All done-checks pass + integration smoke test | Every task's test suite passes; `npm test` green across server and client; manual: register → publish → request → accept → deliver → return flow works | all | spec §Acceptance |

### Per-task Interfaces

**T007 — Interfaces**
- Consumes: `userRepo.findEmail(email: string) -> User | null`; `userRepo.insert(user: CreateUserInput) -> User`
- Produces: `POST /api/auth/register` → `201 {token}` + `Set-Cookie: token=…; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`; `POST /api/auth/login` → `200 {token}` + cookie; `POST /api/auth/logout` → `204`
- Auth helpers: `auth.verifyPassword(plain: string, hash: string) -> boolean`; `auth.signToken(user: {id, email}) -> string`; `auth.isOwner(userId: UUID, ownerId: UUID) -> boolean`

**T013 — Interfaces**
- Consumes: `toolRepo.insert(tool: CreateToolInput, ownerId: UUID) -> Tool`; `toolRepo.update(id: UUID, updates: Partial<Tool>) -> Tool`; `toolRepo.softDelete(id: UUID) -> void`; `toolRepo.findByOwner(ownerId: UUID) -> Tool[]`; `auth.isOwner(userId: UUID, ownerId: UUID) -> boolean` (from T007)
- Produces: `POST /api/tools` → `201 Tool`; `PATCH /api/tools/:id` → `200 Tool` | `403` | `409`; `DELETE /api/tools/:id` → `204` | `409`

**T020 — Interfaces**
- Consumes: `loanRepo.insert(loan: CreateLoanInput) -> Loan`; `loanRepo.updateStatus(id: UUID, newStatus: LoanStatus, userId: UUID) -> Loan`; `loanRepo.findByTool(toolId: UUID) -> Loan[]`; `loanRepo.findByBorrower(borrowerId: UUID) -> Loan[]`; `loanRepo.findByOwner(ownerId: UUID) -> Loan[]`; `auth.isOwner(userId: UUID, loanToolOwnerId: UUID) -> boolean` (from T007); `auth.isBorrower(userId: UUID, loanBorrowerId: UUID) -> boolean` (from T007)
- Produces: `POST /api/tools/:id/loans` → `201 Loan` | `409`; `PATCH /api/loans/:id/status` → `200 Loan` | `409`; `GET /api/loans/:id` → `200 Loan` | `404`; `loanService.validateDates(startDate: Date, endDate: Date, tz: string) -> void`; `loanService.checkOverlap(toolId: UUID, startDate: Date, endDate: Date) -> boolean`
- Background: `loanScan.checkOverdue() -> void` (called by cron every hour)

**T028 — Interfaces**
- Consumes: `toolRepo.findAll(filters: SearchFilters, page: number, limit: number) -> {items: Tool[], total: number, pages: number}`
- Produces: `GET /api/tools` → `200 {items, total, page, pages}`

**T033 — Interfaces**
- Consumes: `authService.changePassword(userId: UUID, currentPassword: string, newPassword: string) -> void`; `authService.deleteAccount(userId: UUID, password: string) -> void`
- Produces: `PATCH /api/me/password` → `204`; `DELETE /api/me/account` → `204`

## Review Workload Forecast

| Dimension | Forecast | Why |
| --- | --- | --- |
| Estimated changed lines | 3500-5500 | 3 server modules (auth, tools, loans) + search + me; 7+ frontend pages; 3 DB migrations; extensive tests |
| Files / areas | 25-35 files | server: config, migrations, 5 modules × (repo+service+controller+routes+tests); client: 6 pages + 4 components + auth context; shared: env, seed |
| Review risk | medium | Cross-stack (server + client), security-sensitive (auth, bcrypt, JWT, CSRF), data integrity (transactions, soft delete, anonymization) |
| Suggested delivery | ask-on-risk | 6 phases, each verifiable independently. Recommend feature-track branch; merge per phase after verify passes. |


```json result-envelope
{
  "status": "complete",
  "executive_summary": "Technical plan for Prestoteca MVP: monolith architecture (Express + React), 3 PostgreSQL tables, 6 implementation phases (A-F), 40 tasks, TDD strategy mapped to all 58 acceptance criteria with spec line references.",
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
