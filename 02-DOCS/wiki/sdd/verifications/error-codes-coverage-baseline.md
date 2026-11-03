---
type: verification
title: error-codes — línea base de cobertura (T017)
description: Cobertura de server y client antes de tocar código de error-codes, para comparar en el cierre (T016).
tags: [sdd, verification, coverage, errors]
timestamp: 2026-11-03T16:50:00Z
topic: sdd
slug: error-codes
---

# error-codes — línea base de cobertura (T017)

> Tarea T017 del [plan](../plans/error-codes.md). Rama `feat/error-codes-server`, antes de T001.
> Herramienta: `@vitest/coverage-v8@5.1.0` (vitest 5.1.0), instalada en `server` y `client`.
> Criterio de la [constitución v1.1.0](../constitution.md), principio 6: ≥ 80 % de líneas **por archivo cambiado**.

## Cómo se midió

- Server: `cd server && npx vitest run --coverage` → 27 archivos de test, 268 tests, todos verdes.
- Client: `cd client && npx vitest run --coverage --coverage.provider=v8` → 15 archivos de test, 181 tests, todos verdes.

## Totales

| Lado | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| server | 83.84 % | 77.27 % | 94.48 % | 84.75 % |
| client | 82.43 % | 75.94 % | 80.48 % | 85.24 % |

**Punto de partida, no un defecto de este cambio:** la corrida del server termina con
`ERROR: Coverage for branches (77.27%) does not meet global threshold (80%)` (umbrales globales en
`server/vitest.config.ts`). El umbral de este cambio es por archivo cambiado, no global.

## Por archivo — server (% líneas)

| Archivo | Líneas | Branches |
| --- | --- | --- |
| src/index.ts | 73.33 | 50 |
| src/routes.ts | 95 | 50 |
| auth/authRoutes.ts | 90.69 | 90 |
| auth/authService.ts | 100 | 100 |
| auth/userRepo.ts | 90 | 74.19 |
| config/env.ts | 100 | 92.85 |
| db/pool.ts | 80 | 100 |
| db/transaction.ts | 100 | 100 |
| errors/AppError.ts | 89.65 | 71.42 |
| loans/appDate.ts | 100 | 100 |
| loans/loanRepo.ts | 87.5 | 71.42 |
| loans/loanScan.ts | 88.88 | 85.71 |
| loans/loanService.ts | 100 | 93.1 |
| loans/loansRoutes.ts | **71.95** | 73.17 |
| me/accountDeletion.ts | 100 | 83.33 |
| me/meAccountRoutes.ts | 81.48 | 81.81 |
| me/meRoutes.ts | **72.72** | 50 |
| middleware/auth.ts | **54.54** | 87.5 |
| middleware/origin.ts | 100 | 100 |
| middleware/rateLimit.ts | 83.87 | 60 |
| search/searchRepo.ts | 88.88 | 80 |
| search/searchService.ts | 87.5 | 90 |
| seed/index.ts | 93.54 | 50 |
| tools/toolRepo.ts | **78.37** | 69.38 |
| tools/toolService.ts | 88.23 | 80.76 |
| tools/toolsRoutes.ts | **75.86** | 73.58 |

## Por archivo — client (% líneas)

| Archivo | Líneas | Branches |
| --- | --- | --- |
| App.tsx | 100 | 100 |
| components/LoanStatus.tsx | 100 | 50 |
| components/NavBar.tsx | 100 | 100 |
| components/ToolCard.tsx | 100 | 50 |
| contexts/AuthContext.tsx | 96.66 | 66.66 |
| pages/HomePage.tsx | 94.73 | 78.2 |
| pages/LoanDetailPage.tsx | **79.41** | 74.5 |
| pages/LoginPage.tsx | 96 | 92.85 |
| pages/MyLoansPage.tsx | 91.66 | 95.45 |
| pages/ProfilePage.tsx | **51.72** | 49.25 |
| pages/PublishForm.tsx | 93.05 | 90.76 |
| pages/RegisterPage.tsx | 96 | 87.5 |
| pages/RequestLoanPage.tsx | 94.11 | 94.87 |
| pages/ToolDetailPage.tsx | 85.96 | 61.22 |
| utils/appDate.ts | 100 | 100 |
| utils/toolForm.ts | 100 | 100 |

En **negrita**, los archivos bajo 80 % de líneas (server y client). Si error-codes toca uno, la tarea
dueña sube sus tests hasta ≥ 80 % (lo exige el cierre, T016).

## Cómo leer la cobertura por archivo (para T016)

La tabla que imprime la consola **no sirve para leer por archivo**: oculta los archivos con 100 % en
todas las métricas (por eso no muestra `NavBar.tsx` ni `App.tsx`) y corta los nombres largos
(`...etailPage.tsx` puede ser `LoanDetailPage` o `ToolDetailPage`). Las tablas de arriba salen del
reporte JSON, que trae la ruta completa de cada archivo:

```bash
npx vitest run --coverage --coverage.reporter=json-summary --coverage.reportsDirectory=<carpeta temporal>
```

Se lee `<carpeta temporal>/coverage-summary.json`: una entrada por archivo con `lines.pct` y `branches.pct`.
En el client se agrega `--coverage.provider=v8`. Un archivo que ningún test importa no aparece:
`main.tsx` es el único caso hoy, y error-codes no lo toca.
