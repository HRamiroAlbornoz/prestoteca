---
type: spec
title: Spec — Códigos de error específicos y mensajes en español
description: WHAT and WHY para que cada error que ve el usuario tenga un código propio y un mensaje en español con qué hacer.
tags: [sdd, spec, errors, i18n]
timestamp: 2026-11-02T22:00:00Z
topic: sdd
slug: error-codes
status: approved
approved: 2026-11-03
approved_by: Hernán — "Sí, apruebo la spec tal como está." (aprobada ítem por ítem, no en autopiloto)
branch: feat/error-codes-screens
---

# Spec — Códigos de error específicos y mensajes en español

> Slug: `error-codes` · Status: approved (2026-11-03; enmienda del mismo día, ver *Revisions*) · Created: 2026-11-02
> Inherits: [constitution](../constitution.md) (principio 8: errores con forma consistente y mensajes genéricos al
> cliente; principio 14: errores anunciados a lectores de pantalla)
> Origen: punto 5 del backlog acordado el 2026-10-24 ("mensajes al usuario en inglés").

## Problem & why

La app es para vecinos de Tucumán y su interfaz está en español rioplatense, pero buena parte de los errores llegan
a la pantalla en inglés: "Tool not found", "The start date cannot be in the past", "Network error. Please try
again.", "Current password is incorrect". Pasa porque el cliente muestra tal cual el texto que manda el server, y
ese texto está escrito en inglés, para desarrolladores. Además, el server solo distingue 8 clases de error
(entrada inválida, sin sesión, prohibido, no existe, conflicto, demasiado grande, error interno, y demasiados
intentos —esta última escrita fuera del catálogo—), así que el cliente no puede saber *cuál* de las situaciones de
una clase ocurrió para explicarla bien.

## Cost of not building it

- El usuario lee errores en otro idioma justo cuando algo salió mal. Algunos los entiende, otros no
  ("Missing or invalid type", "Invalid origin").
- Los mensajes describen el problema pero no dicen qué hacer ("Current password is incorrect" no dice que se
  puede volver a intentar; "Too many requests" no dice cuánto esperar).
- Cada pantalla nueva repite el mismo patrón y suma más inglés.

No hay pérdida de datos ni riesgo de seguridad: el costo es de comprensión y de confianza en la app.

## The cheapest alternative

**Traducir al español los ~60 textos que manda el server** y seguir mostrándolos tal cual. Resuelve el idioma en
una tarde y no toca el cliente. Se descartó (Hernán, 2026-11-02) porque deja el texto de cara al usuario en manos
del server, mezcla mensajes para personas con mensajes para depurar, y no permite que el cliente reaccione distinto
según la situación. El checklist de errores del proyecto pide lo contrario: el server identifica la situación con un
código y el cliente decide cómo hablarle al usuario.

**Objeción registrada** (planteada en la fase specify y no tomada): con el mapa en el cliente, el conocimiento queda
partido en dos. Cada situación nueva exige tocar server y cliente; si alguien olvida el cliente, el usuario ve un
mensaje genérico. Hernán eligió el mapa igual por lo dicho arriba. La mitigación es un criterio de aceptación: una
comprobación automática que falla si existe un código sin mensaje.

## Goals

- Ningún error que ve el usuario aparece en inglés.
- Cada situación de error en la que el usuario puede hacer algo distinto tiene un código propio y estable.
- El mensaje que ve el usuario dice qué pasó y, cuando corresponde, qué puede hacer.
- Que falte el mensaje de un código se detecta antes del merge, no en la pantalla.

## Non-goals / out of scope

- **Otros idiomas.** Hay un solo idioma, español; no se prepara un sistema de traducciones.
- **Reintentos automáticos o un botón de reintentar.** Ver *decisión diferida* sobre `retryable`.
- **Mensajes por campo de formulario** desde el server. Los formularios ya validan en el cliente con sus propios
  mensajes en español; eso no cambia.
- **Los textos de éxito** que manda el server ("Registered successfully", "Logged in successfully"): ninguna pantalla
  los muestra.
- **Los logs del server.** Siguen en inglés, para quien depura.
- **Cambiar qué status HTTP devuelve cada error.** Solo se agrega precisión; el status de cada caso queda igual.
  **Única excepción** (enmienda del 2026-11-03, decisión D7): cambiar la contraseña con una cuenta que ya fue eliminada
  pasa a responder 404 con el mensaje 15 ("Esta cuenta ya no existe."). Hoy responde 401 y la persona lee el mensaje
  12 ("La contraseña actual no es correcta…"), que es engañoso: al eliminar la cuenta, su contraseña se reemplaza por
  una al azar, así que ninguna contraseña coincide.
- **El resto de los textos de la interfaz**, que ya están en español.

## Users & context

- **Vecinos que usan la app** (piden, prestan, publican herramientas, manejan su cuenta). Ven un error cuando algo
  que intentaron no se pudo hacer, y necesitan entender por qué y qué hacer, en su idioma.
- **Quien mantiene la app** (Hernán). Necesita que cada error tenga un nombre estable para buscarlo en el código y en
  los logs, y que agregar un caso nuevo no deje un hueco silencioso en la pantalla.

## What the user can do

Cualquier persona que usa la app (con o sin sesión), cuando una acción falla, lee en la misma pantalla qué pasó y,
si puede hacer algo, qué. Si su sesión venció o no tiene sesión mientras hace algo que la requiere, la app la lleva a
iniciar sesión y, al entrar, la devuelve a la pantalla donde estaba. No hace falta ningún permiso especial: vale para
todas las pantallas y todos los roles.

## What result they get

Para cada situación, el usuario ve exactamente este texto. **Esta tabla es la referencia que aprueba Hernán**; la
implementación la copia tal cual. Los nombres técnicos de los códigos no van acá: los define el `plan`.

| # | Situación | Mensaje que ve el usuario |
|---|---|---|
| **Registro** |||
| 1 | Falta algún dato | Completá todos los campos. |
| 2 | El nombre no tiene entre 2 y 50 caracteres | El nombre tiene que tener entre 2 y 50 caracteres. |
| 3 | La contraseña no tiene entre 8 y 72 caracteres | La contraseña tiene que tener entre 8 y 72 caracteres. |
| 4 | El email tiene más de 254 caracteres | El email es demasiado largo. |
| 5 | El email ya está registrado | Ya hay una cuenta con ese email. Iniciá sesión o usá otro email. |
| **Sesión** |||
| 6 | Al iniciar sesión, falta el email o la contraseña | Escribí tu email y tu contraseña. |
| 7 | Al iniciar sesión, email o contraseña incorrectos | El email o la contraseña no son correctos. |
| 8 | No hay sesión, venció o no es válida (en una acción que la requiere) | Tu sesión terminó. Iniciá sesión para continuar. *(y la app lleva al login)* |
| 9 | *(fusionada con la 8 el 2026-11-03: ver Revisions)* | — |
| 10 | "Salir" falla (sin conexión, o el server lo rechaza) | No pudimos cerrar tu sesión. Revisá tu conexión e intentá de nuevo en un momento. |
| **Cuenta** |||
| 11 | Falta la contraseña actual o la nueva | Completá la contraseña actual y la nueva. |
| 12 | La contraseña actual no coincide | La contraseña actual no es correcta. Revisala e intentá de nuevo. |
| 13 | La contraseña nueva no tiene entre 8 y 72 caracteres | La contraseña nueva tiene que tener entre 8 y 72 caracteres. |
| 14 | La contraseña nueva es solo espacios | La contraseña nueva no puede ser solo espacios. |
| 15 | La cuenta ya no existe (se eliminó con la sesión abierta) | Esta cuenta ya no existe. |
| 16 | La cuenta tiene préstamos activos y no se puede eliminar | No podés eliminar tu cuenta mientras tengas préstamos en curso. |
| **Herramientas** |||
| 17 | Al publicar, falta algún dato | Completá todos los campos. |
| 18 | El nombre no tiene entre 3 y 60 caracteres | El nombre tiene que tener entre 3 y 60 caracteres. |
| 19 | La descripción tiene más de 500 caracteres | La descripción puede tener hasta 500 caracteres. |
| 20 | La herramienta no existe | Esta herramienta no existe o fue eliminada. |
| 21 | No es tuya (editar, pausar o eliminar) | Solo podés modificar tus propias herramientas. |
| 22 | Tiene préstamos activos y no se puede eliminar | No podés eliminar esta herramienta mientras tenga préstamos en curso. |
| 23 | Está pausada y no acepta pedidos | Esta herramienta está pausada y no acepta pedidos por ahora. |
| **Préstamos** |||
| 24 | Falta alguna fecha | Elegí la fecha de inicio y la de fin. |
| 25 | La fecha de inicio ya pasó | La fecha de inicio no puede ser anterior a hoy. |
| 26 | La fecha de fin es anterior a la de inicio | La fecha de fin no puede ser anterior a la de inicio. |
| 27 | La nota tiene más de 300 caracteres | La nota puede tener hasta 300 caracteres. |
| 28 | Es tu propia herramienta | No podés pedir prestada tu propia herramienta. |
| 29 | Se superpone con otro préstamo | La herramienta ya está reservada en esas fechas. Probá con otras. |
| 30 | El cambio de estado no existe desde el estado actual | Este préstamo ya cambió de estado. Recargá la página para ver cómo está. |
| 31 | El cambio existe pero no le corresponde a tu rol | Esta acción le corresponde a la otra persona del préstamo. |
| 32 | El préstamo no existe | Este préstamo no existe. |
| **Búsqueda** |||
| 33 | El texto buscado tiene más de 60 caracteres | La búsqueda puede tener hasta 60 caracteres. |
| 34 | No se pudo cargar el listado (error del server o código desconocido) | No pudimos cargar las herramientas. Intentá de nuevo en un momento. |
| **General** |||
| 35 | Demasiados pedidos seguidos (en el login o navegando) | Hubo demasiados pedidos en poco tiempo. Esperá un minuto y volvé a intentar. |
| 36 | Sin conexión o el server no responde | No hay conexión con el servidor. Revisá tu internet e intentá de nuevo. |
| 37 | Error interno, situación que solo produce un bug, código desconocido o respuesta sin formato | Algo salió mal. Intentá de nuevo en un momento. |

Además, el resultado visible respeta *Behaviour → Dónde se ve el error*: el mensaje aparece en la pantalla donde se
hizo la acción, sin reemplazar su contenido.

**En el inicio (búsqueda y listado), qué mensaje gana:** sin conexión → 36; texto demasiado largo → 33; demasiados
pedidos → 35; cualquier otra falla al cargar el listado (error del server, código desconocido, respuesta sin
formato) → 34. En el inicio, la 34 reemplaza a la 37.

## What it must respect

- **Constitución, principio 8:** las respuestas de error mantienen su forma consistente y los detalles quedan en
  los logs, nunca en la respuesta.
- **Constitución, principio 14:** los errores se anuncian a lectores de pantalla.
- **Decisión D5** (`02-DOCS/wiki/sdd/decisions.md`): códigos específicos en el server, mensajes en el cliente; el
  texto del server queda solo para desarrollo.
- **Los status HTTP de cada caso no cambian** (AC-6, AC-7), salvo la única excepción de *Non-goals* (contraseña de
  una cuenta eliminada → 404).
- **"No existe" y "no es tuyo"** siguen respondiendo igual donde hoy responden igual (préstamos ajenos).
- **El login fallido nunca lleva al login ni borra lo escrito:** se queda en la pantalla con el mensaje 7.
- **Ir al login depende del código del error, no del status:** el login incorrecto (7) y la contraseña actual
  incorrecta (12) también responden 401, y el origen no permitido responde 403 con un código que hoy dice
  "no autorizado"; ninguno de ellos lleva al login. Solo lo hace la situación 8.
- **La vuelta después del login solo va a páginas de esta misma app** (ya lo prueba `App.test.tsx` con
  `returnTo=//evil.example` y similares; no puede dejar de pasar).
- **Las validaciones del cliente siguen igual:** el formulario de publicar y editar ya valida antes de enviar con sus
  propios mensajes en español (PR #32); esos textos no cambian.
- **Los límites de intentos** (5 por minuto en autenticación, 30 por minuto en general) no cambian.
- **Todo lo que hoy pasa en los tests** sigue pasando, salvo lo que este cambio reemplaza a propósito (los textos).

## How it proves it

- **Tests automáticos, uno o más por criterio de aceptación**, en las suites de server y client. Su salida queda en
  el archivo de verificación de esta spec (`02-DOCS/wiki/sdd/verifications/error-codes-<fecha>.md`).
- **AC-5 es una comprobación que se ejecuta**: recorre el catálogo del server y falla si un código no tiene mensaje
  en el cliente. La evidencia es verla fallar a propósito con un código sin mensaje y después pasar.
- **La tabla de *What result they get*** se compara contra el mapa del cliente con un test: si un texto difiere, falla.
- **Prueba en staging** de los casos que dependen del entorno real: sesión vencida que lleva al login y vuelve,
  demasiados intentos, y un error de préstamo (superposición). Quedan las respuestas de la API y capturas de pantalla.
- Un check que no se pudo correr se registra como **no corrido**, nunca como aprobado.

## Behaviour

- **Main path.** Cuando una acción falla por una situación prevista, el usuario ve en la misma pantalla un mensaje en
  español propio de esa situación. Si puede hacer algo, el mensaje lo dice. Ejemplos de situaciones que se
  distinguen entre sí:
  - Registro: falta algún dato; el nombre no tiene entre 2 y 50 caracteres; la contraseña no tiene entre 8 y 72; el
    email es demasiado largo; el email ya está registrado. (La pantalla de registro no valida antes de enviar, así
    que estos casos llegan al usuario tal cual.)
  - Sesión: falta el email o la contraseña (al iniciar sesión); email o contraseña incorrectos (al iniciar sesión);
    no hay sesión, venció o no es válida. Estos tres son una sola situación para el usuario: la cookie de sesión dura
    lo mismo que la sesión (1 hora), así que cuando la sesión vence el navegador ya la descartó y el server solo ve
    "no hay sesión". En esa situación, además del mensaje, la app lleva al usuario a iniciar sesión y, al entrar, lo
    devuelve a la pantalla donde estaba, **también desde las pantallas públicas**. Hoy eso falla en el detalle de una
    herramienta: "Iniciar sesión para pedir" y "Pedir prestada" mandan al login con un parámetro que el login no lee,
    y la persona termina en el inicio. Arreglarlo entra en este cambio.
    "Salir" que falla (sin conexión, o porque el server lo rechaza, por ejemplo por demasiados pedidos): la app lo
    dice y la sesión sigue abierta. Hoy parece cerrada, pero al recargar vuelve, porque el server nunca se enteró.
  - Cuenta: falta la contraseña actual o la nueva; la contraseña actual no coincide; la contraseña nueva no tiene
    entre 8 y 72 caracteres; la contraseña nueva es solo espacios; la cuenta ya no existe (se eliminó con la sesión
    abierta); la cuenta tiene préstamos activos y no se puede eliminar.
  - Herramientas: falta algún dato al publicar; nombre o descripción con largo inválido; no existe; no es tuya (para
    editar, pausar o eliminar); tiene préstamos activos y no se puede eliminar; está pausada y no acepta pedidos.
  - Préstamos: falta alguna fecha; la fecha de inicio ya pasó; la de fin es anterior a la de inicio; la nota es
    demasiado larga; es tu propia herramienta; se superpone con otro préstamo; el cambio de estado no existe desde el
    estado actual; el cambio existe pero no le corresponde a tu rol (por ejemplo, quien pidió intenta aceptar); el
    préstamo no existe.
  - Búsqueda: el texto buscado es demasiado largo; no se pudo cargar el listado. El inicio pasa a mostrar estos
    errores (hoy muestra la lista vacía sin decir nada, y no se distingue "falló" de "no hay resultados"). Qué mensaje
    gana en cada falla está en *What result they get*.
  - General: demasiados pedidos seguidos (en el login o navegando). El mensaje dice que hay que esperar un minuto, que es la ventana real de
    los límites.
- **Situaciones que solo produce un bug o un cliente roto** (cuerpo mal formado o demasiado grande, identificador
  inválido, origen no permitido, parámetro de listado o de página inválido, categoría o estado de herramienta que no
  existen —se eligen de una lista cerrada—, valor de pausa distinto de "pausar", estado de préstamo faltante, edición
  de una herramienta sin ningún campo —hoy responde "no existe" por error—, ruta de la API que no existe —hoy
  responde una página HTML sin código—) comparten un mensaje genérico en español. No revelan detalles internos.
- **Dónde se ve el error.** El error de una acción aparece en la pantalla donde se hizo, sin reemplazar su contenido:
  el usuario sigue viendo lo que estaba mirando y puede volver a intentar u otra cosa. Hoy no pasa en el detalle de
  una herramienta: si pausar o eliminar falla, la página entera se reemplaza por el error. Eso entra en este cambio.
  Un error al **cargar** una pantalla (no hay nada que mostrar) sí puede ocupar la pantalla.
- **Todas las pantallas usan el mismo criterio.** También las que hoy ignoran el error del server y muestran un texto
  fijo ("Error al cargar los préstamos"): pasan a mostrar el mensaje del código.
- **Pantallas que cargan dos cosas a la vez** (Mis préstamos: pedidos y recibidos; Perfil: herramientas e historial).
  Si una de las dos falla, la pantalla muestra el error de carga y no la mitad que sí cargó: una pantalla a medias
  confunde más de lo que ayuda. Si una de las fallas es la sesión terminada, gana esa (situación 8). Si la persona ya
  se fue de la pantalla cuando llegan las respuestas, no pasa nada.
- **Edge cases.**
  - El cliente recibe un código que no conoce (por ejemplo, el server se actualizó antes): muestra un mensaje
    genérico en español, nunca el texto del server.
  - La respuesta de error no tiene el formato esperado: mismo mensaje genérico.
  - No hay conexión o el server no responde: mensaje de conexión en español.
- **Error paths / lo que NO se revela.** El texto que manda el server nunca se muestra al usuario. Un error
  interno inesperado se ve como un mensaje genérico, sin detalles. "No existe" y "existe pero no es tuyo" siguen
  respondiendo igual donde hoy responden igual (no se filtra la existencia de préstamos ajenos).
- **Accesibilidad.** Los mensajes de error se siguen anunciando a lectores de pantalla, como hoy.

## Acceptance criteria

- **AC-1** Given el server responde un error con un código conocido y un texto en inglés, When **cualquier**
  pantalla muestra el error (incluidas las que hoy muestran un texto fijo), Then se ve el mensaje en español de ese
  código y el texto en inglés no aparece en ningún lugar de la pantalla.
- **AC-2** Given el server responde un error con un código que el cliente no conoce, When la pantalla muestra el
  error, Then se ve el mensaje genérico en español y no el texto del server.
- **AC-3** Given una respuesta de error sin el formato esperado (sin código), When la pantalla la recibe, Then se
  ve el mensaje genérico en español.
- **AC-4** Given falla la conexión con el server, When el usuario hace cualquier acción que la necesita, Then ve un
  mensaje de conexión en español (no "Network error. Please try again.").
- **AC-5** Given el catálogo de códigos del server, When se corren los tests, Then existe una comprobación que
  falla si algún código del catálogo no tiene mensaje en español en el cliente.
- **AC-5b** Given cualquier respuesta de error que el server puede emitir (incluidas las del limitador de intentos,
  las de validación de cada ruta, las del manejador final de errores y la de una ruta de la API que no existe), When
  se revisa su código, Then la respuesta es JSON con la forma de error de siempre y su código pertenece al catálogo.
  Ninguna parte del server escribe un código fuera de él.
- **AC-5c** Given una búsqueda que falla (texto demasiado largo, o el server no responde), When el inicio la recibe,
  Then muestra el mensaje en español en la misma pantalla y no lo confunde con "no hay resultados".
- **AC-6** Given cada situación de la lista de *Behaviour → Main path*, When ocurre, Then el server responde con
  un código distinto al de las otras situaciones de la lista, y con el mismo status HTTP que antes de este cambio,
  salvo la única excepción de *Non-goals*: cambiar la contraseña de una cuenta eliminada responde 404 (situación 15).
- **AC-7** Given cualquier error de la lista, When el server lo responde, Then la respuesta mantiene la forma
  actual (`error` con código y mensaje) — solo cambia el valor del código.
- **AC-8** Given un error interno inesperado, When el server responde, Then el cliente muestra el mensaje genérico
  y la respuesta no incluye detalles internos (stack, SQL, nombres de archivos).
- **AC-9** Given cualquier pantalla con un error visible, When un lector de pantalla está activo, Then el mensaje se
  anuncia (sigue siendo una región de alerta, como hoy).
- **AC-9b** Given el detalle de una herramienta propia, When pausar o eliminar falla, Then el mensaje de error se ve
  en esa misma pantalla y el detalle de la herramienta (nombre, estado, acciones) sigue visible.
- **AC-9c** Given demasiados pedidos seguidos, When el server lo rechaza, Then el mensaje dice que hay que esperar un
  minuto.
- **AC-10** Given todas las pantallas del cliente, When se busca en su código un texto de error en inglés visible al
  usuario, Then no queda ninguno (los textos de respaldo en inglés que hay hoy, como `'Tool not found'`,
  `'Login failed'` o `'Registration failed'`, pasan a español).
- **AC-11** Given un usuario cuya sesión terminó, en una pantalla privada o en el detalle de una herramienta,
  When hace una acción que el server rechaza por falta de sesión (o toca "Iniciar sesión para pedir"), Then ve el
  mensaje 8 (salvo al tocar "Iniciar sesión para pedir", que no es un error), llega a la pantalla de login y, al
  iniciar sesión, vuelve a la pantalla donde estaba.
- **AC-12** Given un usuario en la pantalla de login, When el server rechaza el email o la contraseña, Then ve el
  mensaje 7 en esa misma pantalla, sigue en el login y lo que escribió en el email no se borra.
- **AC-13** Given un usuario con sesión, When toca "Salir" y el cierre falla (sin conexión, o el server responde con
  un error), Then ve el mensaje 10 y la barra sigue mostrando que tiene la sesión abierta.
- **AC-14** Given la tabla de *What result they get*, When se comparan sus textos con los que muestra el cliente para
  cada situación, Then son idénticos, letra por letra.

## Points to clarify

- **suposición tomada** — El cliente sabe si hay sesión. *Base:* desde el PR #26 (2026-11-02) consulta `GET /api/me`
  al arrancar; antes no lo sabía nunca. *Riesgo:* ninguno nuevo.
- **suposición tomada** — Con la sesión vencida o sin sesión, la app lleva al login y después vuelve a donde estaba
  (respuesta de Hernán, 2026-11-03, a la pregunta abierta de la primera versión). *Base:* las páginas privadas ya
  hacen eso al entrar sin sesión (`/login?returnTo=…`, PR #26); el detalle de una herramienta usa hoy `returnUrl`,
  que el login no lee, y se arregla en este cambio. *Riesgo:* si una pantalla tiene un formulario a medio llenar, lo
  escrito se pierde al ir al login; con sesiones de 1 hora puede pasar. Guardarlo queda fuera de este ciclo.
- **suposición tomada** — "No hay sesión", "venció" y "no es válida" son una sola situación con un solo mensaje (8).
  *Base:* la cookie dura lo mismo que la sesión (1 hora), así que al vencer el server solo ve "no hay sesión"; un
  token inválido solo aparece con una cookie adulterada. *Riesgo:* si en el futuro la cookie dura más que la sesión
  (por ejemplo, para renovarla), conviene separarlas de nuevo.
- **suposición tomada** — "Salir" que falla (sin conexión o rechazado por el server) deja la sesión abierta y lo dice
  (mensaje 10), en vez de mostrarla cerrada. *Base:* hoy la app la muestra cerrada pero el server la mantiene, y al
  recargar vuelve: eso confunde. *Riesgo:* bajo; si se prefiere cerrarla igual en la app, cambia AC-13.
- **suposición tomada** — "Nombre o descripción con largo inválido" se separa en dos situaciones (mensajes 18 y 19),
  para que el mensaje diga cuál de los dos está mal. *Base:* el resto de la tabla nombra el campo. *Riesgo:* ninguno.
- **suposición tomada** — Los mensajes usan voseo rioplatense ("Intentá", "Volvé"). *Base:* toda la interfaz
  actual lo usa. *Riesgo:* bajo; si se quisiera neutro, cambian los textos, no el contrato.
- **suposición tomada** — "No existe" y "no es tuyo" se mantienen indistinguibles en los préstamos, como hoy.
  *Base:* el server ya responde igual a propósito para no revelar préstamos ajenos. *Riesgo:* si se separaran, se
  filtraría información.
- **suposición tomada** — Los status HTTP no cambian, salvo la única excepción de *Non-goals* (contraseña de una
  cuenta eliminada → 404). *Base:* AC-6 y AC-7; el cliente y los tests dependen de ellos. *Riesgo:* si un caso tiene
  hoy un status equivocado, se arregla aparte, no en este cambio.
- **suposición tomada** — El texto del server queda solo para desarrollo y puede seguir en inglés. *Base:* decisión
  de Hernán, 2026-11-02. *Riesgo:* si en el futuro otro cliente (una app móvil) consume la API, tendrá que tener su
  propio mapa.
- **decisión diferida** — Indicador `retryable` en cada error (checklist de errores). Hoy ninguna pantalla ofrece
  reintentar, así que no cambiaría nada visible. Decisión de Hernán, 2026-11-02.
- **decisión diferida** — `details` por campo y `action` para un LLM (checklist de errores): no aplican hoy.
- **área no formulable** — Cómo se documenta el catálogo para quien lo mantenga (significado, cuándo se emite,
  status). Está claro que hace falta; cómo y dónde es del `plan`.

## Revisions

- 2026-11-02 — Primera versión. Enfoque elegido por Hernán frente a "traducir en el server": códigos específicos y
  mapa en el cliente. Granularidad: uno por situación accionable (~30). Texto del server: solo para desarrollo.
  `retryable`: diferido. Modo de la cadena: parar en cada fase.
- 2026-11-02 — Revisión contra el código pedida por Hernán. Cambios: (1) se agregan los errores del registro, que
  llegan al usuario porque la pantalla no valida antes de enviar; (2) se agregan "contraseña solo espacios", "falta la
  actual o la nueva", "la cuenta ya no existe", "falta un dato al publicar" y se separa "no hay sesión" de "la sesión
  venció"; (3) AC-5b: todo código que emite el server pertenece al catálogo (hoy el limitador escribe
  `TOO_MANY_REQUESTS` fuera de él y varias rutas escriben códigos sueltos); (4) "categoría o estado inválidos" pasa al
  grupo que solo produce un bug (se eligen de una lista cerrada); (5) el error de una acción se ve sin reemplazar la
  pantalla, y se incluye arreglar el detalle de una herramienta (AC-9b); (6) AC-1 cubre también las pantallas que hoy
  muestran un texto fijo; (7) el mensaje de demasiados intentos dice "un minuto" (AC-9c); (8) la pregunta de la sesión
  excluye explícitamente el login fallido. Fuera de esta spec se encontró que los cambios de estado de un préstamo no
  comprueban quién los hace; va en un FTD aparte (`loan-transition-roles`).
- 2026-11-02 — Segunda revisión contra el código pedida por Hernán. Cambios: (1) se agrega "el cambio existe pero no
  le corresponde a tu rol" (el 403 que sumó el PR #24); (2) el inicio pasa a mostrar los errores de búsqueda y de
  carga, que hoy se tragan (AC-5c); (3) AC-5b incluye la ruta de la API que no existe, que hoy responde HTML sin
  código; (4) se agrega "falta el email o la contraseña" al iniciar sesión; (5) el problema dice 8 clases de error, no
  7; (6) la edición sin campos, que hoy responde "no existe", pasa al grupo genérico. Fuera de esta spec se encontró
  que el cliente nunca sabía si había sesión (arreglado en el PR #26, `session`) y se anotaron en el backlog la falta
  de estilos, la falta de navegación, "Editar" sin ruta y el barrio sin validar.
- 2026-11-03 — Adaptación al formato de ASDD (rsc 4.0.1), pedida por Hernán, aunque la spec está exenta por fecha.
  Cambios: (1) se agregan *What the user can do*, *What result they get* (con la **tabla de 37 mensajes**, la
  referencia que Hernán aprueba), *What it must respect* y *How it proves it*; (2) la pregunta abierta de la sesión
  se responde: llevar al login y volver a donde estaba (AC-11), y el login fallido nunca lo hace (AC-12); (3) se suma
  "Salir" sin conexión (mensaje 10, AC-13), pendiente desde la feature de navegación; (4) AC-10 deja de fijar una
  cantidad de textos en inglés; (5) AC-14: los textos del cliente son idénticos a la tabla; (6) "nombre o
  descripción inválidos" se separa en dos situaciones. Contexto nuevo desde la versión anterior: el formulario de
  editar (PR #32) ya muestra mensajes en español por status; pasan a salir del mapa como el resto.
- 2026-11-03 — Revisión de un agente con contexto limpio (pedida por Hernán; leyó solo la spec, la constitución y
  D5, y usó el código para verificar). Veredicto: `Issues found`, 4 problemas y 3 notas, todos verificados contra el
  código antes de cambiar nada. Cambios: (1) las filas 8 y 9 se fusionan en un solo mensaje ("Tu sesión terminó.
  Iniciá sesión para continuar."): la cookie dura lo mismo que la sesión (`authRoutes.ts:57,87`, `env.ts:14`), así
  que el server nunca ve una sesión vencida, solo "no hay sesión" (`middleware/auth.ts:15`); la fila 9 queda vacía
  para no renumerar; (2) volver después del login también desde el detalle de una herramienta, que hoy manda
  `returnUrl` (`ToolDetailPage.tsx:55,191`) y el login solo lee `returnTo` (`LoginPage.tsx:28`); entra en el cambio y
  AC-11 lo cubre; (3) "Salir" falla también si el server lo rechaza (pasa por el límite de 5 por minuto,
  `index.ts:46`), no solo sin conexión: fila 10 y AC-13 lo incluyen; (4) en el inicio se dice qué mensaje gana en
  cada falla (36, 33, 35 o 34; la 34 reemplaza a la 37 ahí); (5) la fila 35 dice "pedidos" en vez de "intentos",
  porque también salta navegando (30 por minuto); (6) ir al login depende del código, no del status 401 (también
  devuelven 401 el login incorrecto, la contraseña actual incorrecta y el origen no permitido). No se toca: D5 dice
  "7 clases" y la spec dice 8; el registro de decisiones solo se agrega, y la diferencia ya está explicada en la
  revisión anterior (5).
- 2026-11-03 — Enmienda pedida por el `analyze` de error-codes (hallazgos H1, L1 y L2) y aprobada por Hernán ("Sí,
  aplicá todo"). Cambios: (1) *Non-goals*, *What it must respect*, la suposición de status y AC-6 nombran la **única
  excepción** al "status no cambia": cambiar la contraseña de una cuenta eliminada responde 404 con el mensaje 15, en
  vez del 401 de hoy con el mensaje 12, que es engañoso (decisión D7); (2) se corrige que el origen no permitido
  responde 403, no 401; (3) *Behaviour* suma la regla de las pantallas que cargan dos cosas a la vez (si una falla,
  error de carga; la sesión terminada gana; si la persona ya se fue, no pasa nada), que estaba solo en el plan. La
  tabla de mensajes no cambia.
