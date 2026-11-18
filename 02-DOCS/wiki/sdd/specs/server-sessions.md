---
type: spec
title: Spec — Sesiones de 7 días que el logout anula de verdad
description: WHAT and WHY para que la sesión dure mientras se usa la app (7 días sin uso), que "Salir" la anule en el servidor y que exista "Cerrar sesión en los otros dispositivos".
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

- Quien inicia sesión con "Recordarme" y usa la app al menos una vez cada 7 días no vuelve a ver la pantalla de login.
- Quien inicia sesión sin "Recordarme" (por ejemplo, en una compu ajena) pierde la sesión al cerrar el navegador.
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
  incluido "Cerrar sesión en los otros dispositivos".
- **Contraseñas:** el sistema de hash y la huella de la contraseña de 5c no cambian de forma.

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
  7 días vuelve a empezar. Mientras no pasen 7 días sin uso, sigue logueada en ese dispositivo, aunque cierre el
  navegador.
- **Sin "Recordarme":** la sesión dura mientras el navegador siga abierto y se use al menos una vez cada 12 horas.
  Cerrar el navegador la termina en ese dispositivo.
- **Registro:** registrarse inicia una sesión sin "Recordarme" (la pantalla de registro no cambia).
- **Cambio de contraseña:** la sesión actual sigue con el modo que tenía.
- **"Salir":** la sesión de ese dispositivo queda anulada en el servidor y el navegador olvida la cookie. Las sesiones
  de otros dispositivos siguen.
- **"Cerrar sesión en los otros dispositivos":** después de confirmar, todas las sesiones de la cuenta menos la del
  dispositivo que lo pidió quedan anuladas.
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
  - "Cerrar las otras" sin sesión → `401 SESSION_REQUIRED`.
  - "Cerrar las otras" sin otras sesiones abiertas → éxito igual, con el mismo mensaje.
  - Si la sesión actual venció justo antes de confirmar → `401 SESSION_REQUIRED`, mensaje de sesión terminada y
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
  confirmación con el foco adentro; When toca "Cancelar" o aprieta Escape, Then la confirmación se cierra, ninguna
  sesión se cierra y el foco vuelve al botón.
- **AC-19.** Given una cuenta sin otras sesiones abiertas, When la persona confirma, Then ve "Cerramos la sesión en
  tus otros dispositivos." anunciado a lectores de pantalla, y su sesión sigue.
- **AC-20.** Given la pantalla de login recién abierta, When se inspecciona, Then hay una casilla con la etiqueta
  "Recordarme" asociada, desmarcada, alcanzable con Tab y que se marca con la barra espaciadora.
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
  When llega al servidor, Then responde `400` con un código de validación y no inicia ninguna sesión.

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
- **2026-11-18 — `clarify`, tres respuestas de Hernán.** "Cerrar todas" no saca del dispositivo actual (renombrado a
  "Cerrar sesión en los otros dispositivos"); el botón pide confirmación; el error tiene mensaje propio (fila 39).
  AC-6 y AC-11 reescritos con resultado fijo; nuevos AC-18 (confirmación) y AC-19 (sin otras sesiones).
- **2026-11-18 — alcance: "Recordarme".** Hernán pidió evaluar sumar "Recordarme", duraciones elegibles y avisos por
  email. Eligió solo "Recordarme": con la casilla, 7 días sin uso; sin ella, la sesión termina al cerrar el navegador
  y, en el servidor, a las 12 h sin uso. Nuevos AC-20 a AC-25. Los avisos por email van a una spec propia, después de
  verificar el email al registrarse; las duraciones elegibles quedan fuera.
