---
type: spec
title: Spec — Sesiones de 7 días que el logout anula de verdad
description: WHAT and WHY para que la sesión dure mientras se usa la app (7 días sin uso), que "Salir" la anule en el servidor y que exista "Cerrar sesión en los otros dispositivos".
tags: [sdd, spec, auth, session]
timestamp: 2026-11-18T19:30:00Z
topic: sdd
slug: server-sessions
status: approved
approved: 2026-11-18
approved_by: Hernán — "Apruebo la spec." (aprobada ítem por ítem, no en autopiloto, tras clarify y cuatro revisiones con ojos frescos)
---

# Spec — Sesiones de 7 días que el logout anula de verdad

> Slug: `server-sessions` · Status: approved (2026-11-18) · Created: 2026-11-18
> Inherits: [constitution](../constitution.md) (principio 8, que esta spec enmienda: hoy dice "JWT en cookie httpOnly
> (1h)")
> Origen: punto 5g del backlog ("token de acceso corto + token de renovación"), redefinido el 2026-11-18. Ver
> *Revisions*.

## Problem & why

Hoy la sesión es un único permiso que vence a la hora de iniciar sesión, sin renovarse. Eso trae dos problemas.

1. **La app te saca a los 60 minutos aunque la estés usando.** Quien publica una herramienta o responde un pedido
   puede encontrarse con "Tu sesión terminó" en mitad de la tarea.
2. **"Salir" no anula nada en el servidor.** Solo le pide al navegador que olvide la cookie. Si esa cookie quedó
   copiada (una compu compartida, una extensión maliciosa, un respaldo del navegador), sigue sirviendo hasta una hora
   después del logout.

Además, si alguien sospecha que su sesión quedó abierta en otro dispositivo, hoy la única salida es cambiar la
contraseña.

## Cost of not building it

- Cada persona que usa la app más de una hora seguida vuelve al login al menos una vez por hora. Con la base de
  usuarios actual (1 cuenta activa en producción, el barrio todavía no entró) el costo hoy es chico. Crece con cada
  usuario real.
- Una cookie copiada sigue funcionando hasta 1 h después de "Salir". La ventana es corta y el ataque necesita acceso
  al dispositivo, así que el riesgo es bajo pero real. Y contradice lo que la persona cree que pasó al tocar "Salir".
- El checklist de autenticación del proyecto marca el logout que invalida la sesión como obligatorio. Hoy no se
  cumple.

## The cheapest alternative

**Solo arreglar el logout** (un FTD chico): que "Salir" anule la sesión actual en el servidor. Resuelve el problema 2.
No resuelve el 1: la gente sigue volviendo al login cada hora.

**Alargar la sesión a 7 días sin más:** resuelve el 1 y empeora el 2. Una cookie copiada pasaría a valer una semana.

Por eso las dos cosas van juntas: alargar la sesión solo es aceptable si "Salir" la anula de verdad.

**El diseño del checklist al pie de la letra** (permiso de acceso de 15 min + permiso de renovación de 7 días) también
fue considerado y descartado. Desde 5c ([session-revocation](../../ftd/session-revocation.md)) el servidor ya revisa en
cada pedido que la cuenta siga activa y que la contraseña no haya cambiado. Así que el permiso corto ya no aporta
revocación, y suma la parte más propensa a errores: la renovación automática en el cliente y los pedidos simultáneos
renovando a la vez. Hernán eligió la sesión que el servidor recuerda (dirección B) el 2026-11-18. Esto se aparta de la
letra del checklist (no hay un permiso de 15 min). Cumple su intención: una sesión larga que se puede anular.

## Goals

- Quien inicia sesión con "Recordarme" y usa la app al menos una vez cada 7 días no vuelve a ver la pantalla de login.
- Quien inicia sesión sin "Recordarme" (por ejemplo, en una compu ajena) pierde la sesión al cerrar el navegador o,
  si el navegador conserva la cookie, a las 12 horas sin uso.
- "Salir" anula la sesión en el servidor: la misma cookie, usada después, ya no abre nada.
- La persona puede cerrar su sesión en los otros dispositivos con un botón, sin cambiar la contraseña y sin salir del
  dispositivo que está usando.
- Se mantiene todo lo que ya cierra sesiones hoy: cambio de contraseña y cuenta borrada.

## Non-goals / out of scope

- **Permiso de acceso de 15 min + permiso de renovación.** Descartado. Ver *The cheapest alternative*.
- **Lista de dispositivos o sesiones activas** (ver dónde estás logueado y cerrar una puntual). Diferido.
- **Tope absoluto de duración** (por ejemplo, 30 días aunque se use todos los días). Diferido.
- **Duraciones elegibles por el usuario** (1, 7 o 30 días). Solo existe la casilla "Recordarme", con dos modos.
- **Avisos por email** de un login nuevo o de cerrar las otras sesiones. La app no manda emails y los emails no se
  verifican al registrarse (spec MVP, fuera de alcance). Van a una spec propia, después de "verificar el email al
  registrarse" (Hernán, 2026-11-18).
- **Cambiar la pantalla de registro o el límite de intentos.** No se tocan. La de login solo suma la casilla
  "Recordarme".
- **Cambiar qué pasa al cambiar la contraseña** (cierra las otras sesiones y deja abierta la actual, desde 5c). Se
  mantiene igual.
- **Cambiar la lógica de redirección al login** con regreso a la página original. Se mantiene igual.
- **Sesión en apps nativas o de terceros** (permisos por encabezado en vez de cookie). La app es solo web.
- **Datos del dispositivo o de la ubicación** (IP, navegador, ciudad) asociados a la sesión. Solo los necesitaría la
  lista de dispositivos, que está diferida. En este ciclo una sesión guarda únicamente lo que hace falta para vencerla
  y anularla.

## Users & context

Vecinos del barrio que usan Prestoteca desde el celular, varias veces por semana: publican herramientas, piden
préstamos y responden pedidos. A veces entran desde una compu que no es suya (trabajo, biblioteca, casa de un
familiar). Ese es el caso donde "Salir" importa.

## What the user can do

- **Iniciar sesión** con email y contraseña, igual que hoy, y elegir si marca **"Recordarme"**. Cualquier visitante con
  una cuenta activa.
- **Con "Recordarme": seguir usando la app días después** sin volver a loguearse, aunque cierre el navegador, si no
  pasaron 7 días desde su último uso.
- **Sin "Recordarme": usar la app mientras el navegador siga abierto.** Al cerrarlo, la sesión termina.
- **Tocar "Salir"** en la barra de navegación. Requiere una sesión abierta en ese dispositivo.
- **Tocar "Cerrar sesión en los otros dispositivos"** en Perfil → Configuración y confirmarlo. Requiere una sesión
  abierta. Solo cierra las sesiones de su propia cuenta, nunca las de otra persona, y nunca la del dispositivo desde
  el que lo pide.

## What result they get

Referencia a aprobar por Hernán (respuestas de la API y texto en pantalla; no hay boceto nuevo, el botón usa el estilo
de los botones existentes de Configuración):

| Situación | Resultado esperado |
| --- | --- |
| Pantalla de login | Debajo de la contraseña, una casilla con la etiqueta visible "Recordarme", **desmarcada** al abrir la pantalla, operable con teclado y lectores de pantalla. Debajo, en texto chico: "No la marques en una compu compartida." El resto de la pantalla, igual que hoy. |
| Login correcto **con** "Recordarme" | Igual que hoy: `200`, cookie de sesión `httpOnly`. La cookie sobrevive al cierre del navegador y la sesión dura 7 días desde el último uso. |
| Login correcto **sin** "Recordarme" | `200`, cookie de sesión `httpOnly` que el navegador descarta al cerrarse. En el servidor la sesión también vence a las 12 horas sin uso (ver *Points to clarify*). |
| Pedido protegido dentro del plazo de su modo | Responde normal y el plazo sin uso vuelve a empezar. |
| Pedido protegido con una sesión sin usar por más de su plazo (7 días o 12 h) | `401 SESSION_REQUIRED`. En pantalla: "Tu sesión terminó. Iniciá sesión para continuar." y redirección al login. |
| "Salir" | Igual que hoy: `204` y vuelve al inicio sin sesión. Además, la cookie usada **antes** del logout, mandada de nuevo, recibe `401 SESSION_REQUIRED`. |
| Tocar "Cerrar sesión en los otros dispositivos" | Se abre una confirmación: "¿Cerrar la sesión en tus otros dispositivos? Vas a seguir con la sesión abierta acá." con los botones "Cerrar sesiones" y "Cancelar". El foco pasa a la confirmación; Escape o "Cancelar" la cierran sin hacer nada y el foco vuelve al botón. |
| Confirmar | Todas las sesiones de la cuenta **menos la actual** reciben `401 SESSION_REQUIRED` en su próximo pedido. La actual sigue. En Configuración aparece, anunciado a lectores de pantalla: "Cerramos la sesión en tus otros dispositivos." (también si no había otras sesiones abiertas). |
| Demasiados pedidos seguidos al cerrar las otras (`429`) | El mensaje general de la fila 35: "Hubo demasiados pedidos en poco tiempo. Esperá un minuto y volvé a intentar." Las sesiones siguen abiertas. |
| Falla al cerrar las otras (sin conexión, error del servidor) | Mensaje propio, fila 39 de la tabla de [error-codes](./error-codes.md): "No pudimos cerrar la sesión en tus otros dispositivos. Revisá tu conexión e intentá de nuevo en un momento." En Configuración, anunciado a lectores de pantalla, sin texto del servidor. Las sesiones siguen abiertas. |
| Cambio de contraseña | Igual que hoy: las otras sesiones reciben `401`, la actual sigue. |
| Cuenta borrada | Igual que hoy: todas sus sesiones reciben `401`. |

## What it must respect

- **Constitución, principio 8:** hoy dice "auth via JWT in httpOnly cookie (1h expiry)". Se mantiene la cookie
  `httpOnly`. La frase entera "JWT in httpOnly cookie (1h expiry)" se **enmienda** a "identificador de sesión opaco en
  cookie httpOnly, vence a los 7 días sin uso con 'Recordarme' o a las 12 h sin uso sin él, anulable desde el
  servidor": un JWT con datos de la cuenta contradiría
  AC-14. La enmienda pasa por `constitution` antes del plan y se anota en su registro de enmiendas y en
  `decisions.md`.
- **Spec MVP, todo lo que fija "1 hora"** (`prestoteca-mvp.md`): el criterio "se crea una cookie de sesión que expira
  en 1 hora" (*Acceptance criteria*) y la suposición "La sesión dura 1 hora" (*Points to clarify*). Los dos quedan
  reemplazados por esta spec y se anota la enmienda en la spec MVP.
- **Spec MVP, redirección:** sin sesión o con sesión vencida, se redirige al login y vuelve a la ruta original
  (interna, empieza con `/`). Sin cambios.
- **5c ([session-revocation](../../ftd/session-revocation.md)):** cambiar la contraseña cierra las otras sesiones y
  deja la actual; una cuenta borrada pierde todas sus sesiones. Sin cambios de comportamiento.
- **Spec [error-codes](./error-codes.md), enmiendas que esta spec obliga:** la tabla termina hoy en la fila 38; se
  agrega la **fila 39** (falla al cerrar las otras sesiones) con una entrada en sus *Revisions*. Esa entrada también
  actualiza todos los lugares que razonan con "1 hora": *Behaviour → Sesión* ("la cookie dura lo mismo que la
  sesión (1 hora)"), y en *Points to clarify* la suposición de la fila 8 y la nota "con sesiones de 1 hora puede
  pasar". Ahora la cookie puede sobrevivir a la sesión (sin "Recordarme" con un navegador que la conserva, o tras
  cerrar las otras sesiones desde otro dispositivo). La fila 8 sigue unificada: sesión desconocida, vencida o anulada
  se ven igual.
- **Spec [error-codes](./error-codes.md):** toda sesión inválida responde `SESSION_REQUIRED` (fila 8) con su mensaje
  en español. "Salir" que falla muestra `LOGOUT_FAILED` (fila 10). Ningún texto del servidor llega a la pantalla
  (fila 1, guard `noServerText`). Los errores se anuncian a lectores de pantalla (principio 14).
- **Límite de pedidos:** las rutas de `/api/auth` siguen con su límite estricto y el resto con el general. Ninguna
  ruta nueva queda sin límite.
- **CSRF y origen:** los pedidos que cambian estado siguen exigiendo el origen permitido (`ORIGIN_NOT_ALLOWED`),
  incluido "Cerrar sesión en los otros dispositivos".
- **Privacidad al borrar la cuenta** (spec MVP, decisión tomada: el nombre se borra): las sesiones de una cuenta
  borrada no solo dejan de servir, **dejan de estar guardadas**. No queda registro de cuándo usó la app.
- **El identificador de sesión es la única llave:** no se puede adivinar, ni deducir de otro identificador, y una
  copia de lo que el servidor guarda sobre las sesiones no alcanza para usar ninguna. El plan decide cómo.
- **Contraseñas:** el sistema de hash no cambia. *(Enmendado el 2026-11-18, aprobado por Hernán: antes decía que
  también la huella de la contraseña de 5c se mantenía; el plan la elimina — decisión D14 — y el resultado de 5c,
  "cambiar la contraseña cierra las otras sesiones", se cumple borrándolas, AC-8.)*

## How it proves it

- **Pruebas automáticas contra la app real** (como `server/tests/sessionWiring.test.ts`, no módulos sueltos): una por
  criterio de aceptación. El paso del tiempo (7 días) se simula con un reloj controlado, sin esperar.
- **Prueba del cliente** para la casilla "Recordarme": desmarcada al abrir, con etiqueta, y el login manda la
  elección.
- **Prueba del cliente** para el botón "Cerrar sesión en los otros dispositivos": confirmación (abrir, cancelar con
  el botón y con Escape, foco), éxito, error y anuncio a lectores de pantalla.
- **Comprobación en staging con dos "dispositivos"** (dos cookies distintas, por `curl`): logout de uno, el otro
  sigue; "cerrar las otras" desde A, B da `401` y A sigue; la cookie vieja después del logout da `401`. Los comandos y las
  respuestas quedan en `02-DOCS/wiki/sdd/verifications/server-sessions-<fecha>.md`.
- **Smoke en producción** después del deploy: login, pedido protegido, logout, la cookie vieja da `401`. Anotado en el
  mismo archivo de verificación.

## Behaviour

- **Camino principal:** la persona inicia sesión con "Recordarme". Cada vez que usa la app con esa sesión, el plazo de
  7 días vuelve a empezar, en el servidor y también en el vencimiento de la cookie en el navegador. Mientras no pasen
  7 días sin uso, sigue logueada en ese dispositivo, aunque cierre el navegador.
- **Sin "Recordarme":** la sesión dura mientras el navegador siga abierto y se use al menos una vez cada 12 horas.
  Cerrar el navegador la termina en ese dispositivo.
- **Registro:** registrarse inicia una sesión sin "Recordarme" (la pantalla de registro no cambia). Como el login, un
  registro correcto anula la sesión que ya hubiera en ese navegador; uno rechazado no la toca.
- **Cuenta borrada:** sus sesiones dejan de servir y dejan de estar guardadas.
- **Cambio de contraseña:** la sesión actual sigue con el modo que tenía.
- **Login con una sesión ya presente en el navegador** (cambiar de cuenta o de modo sin tocar "Salir"): el login
  nunca reutiliza la sesión que trae el navegador. Un login **correcto** siempre abre una sesión nueva, y la anterior
  de ese navegador queda anulada. Un login rechazado (contraseña incorrecta, demasiados intentos, datos inválidos) no
  toca la sesión que ya estaba.
- **Abrir la app con una cookie que ya no sirve** (vencida o anulada): igual que hoy, cuenta como "sin sesión", sin
  mensaje y sin redirección; el navegador olvida esa cookie. El mensaje "Tu sesión terminó…" y la redirección al
  login aparecen solo al intentar algo que necesita sesión.
- **Abrir directo una página privada con una cookie que ya no sirve:** igual que hoy con "sin sesión": lleva al login
  con la ruta de regreso, sin el mensaje "Tu sesión terminó…" (la fila 8 aplica a una acción, no a la carga).
- **"Salir":** la sesión de ese dispositivo queda anulada en el servidor y el navegador olvida la cookie. Las sesiones
  de otros dispositivos siguen. Si el servidor no puede anularla (por ejemplo, la base de datos no responde), "Salir"
  **no** da éxito: la pantalla muestra `LOGOUT_FAILED` (fila 10) y la barra sigue mostrando la sesión abierta, como en
  el AC-13 de error-codes.
- **"Cerrar sesión en los otros dispositivos":** después de confirmar, todas las sesiones de la cuenta menos la del
  dispositivo que lo pidió quedan anuladas.
- **Bordes:**
  - Una sesión que lleva exactamente 7 días sin uso ya está vencida. El límite no es ambiguo: vence en el instante en
    que se cumplen los 7 días.
  - Dos pedidos simultáneos con la misma sesión funcionan los dos. Ninguno saca al otro de la sesión.
  - Un pedido que llega al mismo tiempo que "Salir" o "cerrar las otras" sobre esa sesión puede cumplirse o no, pero
    nunca revive la sesión anulada: después del logout, esa cookie da `401` siempre.
  - "Salir" con una sesión ya vencida o anulada responde como un logout normal (`204`): el resultado buscado ya se
    cumple.
  - Varios dispositivos de la misma cuenta tienen sesiones independientes.
  - Al desplegar este cambio, las sesiones de 1 h que existan dejan de servir y esas personas vuelven a loguearse una
    vez (ver *Points to clarify*).
- **Errores:**
  - Sesión desconocida, vencida o anulada → `401 SESSION_REQUIRED`. La respuesta no dice cuál de las tres fue.
  - Si la base de datos no responde al revisar la sesión, el pedido no pasa (igual que hoy).
  - "Cerrar las otras" sin sesión → `401 SESSION_REQUIRED`.
  - "Cerrar las otras" sin otras sesiones abiertas → éxito igual, con el mismo mensaje.
  - Si la sesión actual venció o fue anulada justo antes de confirmar (por ejemplo, otro dispositivo cerró las otras
    sesiones al mismo tiempo) → `401 SESSION_REQUIRED`, mensaje de sesión terminada y
    redirección al login (no el mensaje de la fila 39).

## Acceptance criteria

*AC-1 a AC-3 hablan de una sesión iniciada con "Recordarme"; AC-20 a AC-23 cubren el otro modo.*

- **AC-1.** Given una sesión iniciada, When la persona hace un pedido protegido 6 días y 23 horas después del último
  uso, Then el pedido responde normal.
- **AC-2.** Given una sesión usada por última vez hace 7 días o más, When se hace un pedido protegido, Then responde
  `401 SESSION_REQUIRED`.
- **AC-3.** Given una sesión usada el día 0 y otra vez el día 5, When se hace un pedido protegido el día 11, Then
  responde normal (el plazo empezó de nuevo el día 5).
- **AC-4.** Given una sesión abierta y una copia de su cookie, When la persona toca "Salir" y después se manda la
  copia, Then la copia recibe `401 SESSION_REQUIRED`.
- **AC-5.** Given la misma cuenta con sesión en los dispositivos A y B, When A toca "Salir", Then B sigue respondiendo
  normal.
- **AC-6.** Given la misma cuenta con sesión en A, B y C, When A confirma "Cerrar sesión en los otros dispositivos",
  Then B y C reciben `401 SESSION_REQUIRED` en su próximo pedido y A sigue respondiendo normal.
- **AC-7.** Given las cuentas X e Y con sesión, When X cierra sus otras sesiones, Then las sesiones de Y siguen
  respondiendo normal.
- **AC-8.** Given sesiones en A y B, When A cambia la contraseña, Then B recibe `401` y A sigue respondiendo normal
  (comportamiento de 5c, sin cambios).
- **AC-9.** Given sesiones en A y B, When la cuenta se borra, Then A y B reciben `401`.
- **AC-10.** Given una cookie de sesión emitida antes de este cambio (formato de 1 h), When se usa después del deploy,
  Then recibe `401 SESSION_REQUIRED`.
- **AC-11.** Given cerrar las otras sesiones falla (sin conexión o error del servidor), When la persona confirma, Then
  ve en Configuración "No pudimos cerrar la sesión en tus otros dispositivos. Revisá tu conexión e intentá de nuevo en
  un momento." (fila 39 de [error-codes](./error-codes.md)), anunciado a lectores de pantalla (`role="alert"`), sin
  texto del servidor, y sigue logueada.
- **AC-12.** Given una sesión anulada o vencida, When se toca "Salir", Then responde `204`.
- **AC-13.** Given un pedido de "cerrar las otras sesiones" sin el origen permitido, When llega al servidor, Then responde
  `ORIGIN_NOT_ALLOWED` y no cierra ninguna sesión.
- **AC-14.** Given la cookie de sesión, When se inspecciona, Then es `httpOnly`, `SameSite=Lax`, `Secure` en
  producción, y su valor no contiene datos de la cuenta (ni id, ni email).
- **AC-15.** Given una sesión válida, When se mandan dos pedidos protegidos a la vez con la misma cookie, Then los dos
  responden normal y la sesión sigue válida para un tercer pedido.
- **AC-16.** Given ninguna cookie de sesión, When se pide cerrar las otras sesiones, Then responde `401 SESSION_REQUIRED` y no
  cierra ninguna sesión.
- **AC-17.** Given la base de datos no responde, When llega un pedido protegido con una cookie de sesión, Then el
  pedido no se cumple y la respuesta es un error del servidor (`INTERNAL_ERROR`), nunca un acceso concedido.
- **AC-18.** Given la persona en Configuración, When toca "Cerrar sesión en los otros dispositivos", Then aparece la
  confirmación como un diálogo modal cuyo nombre accesible es la pregunta, con el foco adentro, y Tab y Shift+Tab no
  salen del diálogo mientras está abierto; When toca "Cancelar" o aprieta Escape, Then la confirmación se cierra, ninguna
  sesión se cierra y el foco vuelve al botón. When toca "Cerrar sesiones", Then mientras espera la respuesta ese botón
  queda deshabilitado y se manda un solo pedido aunque se toque varias veces; al terminar, la confirmación se cierra
  y el foco vuelve al botón "Cerrar sesión en los otros dispositivos", con el mensaje de éxito o de error a la vista
  y anunciado a lectores de pantalla (el de éxito, haya habido o no otras sesiones).
- **AC-19.** Given una cuenta sin otras sesiones abiertas, When la persona confirma, Then ve "Cerramos la sesión en
  tus otros dispositivos." anunciado a lectores de pantalla, y su sesión sigue.
- **AC-20.** Given la pantalla de login recién abierta, When se inspecciona, Then hay una casilla con la etiqueta
  "Recordarme" asociada, desmarcada, alcanzable con Tab y que se marca con la barra espaciadora, y el texto "No la
  marques en una compu compartida." es su descripción accesible (un lector de pantalla lo lee al llegar a la casilla).
- **AC-21.** Given un login correcto con "Recordarme", When se inspecciona la cookie, Then tiene vencimiento propio de
  7 días (sobrevive al cierre del navegador); y después de un pedido protegido hecho el día 5, el vencimiento de la
  cookie en el navegador es de nuevo 7 días a partir de ese pedido.
- **AC-22.** Given un login correcto sin "Recordarme", When se inspecciona la cookie, Then no tiene vencimiento propio
  (el navegador la descarta al cerrarse).
- **AC-23.** Given una sesión sin "Recordarme" usada por última vez hace 12 horas o más, When se hace un pedido
  protegido con esa cookie, Then responde `401 SESSION_REQUIRED`; y usada hace 11 h 59 min, responde normal.
- **AC-24.** Given un registro correcto, When se inspecciona la cookie, Then se comporta como sin "Recordarme"
  (AC-22, AC-23).
- **AC-25.** Given un login con "Recordarme" mandado con un valor que no es verdadero ni falso (por ejemplo un texto),
  When llega al servidor, Then responde `400`, la pantalla muestra el mensaje genérico de la fila 37 de error-codes
  ("Algo salió mal. Intentá de nuevo en un momento."), y no inicia ninguna sesión.
- **AC-26.** Given un login correcto sin el dato "Recordarme" (por ejemplo, una versión vieja de la app guardada en el
  navegador justo después del deploy), When llega al servidor, Then inicia sesión en el modo sin "Recordarme".
- **AC-27.** Given una sesión sin "Recordarme" y otra con "Recordarme", When cada una cambia la contraseña, Then la
  primera sigue sin vencimiento propio de cookie y vence a las 12 h sin uso, y la segunda sigue con 7 días.
- **AC-28.** Given un navegador con la sesión S1 de la cuenta X, When ahí se hace un login correcto (con la cuenta X
  o con la Y), Then se abre una sesión nueva distinta de S1, y S1 mandada de nuevo recibe `401 SESSION_REQUIRED`.
  When en cambio el login es rechazado (contraseña incorrecta, `429` o `400`), Then S1 sigue respondiendo normal.
- **AC-29.** Given la app abierta en una página pública con una cookie vencida o anulada, When carga, Then se muestra
  como sin sesión, sin el mensaje "Tu sesión terminó…" y sin redirección al login, y el navegador ya no guarda esa
  cookie.
- **AC-30.** Given una sesión abierta, When se toca "Salir" y el servidor no puede anular la sesión (base de datos
  caída), Then la respuesta no es `204`, la pantalla muestra el mensaje de la fila 10, la barra sigue mostrando la
  sesión abierta, y la cookie sigue sirviendo (no quedó a medias: o se anuló en el servidor o no se tocó).
- **AC-31.** Given una cookie vencida o anulada, When se abre directo una página privada (por ejemplo
  `/loans`), Then la app lleva al login con la ruta de regreso a esa página y no muestra "Tu sesión terminó…".
- **AC-32.** Given que cerrar las otras sesiones recibe `429`, When la persona confirma, Then ve el mensaje de la
  fila 35, anunciado a lectores de pantalla, y ninguna sesión se cierra.
- **AC-33.** Given una cuenta con sesiones en A y B, When la cuenta se borra, Then no queda guardada ninguna sesión de
  esa cuenta (además de que A y B reciben `401`, AC-9).
- **AC-34.** Given un navegador con la sesión S1 de la cuenta X, When ahí se completa un registro correcto de la
  cuenta Y, Then S1 mandada de nuevo recibe `401`; When en cambio el registro es rechazado, Then S1 sigue respondiendo
  normal.
- **AC-35.** Given dos logins seguidos de la misma cuenta, When se comparan los dos identificadores de sesión, Then son
  distintos y ninguno se obtiene del otro ni de los datos de la cuenta; y con solo lo que el servidor guarda sobre las
  sesiones, un pedido protegido no se puede hacer pasar por ninguna de ellas.
- **AC-36.** Given una sesión, When un pedido protegido con ella y "Salir" se procesan al mismo tiempo, Then después de
  que "Salir" respondió `204`, esa cookie recibe `401 SESSION_REQUIRED` en todo pedido posterior.
- **AC-37.** Given una sesión vencida (por cualquiera de sus dos plazos), When pasa una hora desde que venció, Then ya
  no está guardada. *(Agregado el 2026-11-18 desde el plan, aprobado por Hernán.)*

## Points to clarify

- ~~**pregunta abierta** — ¿"Cerrar todas" cierra también la sesión actual?~~ **Resuelta en `clarify`
  (2026-11-18, Hernán):** no, la actual sigue abierta. El botón pasa a llamarse "Cerrar sesión en los otros
  dispositivos". Ver AC-6.
- ~~**pregunta abierta** — ¿El botón pide confirmación?~~ **Resuelta en `clarify` (2026-11-18, Hernán):** sí. Ver
  *What result they get* y AC-18.
- ~~**pregunta abierta** — ¿El error tiene mensaje propio?~~ **Resuelta en `clarify` (2026-11-18, Hernán):** sí,
  fila 39 de error-codes. Ver AC-11. El nombre del código lo fija el plan.
- **suposición tomada** — Sin "Recordarme", la sesión también vence en el servidor a las 12 horas sin uso. *Base:*
  varios navegadores (Chrome con "continuar donde lo dejaste", el celular que nunca cierra el navegador) conservan
  las cookies "de sesión" aunque se cierren; sin un tope del servidor, "no recordar" podría durar indefinidamente.
  12 h cubre una jornada de uso. *Riesgo:* si resulta corto, quien no marcó la casilla vuelve al login al otro día.
- **suposición tomada** — La casilla arranca desmarcada. *Base:* el caso que motiva el modo corto es la compu ajena;
  el error de olvidarse de desmarcarla es peor que el de olvidarse de marcarla. *Riesgo:* quien entra siempre desde su
  celular tiene que marcarla una vez por login.
- **suposición tomada** — Registrarse inicia una sesión sin "Recordarme". *Base:* la pantalla de registro no cambia
  en este ciclo y el modo corto es el seguro. *Riesgo:* quien se registra desde el celular vuelve a loguearse cuando
  el navegador descarta la cookie.
- **suposición tomada** — Al desplegar, todas las sesiones actuales de 1 h dejan de servir (AC-10) y cada persona
  vuelve a loguearse una vez. *Base:* producción tiene 1 cuenta activa (la de pruebas de Hernán); mantener dos formatos
  de sesión a la vez agrega código que se borra a la hora. *Riesgo:* si al momento del deploy ya hay vecinos usando la
  app, todos vuelven a loguearse una vez; ven "Tu sesión terminó…" solo si intentan una acción que requiere sesión
  (AC-29, AC-31).
- **suposición tomada** — Un `429` al cerrar las otras sesiones muestra la fila 35, no la 39. *Base:* la 35 dice qué
  hacer ("Esperá un minuto"); la 39 sugiere revisar la conexión, que no es el problema. *Riesgo:* difiere de "Salir",
  donde error-codes agrupa el `429` en la fila 10.
- **suposición tomada** — Cualquier pedido protegido con la sesión cuenta como "uso" y renueva el plazo, incluido el
  `GET /api/me` que la app hace al abrir. *Base:* "7 días sin usarla" quiere decir sin abrir la app. *Riesgo:* una
  pestaña que quede abierta y haga pedidos sola mantendría la sesión viva. Hoy la app no hace pedidos en segundo plano.
- **suposición tomada** — Las sesiones vencidas o anuladas no se guardan para siempre: se descartan pasado un tiempo
  que fija el plan (fijado: a más tardar una hora después de vencer, AC-37). *Base:* no hay ninguna pantalla que las muestre, y guardarlas sin uso es acumular sin motivo cuándo
  usó alguien la app. *Riesgo:* si más adelante se quiere una lista de dispositivos o una auditoría, falta el
  historial.
- **decisión diferida** — Lista de sesiones activas por dispositivo, con cierre puntual. Fuera de este ciclo.
- **decisión diferida** — Tope absoluto de duración de la sesión. Fuera de este ciclo.
- **área no formulable** — Qué pasa con la sesión si el barrio empieza a usar la app desde compus públicas de forma
  habitual (por ejemplo, una sesión más corta en esos casos). No hay datos todavía para formular la pregunta.

## Revisions

- **2026-11-18 — origen.** El backlog pedía "token de acceso de 15 min + token de renovación de 7 días con revocación
  y renovación automática en el cliente ante un 401". En `specify` se objetó que, desde 5c, el servidor ya revisa la
  cuenta en cada pedido, así que el permiso corto no aporta revocación y suma la renovación del cliente. Hernán eligió
  la sesión que el servidor recuerda (dirección B), 7 días contados desde el último uso, y sumar "Cerrar sesión en
  todos los dispositivos". La letra del checklist de autenticación (15 min + 7 días) queda sin cumplir a propósito;
  su intención (sesión larga y revocable, logout que invalida) sí.
- **2026-11-18 — revisión con ojos frescos.** Cuatro ajustes: la enmienda del principio 8 reemplaza también "JWT"
  (no solo "1h"); AC-6 y AC-11 dicen explícitamente que se cierran en `clarify`; los bordes de pedidos simultáneos,
  "Cerrar todas" sin sesión y base caída pasan a AC-15, AC-16 y AC-17; la sesión no guarda datos de dispositivo ni
  ubicación (nuevo non-goal).
- **2026-11-18 — `clarify`, tres respuestas de Hernán.** "Cerrar todas" no saca del dispositivo actual (renombrado a
  "Cerrar sesión en los otros dispositivos"); el botón pide confirmación; el error tiene mensaje propio (fila 39).
  AC-6 y AC-11 reescritos con resultado fijo; nuevos AC-18 (confirmación) y AC-19 (sin otras sesiones).
- **2026-11-18 — alcance: "Recordarme".** Hernán pidió evaluar sumar "Recordarme", duraciones elegibles y avisos por
  email. Eligió solo "Recordarme": con la casilla, 7 días sin uso; sin ella, la sesión termina al cerrar el navegador
  y, en el servidor, a las 12 h sin uso. Nuevos AC-20 a AC-25. Los avisos por email van a una spec propia, después de
  verificar el email al registrarse; las duraciones elegibles quedan fuera.
- **2026-11-18 — segunda revisión con ojos frescos.** Ocho ajustes: enmiendas que esta spec obliga en error-codes
  (fila 39 y el supuesto de 1 h de la fila 8); abrir la app con una cookie que ya no sirve no muestra mensaje ni
  redirige (AC-29); el cambio de contraseña conserva el modo (AC-27); el login siempre abre una sesión nueva y anula
  la anterior del navegador (AC-28); sin el dato "Recordarme" el login usa el modo corto (AC-26) y un valor inválido
  muestra la fila 37 (AC-25); la confirmación deshabilita el botón mientras espera y devuelve el foco (AC-18); el
  borde "venció o fue anulada"; la meta del modo corto menciona las 12 h.
- **2026-11-18 — tercera revisión con ojos frescos.** Siete ajustes: "Salir" con la base caída no da éxito (AC-30);
  un `429` al cerrar las otras muestra la fila 35 (AC-32, suposición); un login rechazado no anula la sesión previa
  (AC-28); el diálogo de confirmación es modal, con nombre accesible y foco atrapado, y el éxito se anuncia siempre
  (AC-18); abrir directo una página privada con cookie inválida lleva al login sin mensaje (AC-31); se listan todos
  los "1 hora" a enmendar en MVP y error-codes; la suposición del deploy concuerda con AC-29.
- **2026-11-18 — cuarta revisión con ojos frescos** (ningún hallazgo bloqueante; el revisor juzgó que otra ronda
  solo encontraría detalles de redacción o de plan). Siete ajustes: borrar la cuenta elimina sus sesiones guardadas
  (AC-33, privacidad de la spec MVP); el registro anula la sesión previa del navegador como el login (AC-34); el
  identificador no se puede adivinar ni usar desde una copia del servidor (AC-35); un pedido simultáneo con "Salir"
  nunca revive la sesión (AC-36); la renovación del vencimiento de la cookie pasa a *Behaviour*; el aviso de la
  casilla es su descripción accesible (AC-20); el plazo de descarte de sesiones vencidas lleva su criterio en el plan.
- **2026-11-18 — enmiendas pedidas por el plan, aprobadas por Hernán** ("Apruebo esas dos enmiendas"): la huella de
  la contraseña de 5c deja de ser una restricción (el plan la elimina, D14; AC-8 sigue igual); nuevo **AC-37**: una
  sesión vencida deja de estar guardada a más tardar una hora después.
