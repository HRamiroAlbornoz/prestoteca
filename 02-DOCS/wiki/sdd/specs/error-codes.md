---
type: spec
title: Spec — Códigos de error específicos y mensajes en español
description: WHAT and WHY para que cada error que ve el usuario tenga un código propio y un mensaje en español con qué hacer.
tags: [sdd, spec, errors, i18n]
timestamp: 2026-11-02T22:00:00Z
topic: sdd
slug: error-codes
status: draft
---

# Spec — Códigos de error específicos y mensajes en español

> Slug: `error-codes` · Status: draft · Created: 2026-11-02
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
- **El resto de los textos de la interfaz**, que ya están en español.

## Users & context

- **Vecinos que usan la app** (piden, prestan, publican herramientas, manejan su cuenta). Ven un error cuando algo
  que intentaron no se pudo hacer, y necesitan entender por qué y qué hacer, en su idioma.
- **Quien mantiene la app** (Hernán). Necesita que cada error tenga un nombre estable para buscarlo en el código y en
  los logs, y que agregar un caso nuevo no deje un hueco silencioso en la pantalla.

## Behaviour

- **Main path.** Cuando una acción falla por una situación prevista, el usuario ve en la misma pantalla un mensaje en
  español propio de esa situación. Si puede hacer algo, el mensaje lo dice. Ejemplos de situaciones que se
  distinguen entre sí:
  - Registro: falta algún dato; el nombre no tiene entre 2 y 50 caracteres; la contraseña no tiene entre 8 y 72; el
    email es demasiado largo; el email ya está registrado. (La pantalla de registro no valida antes de enviar, así
    que estos casos llegan al usuario tal cual.)
  - Sesión: falta el email o la contraseña (al iniciar sesión); email o contraseña incorrectos (al iniciar sesión);
    no hay sesión; la sesión venció o no es válida.
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
    errores (hoy muestra la lista vacía sin decir nada, y no se distingue "falló" de "no hay resultados").
  - General: demasiados intentos seguidos. El mensaje dice que hay que esperar un minuto, que es la ventana real de
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
  un código distinto al de las otras situaciones de la lista, y con el mismo status HTTP que antes de este cambio.
- **AC-7** Given cualquier error de la lista, When el server lo responde, Then la respuesta mantiene la forma
  actual (`error` con código y mensaje) — solo cambia el valor del código.
- **AC-8** Given un error interno inesperado, When el server responde, Then el cliente muestra el mensaje genérico
  y la respuesta no incluye detalles internos (stack, SQL, nombres de archivos).
- **AC-9** Given cualquier pantalla con un error visible, When un lector de pantalla está activo, Then el mensaje se
  anuncia (sigue siendo una región de alerta, como hoy).
- **AC-9b** Given el detalle de una herramienta propia, When pausar o eliminar falla, Then el mensaje de error se ve
  en esa misma pantalla y el detalle de la herramienta (nombre, estado, acciones) sigue visible.
- **AC-9c** Given demasiados intentos seguidos, When el server lo rechaza, Then el mensaje dice que hay que esperar un
  minuto.
- **AC-10** Given todas las pantallas del cliente, When se busca en su código un texto de error en inglés visible al
  usuario, Then no queda ninguno (los 6 textos de respaldo en inglés que hay hoy pasan a español).

## Points to clarify

- **suposición tomada** — El cliente sabe si hay sesión. *Base:* desde el PR #26 (2026-11-02) consulta `GET /api/me`
  al arrancar; antes no lo sabía nunca. *Riesgo:* ninguno nuevo; la pregunta de abajo ya se puede contestar.
- **pregunta abierta** — Cuando la sesión venció o no hay sesión, ¿alcanza con el mensaje ("Tu sesión venció.
  Volvé a iniciar sesión.") o la app tiene que, además, llevar al usuario a la pantalla de login? El checklist sugiere
  la segunda (`código → acción`), y cambia el alcance en el cliente. Restricción, sea cual sea la respuesta: un login
  fallido también es un rechazo por credenciales, y **nunca** dispara esa acción; ahí solo se muestra "email o
  contraseña incorrectos" en la misma pantalla de login.
- **suposición tomada** — Los mensajes usan voseo rioplatense ("Intentá", "Volvé"). *Base:* toda la interfaz
  actual lo usa. *Riesgo:* bajo; si se quisiera neutro, cambian los textos, no el contrato.
- **suposición tomada** — "No existe" y "no es tuyo" se mantienen indistinguibles en los préstamos, como hoy.
  *Base:* el server ya responde igual a propósito para no revelar préstamos ajenos. *Riesgo:* si se separaran, se
  filtraría información.
- **suposición tomada** — Los status HTTP no cambian. *Base:* AC-6 y AC-7; el cliente y los tests dependen de ellos.
  *Riesgo:* si un caso tiene hoy un status equivocado, se arregla aparte, no en este cambio.
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
