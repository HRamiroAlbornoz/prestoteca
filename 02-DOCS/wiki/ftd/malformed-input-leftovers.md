---
author: HRamiroAlbornoz
branch: main
status: in-progress
---
# Datos mal armados que quedaban: nombre vacío al editar, búsqueda con parámetros repetidos e id que no es UUID

## Intent

Ítems 5d, 5e y 5f del backlog, encontrados por los revisores de `server-input-bugs`. Los tres son del mismo tipo que
ese FTD: un pedido mal armado que hoy da 500 o queda aceptado. Hernán aprobó juntarlos en este FTD el 2026-11-14.

1. **(5d) Editar una herramienta guarda una descripción vacía.** `PATCH /api/tools/:id` con
   `{"description": "   "}`: la ruta la recorta a `''` y `ToolRepository.update` solo mira que no pase de 500
   caracteres. Publicar exige descripción; editar también tiene que exigirla. (Corrección del 2026-11-14: este FTD
   decía antes que editar tampoco validaba el nombre ni el largo de la descripción. **Era falso**: `ToolRepository.update`
   ya rechaza un nombre de menos de 3 o más de 60 caracteres, `'   '` incluido, y una descripción de más de 500. El
   dato venía del backlog, anotado a partir de lo que dijo un revisor sin comprobarlo en el código. Lo encontró la
   revisión del pedido.)
2. **(5e) La búsqueda no revisa el tipo de sus parámetros.** Express convierte `?q=a&q=b` en una lista, y
   `toolRepo.findAll` llama a `.replace` sobre ella → 500. Con `category` o `neighborhood` repetidos no explota, pero
   filtra con un texto raro (`a,b`) y devuelve resultados que nadie pidió.
3. **(5f) Un id que no es UUID da 500 en vez de 404.** `GET /api/tools/not-a-uuid` → 500, porque Postgres rechaza ese
   texto en una columna `uuid` (error `22P02`). Un UUID válido que no existe sí da 404.

## Scope

**Entra:**
- **(5d)** En `ToolRepository.update`, junto a las reglas que ya tiene: una descripción vacía (o solo espacios) → 400
  `TOOL_MISSING_FIELDS`, el mismo código que usa publicar, así que la app ya muestra el mensaje en español. Va en el
  repositorio y no en la ruta, para no repetir reglas que ya viven ahí. La ruta `PATCH` no cambia.
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

- [ ] **L1 — (5d) Editar no deja la descripción vacía.** Tests en `toolRepo.test.ts`:
  - L1a: una fila más en el `it.each` que ya prueba las reglas de `update`: descripción `''` → `TOOL_MISSING_FIELDS`
    y no se escribe nada.
  - L1b: descripción `'   '` (por si alguien llama sin recortar) → `TOOL_MISSING_FIELDS` y no se escribe nada.
  - L1c: una descripción válida se sigue guardando.
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
  `GET /api/tools?q=a&q=b` → 400; editar una herramienta propia con `{"description":"   "}` → 400 y la descripción no
  cambia.

## Evidence

**Revisión del pedido (2026-11-14, agente de contexto fresco, a pedido de Hernán):** SEND AFTER FIXES, todo aplicado
reescribiendo el pedido. Lo principal: (1) **5d estaba mal descripto** (ver Intent): el repositorio ya valida el
nombre y el largo; lo único que pasa es la descripción vacía, así que el arreglo se achicó a una regla en
`ToolRepository.update` y la ruta `PATCH` no se toca; (2) se dan las líneas `import` exactas; (3) los tests no los
revisa nadie con TypeScript (vitest solo saca los tipos), se aclaró y se permitió `as never` en los falsos de L3;
(4) el espía de la búsqueda va dentro de cada test L2 (el `beforeEach` restaura todo); (5) se sumaron los mutantes que
faltaban para el otro repositorio; (6) el comentario de `TOOL_MISSING_FIELDS` en `errorCodes.ts` pasa a decir «al
publicar o editar». Verificado sin cambios: las 6 rutas con id llegan a Postgres por `toolRepo.findById`,
`loanRepo.findById` o la búsqueda de `POST /tools/:id/loans` (las escrituras siempre van después de una de esas);
`let toolResult` compila; Express 5 usa el parser de query `simple` (`?q[a]=1` no arma un objeto); ningún test viejo
se rompe.

**Base (2026-11-14, `a15a5d4`):** servidor 32 archivos, 633/633.

## Next

Pedido para Qwen armado (2026-11-14): `C:\Users\hralb\AppData\Local\Temp\claude\prestoteca-briefs\L-brief.md`, fuera
del proyecto (L1a-L3d, 9 mutantes), revisado y reescrito. Siguiente: lanzarlo a Qwen en el worktree nuevo
`l-malformed-input` cuando Hernán diga que sí.
