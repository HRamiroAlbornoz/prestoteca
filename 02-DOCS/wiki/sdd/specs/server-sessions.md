---
type: spec
title: Spec — Sesiones de 7 días que el logout anula de verdad
description: WHAT and WHY para que la sesión dure mientras se usa la app (7 días sin uso), que "Salir" la anule en el servidor y que exista "Cerrar sesión en todos los dispositivos".
tags: [sdd, spec, auth, session]
timestamp: 2026-11-18T19:30:00Z
topic: sdd
slug: server-sessions
status: draft
---

# Spec — Sesiones de 7 días que el logout anula de verdad

> Slug: `server-sessions` · Status: draft · Created: 2026-11-18
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

- Quien usa la app al menos una vez cada 7 días no vuelve a ver la pantalla de login.
- "Salir" anula la sesión en el servidor: la misma cookie, usada después, ya no abre nada.
- La persona puede cerrar su sesión en todos los dispositivos con un botón, sin cambiar la contraseña.
- Se mantiene todo lo que ya cierra sesiones hoy: cambio de contraseña y cuenta borrada.

## Non-goals / out of scope

- **Permiso de acceso de 15 min + permiso de renovación.** Descartado. Ver *The cheapest alternative*.
- **Lista de dispositivos o sesiones activas** (ver dónde estás logueado y cerrar una puntual). Diferido.
- **Tope absoluto de duración** (por ejemplo, 30 días aunque se use todos los días). Diferido.
- **Casilla "Recordarme"** o duraciones elegibles por el usuario. Nadie lo pidió.
- **Avisos por email** de un login nuevo o de "Cerrar todas". Nadie lo pidió.
- **Cambiar la pantalla de login, de registro o el límite de intentos.** No se tocan.
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

- **Iniciar sesión** con email y contraseña, igual que hoy. Cualquier visitante con una cuenta activa.
- **Seguir usando la app días después** sin volver a loguearse, si no pasaron 7 días desde su último uso.
- **Tocar "Salir"** en la barra de navegación. Requiere una sesión abierta en ese dispositivo.
- **Tocar "Cerrar sesión en todos los dispositivos"** en Perfil → Configuración. Requiere una sesión abierta. Solo
  cierra las sesiones de su propia cuenta, nunca las de otra persona.

## What result they get

Referencia a aprobar por Hernán (respuestas de la API y texto en pantalla; no hay boceto nuevo, el botón usa el estilo
de los botones existentes de Configuración):

| Situación | Resultado esperado |
| --- | --- |
| Login correcto | Igual que hoy: `200`, cookie de sesión `httpOnly`. La cookie dura 7 días desde el último uso. |
| Pedido protegido con una sesión usada hace menos de 7 días | Responde normal y el plazo de 7 días vuelve a empezar. |
| Pedido protegido con una sesión sin usar por más de 7 días | `401 SESSION_REQUIRED`. En pantalla: "Tu sesión terminó. Iniciá sesión para continuar." y redirección al login. |
| "Salir" | Igual que hoy: `204` y vuelve al inicio sin sesión. Además, la cookie usada **antes** del logout, mandada de nuevo, recibe `401 SESSION_REQUIRED`. |
| "Cerrar sesión en todos los dispositivos" | Todas las sesiones de la cuenta, en cualquier dispositivo, reciben `401 SESSION_REQUIRED` en su próximo pedido. Qué pasa con la sesión actual: ver *Points to clarify*. |
| Falla al cerrar todas (sin conexión, error del servidor) | Un mensaje en español en la sección Configuración, anunciado a lectores de pantalla, sin texto del servidor. Las sesiones siguen abiertas. |
| Cambio de contraseña | Igual que hoy: las otras sesiones reciben `401`, la actual sigue. |
| Cuenta borrada | Igual que hoy: todas sus sesiones reciben `401`. |

## What it must respect

- **Constitución, principio 8:** hoy dice "auth via JWT in httpOnly cookie (1h expiry)". Se mantiene la cookie
  `httpOnly`. La frase entera "JWT in httpOnly cookie (1h expiry)" se **enmienda** a "identificador de sesión opaco en
  cookie httpOnly, vence a los 7 días sin uso, anulable desde el servidor": un JWT con datos de la cuenta contradiría
  AC-14. La enmienda pasa por `constitution` antes del plan y se anota en su registro de enmiendas y en
  `decisions.md`.
- **Spec MVP, criterio "la cookie de sesión expira en 1 hora"** (`prestoteca-mvp.md`, *Acceptance criteria*): queda
  reemplazado por esta spec. Se anota la enmienda en la spec MVP.
- **Spec MVP, redirección:** sin sesión o con sesión vencida, se redirige al login y vuelve a la ruta original
  (interna, empieza con `/`). Sin cambios.
- **5c ([session-revocation](../../ftd/session-revocation.md)):** cambiar la contraseña cierra las otras sesiones y
  deja la actual; una cuenta borrada pierde todas sus sesiones. Sin cambios de comportamiento.
- **Spec [error-codes](./error-codes.md):** toda sesión inválida responde `SESSION_REQUIRED` (fila 8) con su mensaje
  en español. "Salir" que falla muestra `LOGOUT_FAILED` (fila 10). Ningún texto del servidor llega a la pantalla
  (fila 1, guard `noServerText`). Los errores se anuncian a lectores de pantalla (principio 14).
- **Límite de pedidos:** las rutas de `/api/auth` siguen con su límite estricto y el resto con el general. Ninguna
  ruta nueva queda sin límite.
- **CSRF y origen:** los pedidos que cambian estado siguen exigiendo el origen permitido (`ORIGIN_NOT_ALLOWED`),
  incluido "Cerrar todas".
- **Contraseñas:** el sistema de hash y la huella de la contraseña de 5c no cambian de forma.

## How it proves it

- **Pruebas automáticas contra la app real** (como `server/tests/sessionWiring.test.ts`, no módulos sueltos): una por
  criterio de aceptación. El paso del tiempo (7 días) se simula con un reloj controlado, sin esperar.
- **Prueba del cliente** para el botón "Cerrar sesión en todos los dispositivos": éxito, error y anuncio a lectores
  de pantalla.
- **Comprobación en staging con dos "dispositivos"** (dos cookies distintas, por `curl`): logout de uno, el otro
  sigue; "Cerrar todas", los dos dan `401`; la cookie vieja después del logout da `401`. Los comandos y las
  respuestas quedan en `02-DOCS/wiki/sdd/verifications/server-sessions-<fecha>.md`.
- **Smoke en producción** después del deploy: login, pedido protegido, logout, la cookie vieja da `401`. Anotado en el
  mismo archivo de verificación.

## Behaviour

- **Camino principal:** la persona inicia sesión. Cada vez que usa la app con esa sesión, el plazo de 7 días vuelve a
  empezar. Mientras no pasen 7 días sin uso, sigue logueada en ese dispositivo.
- **"Salir":** la sesión de ese dispositivo queda anulada en el servidor y el navegador olvida la cookie. Las sesiones
  de otros dispositivos siguen.
- **"Cerrar sesión en todos los dispositivos":** todas las sesiones de la cuenta quedan anuladas.
- **Bordes:**
  - Una sesión que lleva exactamente 7 días sin uso ya está vencida. El límite no es ambiguo: vence en el instante en
    que se cumplen los 7 días.
  - Dos pedidos simultáneos con la misma sesión funcionan los dos. Ninguno saca al otro de la sesión.
  - "Salir" con una sesión ya vencida o anulada responde como un logout normal (`204`): el resultado buscado ya se
    cumple.
  - Varios dispositivos de la misma cuenta tienen sesiones independientes.
  - Al desplegar este cambio, las sesiones de 1 h que existan dejan de servir y esas personas vuelven a loguearse una
    vez (ver *Points to clarify*).
- **Errores:**
  - Sesión desconocida, vencida o anulada → `401 SESSION_REQUIRED`. La respuesta no dice cuál de las tres fue.
  - Si la base de datos no responde al revisar la sesión, el pedido no pasa (igual que hoy).
  - "Cerrar todas" sin sesión → `401 SESSION_REQUIRED`.

## Acceptance criteria

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
- **AC-6.** Given la misma cuenta con sesión en A y B, When A toca "Cerrar sesión en todos los dispositivos", Then B
  recibe `401 SESSION_REQUIRED` en su próximo pedido. *El resultado para A se fija en `clarify` (primera pregunta
  abierta) y se reescribe acá antes del plan.*
- **AC-7.** Given las cuentas X e Y con sesión, When X cierra todas sus sesiones, Then las sesiones de Y siguen
  respondiendo normal.
- **AC-8.** Given sesiones en A y B, When A cambia la contraseña, Then B recibe `401` y A sigue respondiendo normal
  (comportamiento de 5c, sin cambios).
- **AC-9.** Given sesiones en A y B, When la cuenta se borra, Then A y B reciben `401`.
- **AC-10.** Given una cookie de sesión emitida antes de este cambio (formato de 1 h), When se usa después del deploy,
  Then recibe `401 SESSION_REQUIRED`.
- **AC-11.** Given "Cerrar todas" falla (sin conexión o error del servidor), When la persona toca el botón, Then ve un
  mensaje en español en Configuración, anunciado a lectores de pantalla (`role="alert"`), sin texto del servidor, y
  sigue logueada. *El código y el texto del mensaje se fijan en `clarify` (tercera pregunta abierta); si es un código
  nuevo, se agrega también a la spec [error-codes](./error-codes.md).*
- **AC-12.** Given una sesión anulada o vencida, When se toca "Salir", Then responde `204`.
- **AC-13.** Given un pedido de "Cerrar todas" sin el origen permitido, When llega al servidor, Then responde
  `ORIGIN_NOT_ALLOWED` y no cierra ninguna sesión.
- **AC-14.** Given la cookie de sesión, When se inspecciona, Then es `httpOnly`, `SameSite=Lax`, `Secure` en
  producción, y su valor no contiene datos de la cuenta (ni id, ni email).
- **AC-15.** Given una sesión válida, When se mandan dos pedidos protegidos a la vez con la misma cookie, Then los dos
  responden normal y la sesión sigue válida para un tercer pedido.
- **AC-16.** Given ninguna cookie de sesión, When se pide "Cerrar todas", Then responde `401 SESSION_REQUIRED` y no
  cierra ninguna sesión.
- **AC-17.** Given la base de datos no responde, When llega un pedido protegido con una cookie de sesión, Then el
  pedido no se cumple y la respuesta es un error del servidor (`INTERNAL_ERROR`), nunca un acceso concedido.

## Points to clarify

- **pregunta abierta** — Al tocar "Cerrar sesión en todos los dispositivos", ¿se cierra también la sesión actual (la
  persona va al login) o queda abierta solo la actual? *Recomendación:* cerrar también la actual y llevar al login.
  Es lo que el nombre promete y lo que hacen la mayoría de los servicios.
- **pregunta abierta** — ¿El botón pide confirmación antes de cerrar todas? *Recomendación:* no. Deshacerlo cuesta
  solo volver a loguearse, y un paso extra no evita nada grave.
- **pregunta abierta** — Si "Cerrar todas" falla, ¿se reusa el mensaje de `LOGOUT_FAILED` ("No pudimos cerrar tu
  sesión…") o tiene un código y un mensaje propios? *Recomendación:* uno propio ("No pudimos cerrar las sesiones.
  Revisá tu conexión e intentá de nuevo en un momento."), porque el actual habla de "tu sesión", en singular. Sería la
  fila 39 de la tabla de error-codes.
- **suposición tomada** — Al desplegar, todas las sesiones actuales de 1 h dejan de servir (AC-10) y cada persona
  vuelve a loguearse una vez. *Base:* producción tiene 1 cuenta activa (la de pruebas de Hernán); mantener dos formatos
  de sesión a la vez agrega código que se borra a la hora. *Riesgo:* si al momento del deploy ya hay vecinos usando la
  app, todos ven "Tu sesión terminó" una vez.
- **suposición tomada** — Cualquier pedido protegido con la sesión cuenta como "uso" y renueva el plazo, incluido el
  `GET /api/me` que la app hace al abrir. *Base:* "7 días sin usarla" quiere decir sin abrir la app. *Riesgo:* una
  pestaña que quede abierta y haga pedidos sola mantendría la sesión viva. Hoy la app no hace pedidos en segundo plano.
- **suposición tomada** — Las sesiones vencidas o anuladas no se guardan para siempre: se descartan pasado un tiempo
  que fija el plan. *Base:* no hay ninguna pantalla que las muestre, y guardarlas sin uso es acumular sin motivo cuándo
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
