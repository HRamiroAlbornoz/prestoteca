---
type: spec
title: Spec — Toda entrada externa del server validada por un esquema declarado
description: WHAT and WHY para que cada ruta del server valide cuerpo, parámetros de búsqueda e id con un esquema (principio 13), sin cambiar ninguna respuesta de hoy salvo dos 500 que pasan a 400.
tags: [sdd, spec, validation, server]
timestamp: 2026-11-20T19:00:00Z
topic: sdd
slug: zod-routes
status: draft
---

# Spec — Toda entrada externa del server validada por un esquema declarado

> Slug: `zod-routes` · Status: draft · Created: 2026-11-20
> Inherits: [constitution](../constitution.md) (principio 13: "All external data validated server-side (Zod schemas,
> length limits, safeParse)")
> Origen: punto 8 del backlog y decisión [D15](../decisions.md) (excepción aceptada en server-sessions, "Zod después,
> como feature"). Enmienda la spec [error-codes](error-codes.md) con la fila 40.

## Problem & why

El principio 13 de la constitución pide que todo dato externo se valide en el server con esquemas Zod y `safeParse`.
Hoy solo las variables de entorno lo cumplen. Las rutas validan con chequeos escritos a mano, cada una con su estilo:
algunos en la ruta, otros en el servicio o en el repositorio (la lista de categorías se revisa en tres lugares).

Eso tiene dos costos.

1. **Cada campo nuevo puede olvidar su chequeo de tipo.** En 5b, 5d, 5e y 5f aparecieron cuatro bugs de esta misma
   clase ("un tipo inesperado da 500"). Los encontraron revisiones, no una regla.
2. **Quedan dos entradas mal formadas que probablemente dan 500** (deducido del código, no probado en Postgres):
   - una fecha de préstamo que no es una fecha (`"mañana"`, `"2099-02-30"`): pasa la comparación de texto y la rechaza
     la base;
   - un número de página enorme (`?page=99999999999999999999`): el desplazamiento desborda el entero de la base.

Además, `analyze` marca el principio 13 como incumplido (F1) en cada feature nueva hasta que esto se haga.

## Cost of not building it

- Para quien usa la pantalla: **casi nada**. La pantalla siempre manda fechas reales y páginas enteras, así que nunca
  llega a los dos 500.
- Para quien llama a la API a mano o con un script: dos respuestas 500 donde corresponde un 400. Eso ensucia el log de
  errores y esconde bugs reales entre ruido.
- Para el proyecto: la regla escrita y el código siguen diciendo cosas distintas, y `analyze` lo seguirá marcando como
  CRITICAL en cada ciclo. Cada ruta o campo nuevo repite el riesgo de 5b.

El costo honesto es chico para el usuario y moderado para el mantenimiento.

## The cheapest alternative

**Un FTD chico que solo arregle los dos 500** (una regla de formato para las fechas y un tope para `page`), más enmendar
el principio 13 para que describa los chequeos a mano. Es medio día de trabajo. Fue la opción A de D15 y Hernán la
descartó: debilita la regla por escrito y deja la validación repartida como está.

**No hacer nada** también es posible: el usuario de la pantalla no nota diferencia. Pero F1 queda abierto para siempre.

## Goals

- Cada ruta que recibe datos externos (cuerpo, parámetros de búsqueda, id en la URL) los revisa contra un esquema
  declarado **antes de hacer cualquier trabajo**: no lee la base, no calcula hashes.
- Cada entrada que hoy tiene una respuesta fijada (status + código) **sigue recibiendo exactamente la misma**. Eso
  incluye cuál error gana cuando fallan varios campos a la vez.
- Ninguna entrada mal formada en cuerpo, query o id produce un 500.
- Una fecha de préstamo mal formada recibe un error propio (fila 40), con un texto que ve el usuario.
- El principio 13 se cumple en las rutas y F1 deja de aparecer en `analyze`.

## Non-goals / out of scope

- **La cookie de sesión y el encabezado `Origin`.** Ya tienen chequeos estrictos y propios, con pruebas de seguridad.
  No se tocan (Hernán, 2026-11-20).
- **Cambiar cualquier respuesta que existe hoy**: status, código, texto de la tabla de errores u orden de precedencia.
  Las únicas excepciones son las de *Behaviour*.
- **Reglas nuevas que hoy no existen**: formato de email en el registro, largo máximo de la contraseña actual en el
  cambio de contraseña, rechazar campos desconocidos, recortar espacios donde hoy no se recortan (las contraseñas del
  cambio de contraseña).
- **Las reglas que necesitan la base**: que la herramienta exista, que no esté pausada, la superposición de fechas, el
  dueño, las transiciones de estado del préstamo, la cuenta activa. Siguen como están.
- **Validar las respuestas** del server (la salida).
- **Los formularios del cliente.** Ya usan Zod (`zod/mini`). El cliente solo suma el texto de la fila 40.
- **El servicio de respaldos** (`backup/`), el límite de 10 kb del cuerpo, los límites de pedidos por minuto y las
  variables de entorno (ya validadas).
- **Lo que un agente podría agregar "por las dudas"**: mensajes de error por campo, una respuesta con la lista de todos
  los campos que fallaron, un middleware genérico que adivine el esquema por la URL.

## Users & context

- **La pantalla de Prestoteca** (el cliente web). Manda siempre datos bien formados. No debería notar ningún cambio.
- **Quien llama a la API directo** (un script, curl, un cliente roto o malicioso). Es quien ve las respuestas a datos mal
  formados.
- **Quien agrega o cambia una ruta** (Hernán, o Qwen con un brief). Necesita que el lugar donde vive la regla de cada
  campo sea uno solo y obvio.

## What the user can do

Lo mismo que hoy, sin permisos nuevos. Cualquier cliente puede mandar un pedido a cualquier ruta. Las rutas protegidas
siguen pidiendo sesión **antes** de validar el cuerpo, como hoy: sin sesión, la respuesta sigue siendo
`SESSION_REQUIRED` aunque el cuerpo esté mal.

Rutas que reciben datos externos (el alcance):

| Ruta | Entrada |
| --- | --- |
| `POST /api/auth/register` | cuerpo: `name`, `email`, `password`, `neighborhood` |
| `POST /api/auth/login` | cuerpo: `email`, `password`, `remember` |
| `GET /api/tools` | query: `page`, `q`, `category`, `neighborhood` |
| `GET /api/tools/:id`, `DELETE /api/tools/:id` | id |
| `POST /api/tools` | cuerpo: `name`, `description`, `category`, `condition` |
| `PATCH /api/tools/:id` | id + cuerpo: `name`, `description`, `category`, `condition`, `is_paused` |
| `POST /api/tools/:id/loans` | id + cuerpo: `startDate`, `endDate`, `note` |
| `GET /api/loans/:id` | id |
| `PATCH /api/loans/:id/status` | id + cuerpo: `status` |
| `GET /api/loans` | query: `type` |
| `PATCH /api/me/password` | cuerpo: `currentPassword`, `newPassword` |

Las rutas sin entrada externa (logout, `/api/me`, `/api/me/tools`, `/api/me/history`, borrar la cuenta, cerrar las
otras sesiones, health) quedan fuera, porque no tienen nada que validar.

## What result they get

La referencia aprobada es **la respuesta de hoy**: cada caso que las pruebas actuales fijan (status + código) es el
resultado esperado. Las únicas respuestas nuevas son estas:

| Entrada | Hoy (deducido) | Después |
| --- | --- | --- |
| `startDate` o `endDate` presente pero no es un día real con formato `AAAA-MM-DD` (`"mañana"`, `"2099-02-30"`) | probablemente 500 `INTERNAL_ERROR` | 400 `LOAN_DATE_INVALID` (fila 40) |
| una fecha real sin ceros (`"2026-1-5"`) | la base la acepta, pero la comparación de texto con "hoy" y con la otra fecha da resultados equivocados (p. ej. "ya pasó" para una fecha futura) | 400 `LOAN_DATE_INVALID` (fila 40) |
| `page` que no es solo dígitos (`1abc`, `1.5`, `%202`, `-1`, `0`) | se acepta como 1 o 2, o 400 | 400 `BAD_REQUEST` |
| `page` de solo dígitos pero demasiado grande para representarse | probablemente 500 | 400 `BAD_REQUEST` |

**Fila 40 nueva en la tabla de [error-codes](error-codes.md)** (texto elegido por Hernán el 2026-11-20):

| # | Situación | Texto que ve el usuario |
| --- | --- | --- |
| 40 | Alguna fecha del pedido no es un día real del calendario con formato AAAA-MM-DD | Las fechas tienen que ser días reales del calendario, con el formato AAAA-MM-DD. |

El formato de la respuesta de error no cambia: `{ "error": { "code", "message" } }`.

## What it must respect

- **D15**: esta es la feature que D15 prometió. Cerrarla es cumplir el principio 13, no enmendarlo.
- **Lo que ya arreglaron 5b, 5d, 5e y 5f** ([server-input-bugs](../../ftd/server-input-bugs.md),
  [malformed-input-leftovers](../../ftd/malformed-input-leftovers.md)):
  - un tipo inesperado en un campo de texto (número, lista, objeto) se trata como "falta" donde hoy se hace así;
  - sin cuerpo, o con un cuerpo que no es JSON, se responde como si el cuerpo estuviera vacío;
  - un parámetro de búsqueda repetido (`?q=a&q=b`) da 400;
  - la descripción vacía en la edición da 400;
  - **un id que no es un UUID da 404** (`TOOL_NOT_FOUND` / `LOAN_NOT_FOUND`), igual que un UUID que no existe. No se
    convierte en 400.
- **La regla de `remember` de [server-sessions](server-sessions.md)**: ausente = no; si no, exactamente `true` o
  `false`; `null` da `BAD_REQUEST`.
- **Lo que cada ruta recorta o no**: el registro y el login recortan espacios y pasan el email a minúsculas; el cambio
  de contraseña **no** recorta las contraseñas; las fechas y la nota se recortan.
- **La spec [error-codes](error-codes.md)**: cada código nuevo tiene su fila, su texto en el cliente y su prueba en la
  misma rama; la tabla de códigos del server y la del cliente no se desalinean.
- **El mismo cuerpo vale igual en JSON o en formulario**: el server acepta los dos formatos, así que las reglas no
  dependen de cuál llegó.
- **Constitución**: principio 4 (calidad: `tsc -b` y lint en 0), principio 6 (cobertura ≥ 80 % de líneas por archivo
  cambiado), principio 10 (rama + PR), principio 13 (el resto queda como está).

## How it proves it

- **Pruebas por ruta a través de la app real**, una por cada fila de *What result they get* y una por cada regla de
  *What it must respect*. Quedan en la suite del server y corren en cada `npm test`.
- **La suite actual sin cambiar ninguna expectativa.** Las pruebas existentes que fijan status y código pasan sin
  editar lo que esperan. Un diff de los `it(` y de los `expect` de las pruebas viejas lo muestra.
- **Un control en la suite** que falla si una ruta lee cuerpo, query o id sin pasarlo por un esquema declarado. Hay que
  verlo fallar una vez contra una ruta escrita a propósito sin esquema.
- **Mutantes**: sacar el esquema de una ruta, o aflojar una regla, hace fallar alguna prueba.
- **Staging con Postgres real**: los dos 500 de hoy se reproducen antes del cambio (o se descartan si no ocurren) y dan
  400 después. Queda escrito en el archivo de verificación.
- **El cliente**: la fila 40 tiene su texto y su prueba, que el test de la tabla de códigos exige.

## Behaviour

- **Camino principal:** una entrada válida produce exactamente la misma respuesta que hoy.
- **Entrada inválida:** la ruta responde el error que corresponde **sin hacer ningún trabajo**. No consulta la base, no
  calcula hashes y no cambia nada.
- **Varios campos inválidos a la vez:** gana el mismo error que gana hoy. El orden de cada ruta se conserva.
- **Fechas del préstamo:** si falta alguna → fila 24 (como hoy). Si está pero no es un día real `AAAA-MM-DD` → fila 40.
  Después vienen, como hoy, "ya pasó" (25) y "fin antes que inicio" (26). Se aceptan los años bisiestos (`2028-02-29`
  vale, `2027-02-29` no).
- **Página:** ausente = 1, como hoy. Si viene, tiene que ser solo dígitos, con valor ≥ 1 y que se pueda representar.
  Si no, `BAD_REQUEST`. Una página válida pero más allá de la última devuelve el listado vacío, como hoy.
- **Campos desconocidos:** se ignoran, como hoy.
- **Lo que no se revela:** el `message` de un error de validación no repite el valor que mandó el cliente.

## Acceptance criteria

- **AC-1** — Given cualquier pedido que hoy tiene una respuesta fijada por una prueba, When se manda después del
  cambio, Then recibe el mismo status y el mismo código.
- **AC-2** — Given un pedido a una ruta del alcance con dos o más campos inválidos, When se manda, Then gana el mismo
  código que hoy (una prueba por ruta con al menos un par de campos).
- **AC-3** — Given un usuario con sesión y una herramienta disponible, When pide un préstamo con
  `startDate: "mañana"`, Then recibe 400 `LOAN_DATE_INVALID`.
- **AC-4** — Given lo mismo, When `endDate` es `"2099-02-30"`, `"2026-1-5"` o `"2027-02-29"`, Then recibe 400
  `LOAN_DATE_INVALID` en cada caso; y con `"2028-02-29"` como fin válido no recibe ese código.
- **AC-5** — Given lo mismo, When falta `startDate` y `endDate` es `"mañana"`, Then recibe 400 `LOAN_DATES_MISSING`
  (la fila 24 gana a la 40).
- **AC-6** — Given lo mismo, When las fechas tienen espacios alrededor (`" 2099-01-10 "`), Then se aceptan como hoy.
- **AC-7** — Given `GET /api/tools`, When `page` es `1abc`, `1.5`, `%202`, `-1`, `0` o `99999999999999999999`, Then
  recibe 400 `BAD_REQUEST` en cada caso.
- **AC-8** — Given `GET /api/tools`, When `page` falta o es `2`, Then responde 200 como hoy.
- **AC-9** — Given una ruta del alcance, When la entrada es inválida, Then la base no recibe ninguna consulta y no se
  calcula ningún hash.
- **AC-10** — Given una ruta con `:id`, When el id no es un UUID, Then sigue recibiendo 404 con el código "no existe"
  de esa entidad.
- **AC-11** — Given una ruta protegida, When se llama sin sesión y con el cuerpo inválido, Then recibe
  `SESSION_REQUIRED`.
- **AC-12** — Given el registro o el login, When el cuerpo llega como formulario en vez de JSON, Then aplica las mismas
  reglas y devuelve los mismos códigos.
- **AC-13** — Given el cambio de contraseña, When `newPassword` tiene espacios al principio o al final, Then no se
  recortan (la contraseña guardada los conserva), como hoy.
- **AC-14** — Given el control de la suite, When una ruta del alcance lee cuerpo, query o id sin un esquema declarado,
  Then el control falla.
- **AC-15** — Given el cliente, When el server responde `LOAN_DATE_INVALID`, Then la pantalla muestra el texto de la
  fila 40.
- **AC-16** — Given un error de validación, When se lee su `message`, Then no contiene el valor que mandó el cliente.
- **AC-17** — Given staging con Postgres real, When se mandan las entradas de AC-3 y AC-7, Then responden 400 (y queda
  escrito si antes daban 500).

## Points to clarify

- **suposición tomada** — el texto de desarrollo (`message`) de cada error de hoy se conserva palabra por palabra.
  *Base:* algunas pruebas lo fijan (p. ej. `originWiring.test.ts:64`) y AC-1 pide no tocar expectativas. *Riesgo:* si
  conviene unificar esos textos, cambian pruebas y se vuelve un cambio visible para quien lee la API.
- **suposición tomada** — el código de la fila 40 se llama `LOAN_DATE_INVALID` y su status es 400. *Base:* el patrón de
  nombres `LOAN_*` y el resto de errores de entrada. *Riesgo:* bajo; solo cambia el nombre.
- **suposición tomada** — la fila 40 se revisa después de la 24 (falta) y de la 27 (nota larga), y antes de la 25 (ya
  pasó). *Base:* hoy el orden es tipo de nota → falta → nota larga → ya pasó → fin antes que inicio; el formato tiene que
  ir justo antes de las comparaciones que lo necesitan. *Riesgo:* con una nota larga y una fecha mala a la vez gana la
  27. No hay prueba de hoy que fije ese par.
- **suposición tomada** — "demasiado grande para representarse" se define en el plan como un tope fijo de página.
  *Base:* con 12 por página, cualquier tope razonable ya está muy por encima de la última página real. *Riesgo:* si el
  tope fuera menor que una página real, esa página daría 400; no puede pasar con la cantidad de herramientas que tiene la
  app.
- **suposición tomada** — los dos 500 de hoy son deducciones del código. *Base:* lectura de `loansRoutes.ts` y del
  cálculo del desplazamiento de página. *Riesgo:* si en Postgres no dan 500, las filas de "Hoy" cambian, pero el
  resultado "Después" es el mismo. AC-17 lo deja escrito.
- **pregunta abierta** — el registro y el login recortan la contraseña, pero el cambio de contraseña no. Alguien que
  cambia a `" clave123 "` no puede volver a entrar, porque el login manda `"clave123"`. Es un bug de hoy, deducido del
  código, que esta spec conserva (AC-13). ¿Entra en este cambio (y cuál de las dos reglas gana) o va como ítem propio del
  backlog?
- **decisión diferida** — unificar en un solo lugar la regla de la lista de categorías y condiciones (hoy en ruta,
  servicio y repositorio). Es limpieza interna; el plan decide si entra o queda para después.
- **decisión diferida** — formato de email en el registro. Sería una regla nueva; queda fuera de este ciclo.
</content>
</invoke>
