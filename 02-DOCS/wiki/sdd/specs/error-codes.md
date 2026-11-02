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
ese texto está escrito en inglés, para desarrolladores. Además, el server solo distingue 7 clases de error
(entrada inválida, sin sesión, prohibido, no existe, conflicto, demasiado grande, error interno), así que el
cliente no puede saber *cuál* de las situaciones de una clase ocurrió para explicarla bien.

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
  - Cuenta: el email ya está registrado; email o contraseña incorrectos; la contraseña actual no coincide; la
    contraseña nueva no cumple el largo; la cuenta tiene préstamos activos y no se puede eliminar; la sesión venció.
  - Herramientas: no existe; no es tuya (para editar, pausar o eliminar); nombre o descripción con largo inválido;
    categoría o estado inválidos; tiene préstamos activos y no se puede eliminar; está pausada y no acepta pedidos.
  - Préstamos: falta alguna fecha; la fecha de inicio ya pasó; la de fin es anterior a la de inicio; la nota es
    demasiado larga; es tu propia herramienta; se superpone con otro préstamo; el cambio de estado no está
    permitido; el préstamo no existe.
  - Búsqueda: el texto buscado es demasiado largo.
  - General: demasiados intentos seguidos (con la indicación de esperar).
- **Situaciones que solo produce un bug o un cliente roto** (cuerpo mal formado, identificador inválido, origen no
  permitido, parámetro de listado inválido) comparten un mensaje genérico en español. No revelan detalles internos.
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

- **AC-1** Given el server responde un error con un código conocido y un texto en inglés, When la pantalla muestra
  el error, Then se ve el mensaje en español de ese código y el texto en inglés no aparece en ningún lugar de la
  pantalla.
- **AC-2** Given el server responde un error con un código que el cliente no conoce, When la pantalla muestra el
  error, Then se ve el mensaje genérico en español y no el texto del server.
- **AC-3** Given una respuesta de error sin el formato esperado (sin código), When la pantalla la recibe, Then se
  ve el mensaje genérico en español.
- **AC-4** Given falla la conexión con el server, When el usuario hace cualquier acción que la necesita, Then ve un
  mensaje de conexión en español (no "Network error. Please try again.").
- **AC-5** Given el catálogo de códigos del server, When se corren los tests, Then existe una comprobación que
  falla si algún código del catálogo no tiene mensaje en español en el cliente.
- **AC-6** Given cada situación de la lista de *Behaviour → Main path*, When ocurre, Then el server responde con
  un código distinto al de las otras situaciones de la lista, y con el mismo status HTTP que antes de este cambio.
- **AC-7** Given cualquier error de la lista, When el server lo responde, Then la respuesta mantiene la forma
  actual (`error` con código y mensaje) — solo cambia el valor del código.
- **AC-8** Given un error interno inesperado, When el server responde, Then el cliente muestra el mensaje genérico
  y la respuesta no incluye detalles internos (stack, SQL, nombres de archivos).
- **AC-9** Given cualquier pantalla con un error visible, When un lector de pantalla está activo, Then el mensaje se
  anuncia (sigue siendo una región de alerta, como hoy).
- **AC-10** Given todas las pantallas del cliente, When se busca en su código un texto de error en inglés visible al
  usuario, Then no queda ninguno (los 6 textos de respaldo en inglés que hay hoy pasan a español).

## Points to clarify

- **pregunta abierta** — Cuando la sesión venció o no hay sesión, ¿alcanza con el mensaje ("Tu sesión venció.
  Volvé a iniciar sesión.") o la app tiene que, además, llevar al usuario a la pantalla de login? El checklist sugiere
  la segunda (`código → acción`), y cambia el alcance en el cliente.
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
