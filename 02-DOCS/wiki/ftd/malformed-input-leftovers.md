---
author: HRamiroAlbornoz
branch: main
status: in-progress
---
# Datos mal armados que quedaban: nombre vacío al editar, búsqueda con parámetros repetidos e id que no es UUID

## Intent

Ítems 5d, 5e y 5f del backlog, encontrados por los revisores de `server-input-bugs`. Los tres son del mismo tipo que
ese FTD: un pedido mal armado que hoy da 500 o queda aceptado. Hernán aprobó juntarlos en este FTD el 2026-11-14.

1. **(5d) Editar una herramienta no valida el nombre ni la descripción.** `PATCH /api/tools/:id` con
   `{"name": "   "}` guarda un nombre vacío, y con una descripción de 2000 caracteres la guarda entera. Publicar sí
   valida las dos cosas (nombre de 3 a 60, descripción obligatoria de hasta 500), pero lo hace en su ruta, y editar no
   pasa por ahí.
2. **(5e) La búsqueda no revisa el tipo de sus parámetros.** Express convierte `?q=a&q=b` en una lista, y
   `toolRepo.findAll` llama a `.replace` sobre ella → 500. Con `category` o `neighborhood` repetidos no explota, pero
   filtra con un texto raro (`a,b`) y devuelve resultados que nadie pidió.
3. **(5f) Un id que no es UUID da 500 en vez de 404.** `GET /api/tools/not-a-uuid` → 500, porque Postgres rechaza ese
   texto en una columna `uuid` (error `22P02`). Un UUID válido que no existe sí da 404.

## Scope

**Entra:**
- **(5d)** En `PATCH /api/tools/:id`, después del chequeo de tipo que ya existe y antes de llamar al servicio, las
  mismas reglas que al publicar, solo para los campos que llegan:
  - `name` recortado con menos de 3 o más de 60 caracteres → 400 `TOOL_NAME_LENGTH`;
  - `description` recortada vacía → 400 `TOOL_MISSING_FIELDS`; con más de 500 → 400 `TOOL_DESCRIPTION_TOO_LONG`.
  Los mismos códigos y mensajes que publicar, así que la app ya los muestra en español. Como el chequeo de tipo, va
  **antes** del de dueño: un desconocido recibe el mismo 400 y no se entera de nada.
- **(5e)** En `GET /api/tools`, si `q`, `category` o `neighborhood` llegan y no son texto (por ejemplo, repetidos) →
  400 `BAD_REQUEST`. `page` ya se valida.
- **(5f)** Los repositorios tratan un id con formato inválido como «no existe»: `toolRepo.findById`,
  `loanRepo.findById` y la búsqueda de la herramienta que hace `POST /api/tools/:id/loans` atrapan el error `22P02` de
  Postgres y devuelven «sin resultado». Así cada ruta responde su 404 de siempre (`TOOL_NOT_FOUND`,
  `LOAN_NOT_FOUND`). Un helper chico, `isInvalidIdError(err)`, en un solo lugar.
  - **Por qué en los repositorios y no en las rutas:** la regla «un id es un UUID» la impone Postgres, y el lugar que
    habla con Postgres es el repositorio. Además, los tests de las rutas usan ids como `tool-1` o `loan-1`, que no son
    UUID: validar el formato en las rutas obligaría a cambiar cientos de tests sin ganar nada. Las consultas que
    escriben (`update`, `softDelete`, `pause`) siempre corren después de un `findById`, así que no necesitan el cambio.
- Tests de cada caso, con el ID en el nombre, y la prueba en staging.

**No entra:**
- Validar `neighborhood` contra la lista fija de barrios (ítem 6).
- El token corto con renovación (ítem 5g).

**Quién:** el código lo escribe Qwen (OpenCode vía Orca), lanzado después de preguntarle a Hernán. Claude corre los
checks, revisa el diff, prueba mutantes y aplica la revisión que pida `rsc risk`.

## Checklist

- [ ] **L1 — (5d) Editar valida nombre y descripción.** Tests en `toolsRoutes.test.ts`:
  - L1a: editar con `name` de 2 caracteres, de 61 y `'   '` → 400 `TOOL_NAME_LENGTH`, la herramienta no cambia.
  - L1b: editar con `description` `'   '` → 400 `TOOL_MISSING_FIELDS`; con 501 caracteres → 400
    `TOOL_DESCRIPTION_TOO_LONG`; la herramienta no cambia.
  - L1c: nombre de 3 y de 60 caracteres, y descripción de 500 → 200 (los bordes válidos siguen andando).
  - L1d: un desconocido que edita con un nombre de 2 caracteres → el mismo 400, no 403.
- [ ] **L2 — (5e) La búsqueda rechaza parámetros que no son texto.** Tests en `toolsRoutes.test.ts`:
  - L2a: `?q=a&q=b`, `?category=a&category=b` y `?neighborhood=a&neighborhood=b` → 400 `BAD_REQUEST`; el servicio de
    búsqueda no se llamó.
  - L2b: `?q=taladro` sigue llegando al servicio como texto.
- [ ] **L3 — (5f) Un id inválido es «no existe».** Tests en `toolRepo.test.ts`, `loanRepo.test.ts` y
  `loansRoutes.test.ts`:
  - L3a: `findById` con una base falsa que tira un error con `code: '22P02'` → devuelve `null`, en los dos
    repositorios.
  - L3b: con cualquier otro error (por ejemplo `code: '08006'`, conexión caída) → el error sigue saliendo (no se
    esconde como «no existe»).
  - L3c: `POST /api/tools/:id/loans` cuando la búsqueda de la herramienta tira `22P02` → 404 `TOOL_NOT_FOUND`.
  - L3d: el helper `isInvalidIdError` reconoce `22P02` y nada más.
- [ ] **Controles:** en `server/`, `npx vitest run` y `npx tsc -b` en verde; `rsc risk` y la revisión que pida.
- [ ] **Staging:** `GET /api/tools/not-a-uuid` → 404; `GET /api/loans/not-a-uuid` con sesión → 404;
  `GET /api/tools?q=a&q=b` → 400; editar una herramienta propia con `{"name":"   "}` → 400 y el nombre no cambia.

## Evidence

(Vacío: todavía no se completó ninguna tarea.)

**Base (2026-11-14, `a15a5d4`):** servidor 32 archivos, 633/633.

## Next

Armar el pedido para Qwen (L1-L3), revisarlo con un agente de contexto fresco antes de mandarlo (como se hizo con 5c),
y preguntarle a Hernán antes de lanzarlo.
