---
type: spec
title: Spec — Prestoteca MVP
description: WHAT and WHY for Prestoteca — a neighborhood tool lending app.
tags: [sdd, spec]
timestamp: 2026-10-04T00:00:00Z
topic: sdd
slug: prestoteca-mvp
status: clarified
---

# Spec — Prestoteca MVP

> Slug: `prestoteca-mvp` · Status: draft · Created: 2026-10-04
> Inherits: [constitution](../constitution.md)

## Problem & why

Mucha gente compra una herramienta para usarla una vez y después queda guardada años. Mientras tanto, el vecino de al lado necesita exactamente esa herramienta y no tiene a quién pedírsela. No hay un lugar estructurado para que vecinos de un mismo barrio se presten herramientas entre sí.

## Cost of not building it

Cada herramienta comprada para un uso único representa dinero desperdiciado y espacio ocupado. Los vecinos resuelven sus problemas con soluciones informales (WhatsApp, Facebook, preguntar en la esquina) que no generan historial ni confianza medible. El problema no se resuelve solo: el desperdicio de herramientas sigue acumulándose.

## The cheapest alternative

Un grupo de WhatsApp del barrio donde la gente pregunta "¿alguien tiene un taladro?". Es más barato (cero costo), pero es un caos: no hay búsqueda, no hay historial, no hay confianza, y cada pregunta se pierde en el flujo. No escala ni genera el efecto red que necesita el barrio.

## Goals

- Reducir el desperdicio de herramientas permitiendo que vecinos se las presten entre sí.
- Generar confianza entre vecinos a través de un historial de préstamos visible.
- Dejar validada la idea con un MVP que cubra el ciclo completo: publicar → pedir → prestar → devolver.

## Non-goals / out of scope

- Pagos ni dinero de por medio.
- Subida de fotos de herramientas (se usa un ícono por categoría).
- Mapa ni geolocalización (el barrio es un texto de una lista fija).
- Chat entre vecinos (la coordinación se hace con una nota en el pedido).
- Notificaciones por email.
- Calificaciones entre usuarios.
- Recuperación de contraseña por email.
- Verificación del email al registrarse.
- Deploy a producción.

## Users & context

| Rol | Qué quiere hacer |
| --- | --- |
| **Dueño** | Publicar sus herramientas y decidir a quién se las presta |
| **Solicitante** | Encontrar una herramienta cerca y pedirla para ciertas fechas |
| **Visitante** | Ver qué hay disponible antes de registrarse |

Una misma persona puede ser dueña y solicitante a la vez.

## Behaviour

**Camino principal:**
- Un dueño publica una herramienta con nombre, descripción, categoría (de la lista fija) y condición (nuevo, bueno o usado).
- Un visitante o registrado busca herramientas por nombre, categoría o barrio.
- Un visitante o registrado visita el detalle de una herramienta (muestra nombre, descripción, categoría, condición, barrio, estado y botón "Pedir" si disponible).
- Un registrado pide una herramienta ajena para un rango de fechas con una nota opcional.
- El dueño acepta o rechaza el pedido.
- Si acepta, el dueño marca "entregado" y luego "devuelto".
- El solicitante puede cancelar mientras no se entregó.
- Si no se devolvió en la fecha de fin, el préstamo se marca "vencido" automáticamente.
- Un solicitante puede volver a pedir una herramienta después de un préstamo terminado (rechazado, cancelado o devuelto).
- Un usuario logueado puede cambiar su contraseña desde su perfil.
- Un usuario logueado puede eliminar su cuenta (sus herramientas se marcan como borradas y sus préstamos mantienen historial anónimo).

**Casos borde:**
- Nadie puede pedir prestada su propia herramienta.
- La fecha de fin no puede ser anterior a la de inicio; la de inicio no puede ser anterior a hoy (calculado en la zona horaria del barrio, `America/Argentina/Tucuman`).
- Una herramienta pausada no aparece en la búsqueda ni acepta pedidos nuevos (el intento retorna error 409).
- Una herramienta borrada no aparece en listados pero sus préstamos pasados siguen en el historial.
- Un cambio de estado inválido (por ejemplo, Rechazado → Entregado) se rechaza sin tocar la base.
- Si dos personas cambian el mismo préstamo a la vez, gana una sola.
- Un usuario solo ve el detalle de los préstamos donde es dueño o solicitante.
- Un dueño puede editar o pausar una herramienta incluso con préstamos activos (los préstamos existentes no se modifican).
- El dueño puede cancelar un préstamo mientras esté pendiente o aceptado (antes de entregado).
- Si dos personas solicitan la misma herramienta simultáneamente, ambos pedidos se crean como "pendientes" y el dueño decide cuál aceptar.
- Un préstamo para fechas que se superponen con un préstamo activo existente se rechaza.
- Después de un préstamo terminado (rechazado, cancelado o devuelto), el solicitante puede volver a pedir la herramienta.

**Rutas de error:**
- Sin sesión o con sesión vencida → redirige al login y vuelve a la página original (la ruta de regreso solo puede ser interna: empieza con `/` y nunca es una URL completa ni empieza con `//`).
- Un cambio de estado inválido → error 409.
- Un usuario que intenta ver un préstamo donde no es dueño ni solicitante → error 404 (no 403).
- Parámetros de página inválidos → error 400.
- Mensajes de error genéricos al cliente; el detalle va a logs.
- Un body JSON mayor a 10kb → error 413.
- Demasiados intentos de login o registro desde una IP → error 429 (rate limiting: 5 intentos por minuto por IP).
- Una petición que modifica datos (POST, PATCH, DELETE) sin Origin header válido → error 403.
- Pedir una herramienta pausada → error 409.
- Pedir una herramienta con fechas que se superponen con un préstamo activo → error 409.

## Acceptance criteria

### Cuentas

- Dado que un usuario se registra con un nombre de menos de 2 caracteres o más de 50, entonces el registro se rechaza.
- Dado que un usuario se registra con un nombre de solo espacios, entonces el registro se rechaza (los espacios se recortan y queda vacío).
- Dado que un usuario se registra con un email de más de 254 caracteres, entonces el registro se rechaza.
- Dado que un usuario se registra con un email que ya existe (sin distinguir mayúsculas), entonces el registro se rechaza.
- Dado que un usuario se registra con una contraseña de menos de 8 caracteres o más de 72, entonces el registro se rechaza.
- Dado que un usuario se registra con una contraseña de solo espacios, entonces el registro se rechaza.
- Dado que un usuario se registra con un barrio no presente en la lista fija, entonces el registro se rechaza.
- Dado que un usuario se loguea con email y contraseña correctos, entonces obtiene una sesión válida.
- Dado que un usuario se loguea con email y contraseña incorrectos, entonces el login se rechaza.
- Dado que un usuario intenta loguearse más de 5 veces en un minuto desde la misma IP, entonces recibe error 429.
- Dado que un usuario intenta registrarse más de 5 veces en un minuto desde la misma IP, entonces recibe error 429.
- Dado que un usuario se loguea, entonces se crea una cookie de sesión que expira en 1 hora.
- Dado que un usuario hace logout, entonces la cookie de sesión se borra.
- Dado que un usuario intenta acceder a una ruta privada sin sesión o con sesión vencida, entonces se redirige al login y vuelve a la ruta original (que es interna, empieza con `/`).
- Dado que un usuario está logueado, cuando cambia su contraseña desde su perfil con una nueva contraseña válida (8–72 caracteres, no solo espacios), entonces la nueva contraseña se guarda y la anterior deja de funcionar.
- Dado que un usuario está logueado, cuando elimina su cuenta, entonces sus herramientas se marcan como borradas (borrado lógico) y sus préstamos mantienen su historial pero el nombre del usuario se borra.

### Herramientas

- Dado que un usuario está logueado como dueño, cuando publica una herramienta con nombre (3–60 caracteres), descripción (máx. 500), categoría de la lista fija y condición (nuevo, bueno o usado), entonces la herramienta aparece en la búsqueda.
- Dado que un usuario intenta publicar una herramienta con nombre de menos de 3 caracteres o más de 60, entonces la publicación se rechaza.
- Dado que un usuario intenta publicar una herramienta con descripción de más de 500 caracteres, entonces la publicación se rechaza.
- Dado que un usuario intenta publicar una herramienta con una condición que no es "nuevo", "bueno" o "usado", entonces la publicación se rechaza.
- Dado que un usuario intenta publicar una herramienta con una categoría que no está en la lista fija, entonces la publicación se rechaza.
- Dado que un usuario intenta editar o pausar una herramienta que no es suya, entonces la operación se rechaza.
- Dado que un usuario intenta borrar una herramienta con préstamos activos, entonces el borrado se rechaza.
- Dado que un usuario edita una herramienta con préstamos activos, entonces la herramienta se actualiza pero los préstamos existentes no se modifican.
- Dado que un usuario pausa una herramienta con préstamos activos, entonces la herramienta deja de aparecer en la búsqueda pero los préstamos existentes mantienen su estado.
- Dado que un usuario visita el detalle de una herramienta, entonces ve su nombre, descripción, categoría, condición, barrio, estado y un botón "Pedir" si está disponible.
- Dado que una herramienta está pausada, entonces no acepta pedidos nuevos (el intento retorna error 409).

### Préstamos

- Dado que un usuario está logueado como solicitante, cuando pide una herramienta ajena para un rango de fechas válido con una nota opcional (máx. 300), entonces se crea un préstamo en estado "pendiente".
- Dado que un préstamo está pendiente, cuando el dueño lo acepta, entonces el estado pasa a "aceptado".
- Dado que un préstamo está pendiente, cuando el dueño lo rechaza, entonces el estado pasa a "rechazado".
- Dado que un préstamo está aceptado, cuando el dueño lo marca entregado, entonces el estado pasa a "entregado".
- Dado que un préstamo está entregado, cuando el dueño lo marca devuelto, entonces el estado pasa a "devuelto" (final).
- Dado que un préstamo está aceptado, cuando el solicitante lo cancela, entonces el estado pasa a "cancelado" (final).
- Dado que un préstamo está pendiente, cuando el dueño lo cancela, entonces el estado pasa a "cancelado" (final).
- Dado que un préstamo está aceptado, cuando el dueño lo cancela, entonces el estado pasa a "cancelado" (final).
- Dado que un préstamo está entregado y pasó la fecha de fin sin marcarse devuelto, entonces el estado pasa automáticamente a "vencido" (final).
- Dado que un usuario intenta pedir prestada su propia herramienta, entonces el pedido se rechaza.
- Dado que un usuario intenta pedir una herramienta con la fecha de inicio anterior a hoy (en `America/Argentina/Tucuman`), entonces el pedido se rechaza.
- Dado que un usuario intenta pedir una herramienta con la fecha de fin anterior a la de inicio, entonces el pedido se rechaza.
- Dado que un usuario intenta pedir una herramienta que ya tiene un préstamo activo (pendiente, aceptado, entregado o vencido) para fechas que se superponen con ese préstamo, entonces el pedido se rechaza.
- Dado que dos personas solicitan la misma herramienta simultáneamente, entonces ambos pedidos se crean como "pendientes" y el dueño decide.
- Dado que un usuario intenta aplicar un cambio de estado inválido a un préstamo, entonces se retorna error 409 y el préstamo no cambia.
- Dado que un usuario intenta ver el detalle de un préstamo donde no es dueño ni solicitante, entonces se retorna error 404.
- Dado que un usuario fue rechazado, cancelado o devuelto para una herramienta, entonces puede volver a solicitarla (los préstamos terminados no bloquean nuevos pedidos).

### Búsqueda

- Dado que un usuario intenta listar herramientas con parámetros de página inválidos, entonces se retorna error 400.
- Dado que un usuario lista herramientas disponibles, entonces se muestran paginadas de a 12.
- Dado que un usuario filtra herramientas por categoría y barrio, entonces solo se muestran las que coinciden con ambos criterios.
- Dado que un usuario busca herramientas por nombre, entonces la búsqueda no distingue mayúsculas de minúsculas.
- Dado que un usuario busca herramientas con comodines (%) en el nombre, entonces se escapan y se tratan como texto literal.
- Dado que un usuario busca herramientas con guión bajo (_) en el nombre, entonces se escapan y se tratan como texto literal.
- Dado que una herramienta está pausada, entonces no aparece en la búsqueda.
- Dado que una herramienta está borrada (borrado lógico), entonces no aparece en listados.

### Perfil

- Dado que un usuario ve su perfil, entonces puede ver sus herramientas, los pedidos que recibió y los pedidos que hizo.
- Dado que un usuario ve su historial, entonces puede ver préstamos terminados (devuelto, rechazado o cancelado).

### Seguridad

- Dado que un usuario envía un body JSON mayor a 10kb, entonces se retorna error 413.
- Dado que un usuario envía un POST, PATCH o DELETE sin Origin header válido (no coincide con el frontend), entonces se retorna error 403.
- Dado que un usuario ve un mensaje de error, entonces el mensaje es genérico (no revela detalles internos del sistema).

### Infraestructura

- Dado que un usuario hace GET a la ruta de health, entonces recibe el estado del servidor y de la conexión a la base de datos.

## Points to clarify

- **suposición tomada** — La zona horaria para todas las comparaciones de fechas es `America/Argentina/Tucuman`. *Base:* el brief la especifica explícitamente. *Riesgo:* si se cambia, las comparaciones de "hoy" y el vencimiento fallan.
- **suposición tomada** — Los barrios son un texto fijo de 8 opciones que el usuario elige al registrarse. *Base:* el brief lista los 8 barrios y zonas. *Riesgo:* si se necesita editar la lista, hay que definir quién la edita y cómo.
- **suposición tomada** — Las categorías son un texto fijo de 6 opciones. *Base:* el brief lista las 6 categorías. *Riesgo:* si se necesita editar la lista, hay que definir quién la edita y cómo.
- **suposición tomada** — La sesión dura 1 hora. *Base:* el brief lo especifica. *Riesgo:* si se necesita renovar sesión sin re-login, hay que agregar un refresh token.
- **suposición tomada** — El barrio se elige de una lista fija al registrarse, no se escribe libremente. *Base:* el brief dice "barrio elegido de la lista de barrios y zonas". *Riesgo:* limita la flexibilidad si el barrio del usuario no está en la lista.
- **suposición tomada** — La búsqueda por nombre no distingue mayúsculas y escapa comodines SQL. *Base:* el brief lo especifica en RF-14. *Riesgo:* si se necesita búsqueda más avanzada (fuzzy, stemming), hay que evaluar un motor de búsqueda.
- **suposición tomada** — El vencimiento de un préstamo ("vencido") se marca automáticamente (por un proceso en segundo plano que revisa las fechas). *Base:* el brief dice "pasa a vencido si no se devolvió en la fecha de fin". *Riesgo:* si se hace manual, el dueño tiene que recordar marcarlo.
- **suposición tomada** — El Origin header se valida contra el dominio del frontend en desarrollo y producción. *Base:* el brief lo especifica en seguridad. *Riesgo:* en desarrollo local (localhost:3000 → localhost:3001) hay que configurar los dominios permitidos.
- **decisión tomada** — La coordinación entre vecinos se hace con un campo de nota opcional en el pedido (máx. 300 caracteres). *Base:* el brief lo especifica. *Motivo:* simple, sin complejidad extra.
- **decisión tomada** — Los préstamos vencidos quedan en estado "vencido" (final) sin proceso de reclamo dentro del MVP. *Base:* el brief solo define el estado "vencido". *Motivo:* el dueño resuelve offline con el solicitante; agregar un estado "reclamado" añade complejidad sin resolver el problema real.
- **decisión tomada** — Un usuario puede eliminar su cuenta. Sus herramientas se marcan como borradas (borrado lógico) y sus préstamos mantienen su historial pero el nombre del usuario se borra. *Motivo:* cumplimiento con regulaciones de privacidad.
- **decisión tomada** — Un usuario logueado puede cambiar su contraseña desde su perfil. No requiere email ni recuperación — solo ingresa la actual y la nueva. *Motivo:* caso de uso básico de usabilidad.
