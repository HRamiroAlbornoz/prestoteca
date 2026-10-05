# Resumen Context7 — Versiones y configuraciones actuales

> Fecha: 2026-10-04 · Consultado antes de `implement`

## Versiones detectadas

| Librería | Versión actual | Notas clave |
|----------|---------------|-------------|
| **Express** | 5.2.1 | Node.js >= 18. `app.disable('x-powered-by')` obligatorio. `app.set('trust proxy', 1)` para proxies. Routing case-insensitive por defecto. |
| **Vite** | 8.1.0 | React 19.2.7, TypeScript ~6.0.2, `@vitejs/plugin-react` ^6.0.3. Linting con `oxlint`. `tsc -b` para typecheck. |
| **React** | 19.2.7 | `@types/react` ^19.2.17, `@types/react-dom` ^19.2.3. |
| **React Router** | 7.x | Config en `react-router.config.ts`. `react-router typegen` para tipos. SSR opcional (`ssr: false`). |
| **Vitest** | latest | `vitest/jsdom` environment, `setupFiles`, `vitest/globals`. Typecheck config disponible. |
| **Zod** | latest | Requiere TS `strict: true`. Tested against TS v5.5+. `safeParse()` preferred sobre try/catch. `jitless` config para CSP. |
| **Helmet** | 8.0.0+ | HSTS max-age default: 365 días (antes 180). `helmet()` middleware. CSP configurable por directorio. |
| **Tailwind CSS** | latest | Config ESM/TypeScript con `satisfies Config`. `npx tailwindcss init --ts`. |
| **oxlint** | ^1.71.0 | Linter alternativo a ESLint (usado en template Vite React TS). |

## Decisiones de configuración derivadas

1. **Vite + React 19**: Usar `@vitejs/plugin-react` ^6.0.3. Separar `tsconfig.node.json` para vite.config.ts.
2. **React Router v7**: Usar `react-router.config.ts` con `ssr: false` (SPA). `react-router typegen` en build script.
3. **Helmet 8**: HSTS 365 días default — OK para MVP. Deshabilitar `upgrade-insecure-requests` en desarrollo.
4. **Express 5**: `app.disable('x-powered-by')` obligatorio. `app.set('trust proxy', 1)` para Railway.
5. **Zod**: `safeParse()` para validación. `z.config({ jitless: true })` si CSP lo requiere.
6. **Linter**: oxlint (template Vite) o ESLint — el plan usa ESLint/Prettier (constitution §2). oxlint es más rápido pero ESLint tiene más plugins. Mantener ESLint + Prettier para consistencia con constitution.
7. **TypeScript**: ~6.0.2 con `verbatimModuleSyntax`, `moduleDetection: force`, `noUnusedLocals`, `noUnusedParameters`.

## No consultado (no disponible en Context7)

- **Supertest**: Conocido bien — `supertest(app)(method)(path).expect(status)`.
- **bcrypt**: Conocido bien — `bcrypt.hash(password, 12)`, `bcrypt.compare(password, hash)`. Max 72 chars.
