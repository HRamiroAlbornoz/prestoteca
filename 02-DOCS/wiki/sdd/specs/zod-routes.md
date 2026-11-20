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
   - una fecha de préstamo que no es una fecha y que pasa las comparaciones de texto (`endDate: "mañana"`, o
     `"2099-02-30"` en cualquiera de las dos): llega a la base y la base la rechaza;
   - un número de página enorme (`?page=99999999999999999999`): el desplazamiento desborda el entero de la base.
3. **El cambio de contraseña no recorta espacios, y el registro y el login sí.** Quien cambia su contraseña a
   `" clave123 "` no puede volver a entrar, porque el login manda `"clave123"` (deducido del código). Hernán pidió sumarlo
   a este cambio el 2026-11-20.

Además, `analyze` marca el principio 13 como incumplido (F1) en cada feature nueva hasta que esto se haga.

## Cost of not building it

- Para quien usa la pantalla: **casi nada**. La pantalla siempre manda fechas reales. La página la toma de la URL, así
  que solo alguien que edita la URL a mano con un número enorme (`?page=99999999999999999999`) llega al 500 de hoy;
  después verá el error de listado (fila 34).
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
  declarado. Las reglas que hoy corren antes de cualquier trabajo del manejador siguen corriendo antes: si fallan, el
  manejador no lee la base ni calcula hashes. Las reglas que hoy corren después de leer la base (ver *Behaviour*)
  conservan su lugar.
- Cada entrada **sigue recibiendo exactamente la respuesta (status + código) que le da el código de hoy**, esté o no
  fijada por una prueba. Eso
  incluye cuál error gana cuando fallan varios campos a la vez.
- Ninguna entrada mal formada en cuerpo, query o id produce un 500.
- Una fecha de préstamo mal formada recibe un error propio (fila 40), con un texto que ve el usuario.
- Una contraseña puesta en el cambio de contraseña sirve después para entrar, aunque tenga espacios alrededor.
- El principio 13 se cumple en las rutas y F1 deja de aparecer en `analyze`.

## Non-goals / out of scope

- **La cookie de sesión y el encabezado `Origin`.** Ya tienen chequeos estrictos y propios, con pruebas de seguridad.
  No se tocan (Hernán, 2026-11-20).
- **Cambiar cualquier respuesta que existe hoy**: status, código, texto de la tabla de errores u orden de precedencia.
  Las únicas excepciones son las filas de *What result they get*.
- **Reglas nuevas que hoy no existen**: formato de email en el registro, largo máximo de la contraseña actual en el
  cambio de contraseña, rechazar campos desconocidos, convertir tipos (`"true"` → `true`, `"2"` → `2` en el cuerpo),
  recortar espacios en campos que hoy no se recortan (salvo las dos contraseñas del cambio de contraseña, ver
  *Behaviour*).
- **Validar el formato UUID del id.** El id solo tiene que ser texto; que no sea un UUID lo sigue resolviendo la base y
  responde 404, como hoy. Un validador propio no aceptaría todas las formas que la base acepta (mayúsculas, sin guiones,
  entre llaves), y cambiaría respuestas.
- **Las reglas que necesitan la base**: que la herramienta exista, que no esté pausada, la superposición de fechas, el
  dueño, las transiciones de estado del préstamo, la cuenta activa. Siguen como están.
- **Validar las respuestas** del server (la salida).
- **Los formularios del cliente.** Ya usan Zod (`zod/mini`). El cliente solo suma el texto de la fila 40. El formulario
  de cambio de contraseña sigue midiendo el largo sin recortar (`ProfilePage.tsx`): con `"  abcdef  "` deja pasar el
  pedido y el server responde `NEW_PASSWORD_LENGTH`, que ya tiene su texto. Se acepta así; el cliente no cambia por el
  recorte.
- **El servicio de respaldos** (`backup/`), el límite de 10 kb del cuerpo, los límites de pedidos por minuto y las
  variables de entorno (ya validadas).
- **Lo que un agente podría agregar "por las dudas"**: mensajes de error por campo, una respuesta con la lista de todos
  los campos que fallaron, un middleware genérico que adivine el esquema por la URL.
- **Reparar contraseñas ya guardadas con espacios** por un cambio de contraseña anterior. No se pueden leer (solo existe
  su hash). Quien esté en ese caso usa el cambio de contraseña desde una sesión abierta, o se le borra la cuenta a
  pedido.

## Users & context

- **La pantalla de Prestoteca** (el cliente web). Manda siempre datos bien formados, salvo una página enorme escrita a
  mano en la URL. Fuera de ese caso, no debería notar ningún cambio.
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

La referencia aprobada es **la respuesta del código de hoy**, esté o no fijada por una prueba. Para cada entrada, el
status y el código que hoy devuelve el server son el resultado esperado. Hoy hay bordes que no fija ninguna prueba, y
un esquema escrito "de forma natural" los cambiaría sin que nada falle. Esos bordes se conservan, y el plan los fija
con pruebas **contra el código viejo antes del refactor** (AC-18):

- nota `""` o de solo espacios → se guarda sin nota; el tope de 300 se mide después de recortar;
- `status: ""` → `BAD_REQUEST`; un `status` de texto desconocido → 409 `LOAN_TRANSITION_INVALID` (no un 400);
- `type` repetido o vacío en `GET /api/loans` → `BAD_REQUEST`;
- `q=`, `category=` o `neighborhood=` vacíos → no filtran; una categoría o un barrio desconocidos → listado vacío (200);
- un cuerpo JSON que es una lista → se trata como un objeto sin campos (el error de "falta" de esa ruta, o
  `TOOL_EDIT_EMPTY` en la edición);
- `PATCH /api/tools/:id` con `is_paused: true` y una edición inválida → el error de la edición, y la herramienta no
  queda pausada.

Las únicas respuestas nuevas son estas:

| Entrada | Hoy (deducido) | Después |
| --- | --- | --- |
| `endDate` que no es un día real (`"mañana"`, `"2099-02-30"`) con un `startDate` real, o `startDate: "2099-02-30"` | pasa las comparaciones de texto y llega a la base: probablemente 500 `INTERNAL_ERROR` | 400 `LOAN_DATE_INVALID` (fila 40) |
| `startDate: "mañana"` con un `endDate` real | 400 `LOAN_END_BEFORE_START` (`"2099-…" < "mañana"` en texto) | 400 `LOAN_DATE_INVALID` (fila 40) |
| fecha mal formada que hoy pasa las comparaciones de texto, sobre una herramienta inexistente (o id no UUID), pausada o propia | 404 `TOOL_NOT_FOUND`, 409 `TOOL_PAUSED` o 400 `LOAN_OWN_TOOL` (la fecha recién llega a la base después de esos chequeos) | 400 `LOAN_DATE_INVALID`: el formato se revisa antes de buscar la herramienta |
| una fecha real sin ceros (`"2026-1-5"`) | la base la acepta, pero la comparación de texto con "hoy" y con la otra fecha da resultados equivocados (p. ej. `endDate: "2027-1-5"` con `startDate: "2027-01-10"` pasa como "fin después del inicio", porque `"2027-01-10" < "2027-1-5"` en texto) | 400 `LOAN_DATE_INVALID` (fila 40) |
| `page` que no es solo dígitos (`1abc`, `1.5`, `%202`, `-1`, `0`) | se acepta como 1 o 2, o 400 | 400 `BAD_REQUEST` |
| `page` de solo dígitos pero demasiado grande para representarse | probablemente 500 | 400 `BAD_REQUEST` |
| `page` repetido (`?page=1&page=2`) | se acepta como la primera de las dos (`?page=2&page=3` → página 2) | 400 `BAD_REQUEST` (como `q`, `category` y `neighborhood` repetidos desde 5e) |
| cambio de contraseña con `newPassword: " clave123 "` | se guarda con los espacios; después el login (que recorta) no entra | se guarda `"clave123"`; el login con `"clave123"` o `" clave123 "` entra |
| cambio de contraseña con `newPassword` que solo llega a 8 caracteres contando los espacios (`"  abcdef  "`) | se acepta (largo 10) | 400 `NEW_PASSWORD_LENGTH` (largo 6 después de recortar, igual que en el registro) |
| cambio de contraseña con `currentPassword` correcta pero con espacios alrededor | 400 `CURRENT_PASSWORD_INCORRECT` | se acepta (se recorta antes de comparar, igual que el login) |
| cambio de contraseña con `newPassword` de solo espacios y menos de 8 o más de 72 (`"   "`) | 400 `NEW_PASSWORD_LENGTH` (hoy el largo se mira antes que "solo espacios") | 400 `NEW_PASSWORD_BLANK` (solo espacios, de cualquier largo) |
| cambio de contraseña con `newPassword` de más de 72 contando los espacios, pero de 8 a 72 recortada | 400 `NEW_PASSWORD_LENGTH` | se acepta (se guarda recortada) |

**Fila 40 nueva en la tabla de [error-codes](error-codes.md)** (texto elegido por Hernán el 2026-11-20):

| # | Situación | Texto que ve el usuario |
| --- | --- | --- |
| 40 | Alguna fecha del pedido no es un día real del calendario con formato AAAA-MM-DD | Las fechas tienen que ser días reales del calendario, con el formato AAAA-MM-DD. |

El formato de la respuesta de error no cambia: `{ "error": { "code", "message" } }`.

**Qué abarca la enmienda de la fila 40** (todo en la misma rama que el server):

1. en la spec error-codes, la fila 40 va en la sección **Préstamos**, después de la 27 (la numeración sigue siendo
   correlativa por orden de alta, como las filas 38 y 39);
2. en la tabla de códigos del server, `LOAN_DATE_INVALID` con status 400, anotado como fila 40;
3. en la tabla de mensajes del cliente, el código con el texto de la fila 40;
4. la prueba del cliente que recorre la tabla suma la fila 40 y pasa de 39 a 40 filas;
5. en *Revisions* de la spec error-codes, una entrada con el mismo formato que las de las filas 38 y 39 ("la tabla pasa
   de 39 a 40 mensajes").

## What it must respect

- **D15**: esta es la feature que D15 prometió. Cerrarla es cumplir el principio 13, no enmendarlo.
- **Lo que ya arreglaron 5b, 5d, 5e y 5f** ([server-input-bugs](../../ftd/server-input-bugs.md),
  [malformed-input-leftovers](../../ftd/malformed-input-leftovers.md)):
  - un tipo inesperado en un campo de texto (número, lista, objeto) se trata como "falta" donde hoy se hace así;
  - sin cuerpo, o con un `Content-Type` que el server no lee, se responde como si el cuerpo estuviera vacío;
  - un JSON mal formado da 400 `BAD_REQUEST` ("Malformed JSON body") **antes** de la sesión y de la ruta, como hoy;
    también un JSON de nivel superior que no es objeto ni lista (un texto, un número);
  - un parámetro de búsqueda repetido (`?q=a&q=b`) da 400;
  - la descripción vacía en la edición da 400;
  - **un id que no es un UUID da 404** (`TOOL_NOT_FOUND` / `LOAN_NOT_FOUND`), igual que un UUID que no existe. No se
    convierte en 400, y lo sigue decidiendo la base (ver *Non-goals*).
- **La regla de `remember` de [server-sessions](server-sessions.md)**: ausente = no; si no, exactamente `true` o
  `false`; `null` da `BAD_REQUEST`.
- **Lo que cada ruta recorta**: el registro y el login recortan espacios y pasan el email a minúsculas; las fechas y la
  nota se recortan. El cambio de contraseña pasa a recortar sus dos contraseñas (única excepción, pedida por Hernán).
- **La spec [error-codes](error-codes.md)**: cada código nuevo tiene su fila, su texto en el cliente y su prueba en la
  misma rama; la tabla de códigos del server y la del cliente no se desalinean.
- **El mismo esquema para JSON y para formulario, sin convertir tipos**: el server acepta los dos formatos y aplica
  las mismas reglas. Un formulario no puede mandar booleanos, así que `remember=true` o `is_paused=true` por formulario
  siguen dando `BAD_REQUEST`, como hoy.
- **Constitución**: principio 4 de calidad (lint en 0), principio 5 (tipos estrictos, `tsc -b` en 0), principio 6 (cobertura ≥ 80 % de líneas por archivo
  cambiado), principio 10 (rama + PR), principio 13 (el resto queda como está).

## How it proves it

- **Pruebas por ruta a través de la app real**, una por cada fila de *What result they get* y una por cada regla de
  *What it must respect*. Quedan en la suite del server y corren en cada `npm test`.
- **La suite actual sin cambiar ninguna expectativa.** Las pruebas existentes que fijan status y código pasan sin
  editar lo que esperan. Un diff de los `it(` y de los `expect` de las pruebas viejas lo muestra. Las únicas pruebas
  viejas que pueden cambiar son las que fijan una fila de *What result they get* (p. ej. una que acepte `page=1abc` o
  una contraseña nueva con espacios); cada una se lista en el plan con su razón. Ya se sabe de una: la prueba del
  cliente que cuenta las filas de la tabla de mensajes (`messages.test.ts`, hoy 39) pasa a esperar 40.
- **Un control en la suite** que falla si una ruta lee cuerpo, query o id sin pasarlo por un esquema declarado. Hay que
  verlo fallar una vez contra una ruta escrita a propósito sin esquema.
- **Mutantes**: sacar el esquema de una ruta, o aflojar una regla, hace fallar alguna prueba.
- **Staging con Postgres real**: los dos 500 de hoy se reproducen antes del cambio (o se descartan si no ocurren) y dan
  400 después. Queda escrito en el archivo de verificación.
- **El cliente**: la fila 40 tiene su texto y su prueba, que el test de la tabla de códigos exige.

## Behaviour

- **Camino principal:** una entrada válida produce exactamente la misma respuesta que hoy.
- **Entrada inválida:** si la regla que falla es de las que hoy corren antes de cualquier trabajo del manejador, la
  ruta responde **sin que el manejador consulte la base ni calcule hashes** (la sesión ya se revisó antes, como hoy).
  Nada cambia en la base.
- **Reglas que conservan su lugar después de leer la base** (hoy en el servicio o el repositorio de herramientas), solo
  en `PATCH /api/tools/:id`: la lista de categorías y condiciones, el largo del nombre, la descripción vacía o larga y
  "sin cambios" (`TOOL_EDIT_EMPTY`). En `POST /api/tools` la lista de categorías y condiciones ya corre antes de tocar
  la base, así que AC-9 la cubre. Por eso, una categoría inválida sobre una
  herramienta ajena sigue dando `TOOL_NOT_OWNER`, y sobre una que no existe, `TOOL_NOT_FOUND`.
- **Varios campos inválidos a la vez:** gana el mismo error que gana hoy. El orden de cada ruta se conserva. Las únicas
  excepciones son las de *What result they get*: en el cambio de contraseña, "solo espacios" antes que el largo; en el
  pedido de préstamo, la fecha mal formada antes que los chequeos que buscan la herramienta (no existe, pausada,
  propia).
- **Cambio de contraseña:** sigue este orden. Primero, si falta alguna contraseña o no es texto, da
  `PASSWORD_CHANGE_MISSING_FIELDS` (como hoy, mirando el valor sin recortar). Segundo, si `newPassword` es solo
  espacios, de cualquier largo, da `NEW_PASSWORD_BLANK`. Esto cambia la precedencia de hoy, que mira el largo antes; el
  cambio está listado en *What result they get*. Si el largo fuera primero, 8 espacios recortados darían
  `NEW_PASSWORD_LENGTH` y romperían la respuesta de hoy. Tercero, se recortan las dos contraseñas. Cuarto, se revisa el largo de
  `newPassword` ya recortada (8 a 72) y da `NEW_PASSWORD_LENGTH`. Quinto, se compara `currentPassword` ya recortada. Una
  `currentPassword` de solo espacios sigue dando `CURRENT_PASSWORD_INCORRECT`, como hoy.
- **Fechas del préstamo:** si falta alguna → fila 24 (como hoy). Si está pero no es un día real `AAAA-MM-DD` → fila 40.
  Después vienen, como hoy, "ya pasó" (25) y "fin antes que inicio" (26). Se aceptan los años bisiestos (`2028-02-29`
  vale, `2027-02-29` no).
- **Página:** ausente o vacía (`?page=`) = 1, como hoy. Repetida (aunque sea vacía, `?page=&page=`) → `BAD_REQUEST`.
  Si viene una vez con valor, tiene que ser solo dígitos, con valor ≥ 1 y que se pueda representar. Si no,
  `BAD_REQUEST`. Una página válida pero más allá de la última devuelve el listado vacío, como hoy.
- **Campos desconocidos:** se ignoran, como hoy.
- **Lo que no se revela:** el `message` de un error que produce el esquema no repite el valor que mandó el cliente.
  Los errores de transición de préstamo (`LOAN_TRANSITION_INVALID`, `LOAN_TRANSITION_WRONG_ROLE`) no son del esquema:
  hoy nombran el `status` pedido y siguen como están.

## Acceptance criteria

- **AC-1** — Given cualquier pedido fijado hoy por una prueba o por la lista de bordes de *What result they get*, When
  se manda después del cambio, Then recibe el mismo status y el mismo código (salvo las filas de respuestas nuevas).
- **AC-2** — Given un pedido a una ruta del alcance con dos o más campos inválidos, When se manda, Then gana el mismo
  código que hoy (una prueba por ruta con al menos un par de campos).
- **AC-3** — Given un usuario con sesión y una herramienta disponible, When pide un préstamo con
  `startDate: "mañana"`, Then recibe 400 `LOAN_DATE_INVALID`.
- **AC-4** — Given lo mismo, When `endDate` es `"2099-02-30"`, `"2026-1-5"` o `"2027-02-29"`, Then recibe 400
  `LOAN_DATE_INVALID` en cada caso; y con `"2028-02-29"` como fin válido no recibe ese código.
- **AC-4b** — Given un usuario con sesión, When pide un préstamo con `endDate: "mañana"` sobre una herramienta que no
  existe, sobre una pausada y sobre una propia, Then recibe 400 `LOAN_DATE_INVALID` en los tres casos, y el manejador no
  consulta la base.
- **AC-5** — Given lo mismo, When falta `startDate` y `endDate` es `"mañana"`, Then recibe 400 `LOAN_DATES_MISSING`
  (la fila 24 gana a la 40).
- **AC-6** — Given lo mismo, When las fechas tienen espacios alrededor (`" 2099-01-10 "`), Then se aceptan como hoy.
- **AC-7** — Given `GET /api/tools`, When `page` es `1abc`, `1.5`, `%202`, `-1`, `0`, `99999999999999999999` o se
  repite (`page=1&page=2`), Then recibe 400 `BAD_REQUEST` en cada caso.
- **AC-8** — Given `GET /api/tools`, When `page` falta, viene vacía o es `2`, Then responde 200 como hoy.
- **AC-9** — Given una ruta del alcance y una entrada que falla una regla de las que hoy corren antes de cualquier
  trabajo del manejador, When se manda, Then el manejador no hace ninguna consulta a la base después del chequeo de
  sesión y no calcula ningún hash.
- **AC-10** — Given una ruta con `:id`, When el id no es un UUID, Then sigue recibiendo 404 con el código "no existe"
  de esa entidad.
- **AC-10b** — Given `PATCH /api/tools/:id` sobre una herramienta ajena, When el cuerpo trae una categoría inválida,
  Then recibe `TOOL_NOT_OWNER`, como hoy.
- **AC-11** — Given una ruta protegida, When se llama sin sesión y con un JSON válido de campos inválidos, Then recibe
  `SESSION_REQUIRED`; When se llama sin sesión y con un JSON mal formado, Then recibe 400 `BAD_REQUEST`, como hoy.
- **AC-12** — Given el registro o el login, When el cuerpo llega como formulario en vez de JSON, Then aplica las mismas
  reglas y devuelve los mismos códigos; y `remember=true` por formulario sigue dando `BAD_REQUEST`.
- **AC-13** — Given una cuenta con sesión, When cambia la contraseña con `newPassword: " clave123 "` y después hace
  login con `"clave123"`, Then el login entra.
- **AC-13b** — Given el cambio de contraseña, When `newPassword` es `"  abcdef  "`, Then recibe 400
  `NEW_PASSWORD_LENGTH`; When es `"        "` (8 espacios), Then recibe 400 `NEW_PASSWORD_BLANK`, como hoy.
- **AC-13c** — Given el cambio de contraseña, When `currentPassword` es la correcta con un espacio al final, Then el
  cambio se acepta (204).
- **AC-13d** — Given el cambio de contraseña, When `newPassword` es `"   "` (3 espacios), Then recibe 400
  `NEW_PASSWORD_BLANK`; When es una contraseña de 70 caracteres con 2 espacios a cada lado (74 en total), Then se
  acepta (204).
- **AC-14** — Given el control de la suite, When una ruta del alcance lee cuerpo, query o id sin un esquema declarado,
  Then el control falla.
- **AC-15** — Given el cliente, When el server responde `LOAN_DATE_INVALID`, Then la pantalla muestra el texto de la
  fila 40.
- **AC-16** — Given un error que produce el esquema (no los de transición de préstamo), When se lee su `message`, Then
  no contiene el valor que mandó el cliente.
- **AC-18** — Given cada borde de la lista de *What result they get* (nota vacía, `status` vacío o desconocido, `type`
  repetido o vacío, filtros vacíos o desconocidos, cuerpo lista, pausa con edición inválida), When se prueba contra el
  código de hoy y después contra el nuevo, Then la respuesta (status + código, y para la pausa, que la herramienta no
  quede pausada) es la misma en las dos corridas.
- **AC-19** — Given la tabla de códigos, When se cuentan las filas, Then hay 40 en la spec de error-codes, en el
  cliente y en su prueba, y `LOAN_DATE_INVALID` aparece con status 400 en la tabla del server.
- **AC-17** — Given staging con Postgres real, When se mandan `endDate: "mañana"`, `startDate: "2099-02-30"` y
  `?page=99999999999999999999`, Then responden 400 (y queda escrito si antes daban 500).

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
- **suposición tomada** — para que la contraseña sea coherente, el cambio de contraseña pasa a recortar (y no al revés,
  dejar de recortar en el registro y el login). *Base:* Hernán pidió sumar el arreglo a este cambio (2026-11-20); las
  contraseñas del registro ya se guardaron recortadas, así que dejar de recortar en el login dejaría afuera a quien
  tipea un espacio de más. *Riesgo:* quien ya guardó una contraseña con espacios por un cambio anterior sigue sin poder
  entrar (ver *Non-goals*); con 1 cuenta activa en producción, el caso es casi nulo.
- **suposición tomada** — `?page=` vacía sigue valiendo 1 y `page` repetida pasa a 400. *Base:* lo vacío se trata como
  ausente en el resto de la app; lo repetido ya da 400 en los otros parámetros de búsqueda desde 5e. *Riesgo:* bajo; la
  pantalla nunca manda ninguno de los dos.
- **suposición tomada** — un tipo equivocado en `category` o `condition` (número, lista) se rechaza en el lugar que hoy
  ocupa esa regla: en `PATCH`, después de leer la base; en `POST`, antes, como hoy. *Base:* conservar la precedencia de hoy (AC-1, AC-10b).
  *Riesgo:* el plan puede proponer revisar el tipo antes; si lo hace, tiene que listar el cambio de precedencia como
  respuesta nueva.
- **decisión diferida** — unificar en un solo lugar la regla de la lista de categorías y condiciones (hoy en el
  servicio, `publish` y `edit`, y en el repositorio, `create` y `update`; la ruta no la revisa). Es limpieza interna; el plan decide si entra o queda para después.
- **decisión diferida** — formato de email en el registro. Sería una regla nueva; queda fuera de este ciclo.

## Revisions

- **2026-11-20 — borrador 1.** Alcance, fila 40 (código nuevo y texto con formato) y `page` solo dígitos, elegidos por
  Hernán (D16).
- **2026-11-20 — el recorte de contraseña entra en el cambio.** Hernán pidió sumar el arreglo ("Sumalo a este
  cambio"). El cambio de contraseña pasa a recortar (Problem 3, tres filas nuevas en *What result they get*, AC-13 a
  AC-13c).
- **2026-11-20 — revisión con ojos frescos 1** (5 hallazgos, todos aplicados). (1) Las reglas de herramientas que hoy
  corren después de leer la base conservan su lugar (Goals, Behaviour, AC-9, AC-10b). (2) El formato UUID del id no se
  valida: la base lo sigue resolviendo y las ~45 pruebas con ids falsos no cambian (Non-goals). (3) AC-9 mide solo el
  manejador, después del chequeo de sesión. (4) `?page=` vacía = 1 y `page` repetida = 400, ahora escritos. (5) Mismo
  esquema para JSON y formulario, sin convertir tipos (AC-12).
- **2026-11-20 — revisión con ojos frescos 2** (0 bloqueos, 3 should-fix y 3 nits, todos aplicados). (1) Hoy el
  cambio de contraseña mira el largo antes que "solo espacios": el nuevo orden está listado como respuesta nueva
  (AC-13d), con el caso "más de 72 sin recortar". (2) En `POST /api/tools` la lista de categorías corre antes de la base;
  solo `PATCH` conserva reglas después. (3) AC-16 se limita a los errores del esquema; las transiciones de préstamo
  siguen nombrando el `status`. (4) `startDate: "mañana"` hoy da `LOAN_END_BEFORE_START`, no 500; AC-17 usa entradas que
  sí llegan a la base. (5) El cliente no cambia por el recorte de contraseña. (6) `?page=&page=` → 400.
- **2026-11-20 — revisión con ojos frescos 3** (0 bloqueos, 1 should-fix y 3 nits, todos aplicados). (1) Hoy una fecha
  mal formada pierde contra "herramienta no existe / pausada / propia"; se decide que el formato gane (va antes de la
  base, como pide AC-9), listado como respuesta nueva, con AC-4b y la excepción escrita en *Behaviour*. (2) La lista de
  categorías vive en el servicio y el repositorio, no en la ruta. (3) Una página enorme escrita a mano en la URL de la
  pantalla hoy da 500 y después muestra la fila 34. (4) `page` repetida hoy toma la primera, no siempre la 1.
  Hernán aceptó la decisión (1): "Acepto esa decisión incluida" (2026-11-20). No es la aprobación de la spec.
- **2026-11-20 — revisión con ojos frescos 4** (0 bloqueos, 3 should-fix y 2 nits, todos aplicados). (1) La referencia
  pasa a ser el código de hoy, no solo las pruebas; seis bordes sin prueba quedan listados y se fijan contra el código
  viejo antes del refactor (AC-18). (2) El JSON mal formado da 400 antes de la sesión, como hoy; AC-11 se separa en los
  dos casos. (3) La enmienda de la fila 40 queda detallada en cinco puntos, incluida la prueba del cliente que pasa de
  39 a 40 filas (AC-19). (4) `tsc -b` es el principio 5, no el 4. (5) El ejemplo de `"2026-1-5"` usa el caso real
  ("fin antes que inicio" mal comparado).
</content>
</invoke>
