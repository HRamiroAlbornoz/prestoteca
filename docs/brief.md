# Prestoteca — Brief del producto

Oct 3, 2026 · @Hernán Ramiro Albornoz

## Cómo usar este brief

Este documento describe el producto completo que hay que construir: qué hace, sus reglas, su stack y su diseño. Es la fuente de verdad del proyecto.

- Los requisitos tienen códigos (RF-xx) para que specs, tareas y commits puedan referenciarlos.
- El orden sugerido de construcción es: servidor base → cuentas → herramientas → préstamos → búsqueda y perfil.

## El producto: Prestoteca

Prestoteca es una app web donde vecinos de un mismo barrio se prestan herramientas entre sí: un taladro, una escalera, una hidrolavadora.

**El problema.** Mucha gente compra una herramienta para usarla una vez y después queda guardada años. Mientras tanto, el vecino de al lado necesita exactamente esa herramienta y no tiene a quién pedírsela.

**Los usuarios.**

| Rol | Qué quiere hacer |
| --- | --- |
| Dueño | Publicar sus herramientas y decidir a quién se las presta |
| Solicitante | Encontrar una herramienta cerca y pedirla para ciertas fechas |
| Visitante (sin cuenta) | Ver qué hay disponible antes de registrarse |

Una misma persona puede ser dueña y solicitante a la vez.

**La propuesta de valor.** Una biblioteca de herramientas del barrio: se presta, se devuelve, y queda un historial que genera confianza entre vecinos. Sin pagos ni dinero de por medio.

## Alcance del MVP

El MVP cubre cinco módulos y deja afuera todo lo que no es imprescindible para validar la idea.

**Entra en el MVP:**

1. Cuentas: registro, login, logout.
2. Herramientas: publicar, editar, pausar y borrar las propias.
3. Préstamos: pedir, aceptar, rechazar, marcar entregado, marcar devuelto, cancelar.
4. Búsqueda: listar y filtrar herramientas disponibles.
5. Perfil: ver mis herramientas, mis pedidos y mi historial.

**Queda fuera del MVP (a propósito):**

- Subida de fotos de herramientas. Se usa un ícono por categoría.
- Mapa y geolocalización. El barrio es un texto elegido de una lista.
- Chat entre vecinos. La coordinación se hace con un campo de nota en el pedido.
- Notificaciones por email.
- Calificaciones entre usuarios.
- Recuperación de contraseña por email.
- Verificación del email al registrarse.
- Deploy a producción. Se planifica después de completar el MVP.

## Requisitos funcionales

Cada requisito tiene un código (RF-xx) para que specs, tareas y commits puedan referenciarlo.

**Cuentas**

| Código | Requisito |
| --- | --- |
| RF-01 | Registro con nombre (2–50 caracteres), email (máx. 254, único sin distinguir mayúsculas), contraseña (8–72 caracteres) y barrio elegido de la lista de barrios y zonas |
| RF-02 | Login con email y contraseña; sesión con JWT de 1 hora en cookie `httpOnly`, `Secure` y `SameSite=Lax` |
| RF-03 | Logout: el servidor borra la cookie de sesión, aunque la sesión ya haya vencido |
| RF-04 | Rutas privadas: sin sesión o con sesión vencida, redirige al login y, al entrar, vuelve a la página donde estaba (por ejemplo, un visitante que toca "Pedir" vuelve a esa herramienta). La ruta de regreso solo puede ser interna: empieza con / y nunca es una URL completa ni empieza con // |

**Herramientas**

| Código | Requisito |
| --- | --- |
| RF-05 | Publicar herramienta: nombre (3–60), descripción (máx. 500), categoría de la lista de categorías, estado (nuevo, bueno, usado) |
| RF-06 | Editar y pausar solo las herramientas propias |
| RF-07 | Borrar una herramienta propia solo si no tiene préstamos activos (pendiente, aceptado, entregado o vencido). Es un borrado lógico: deja de mostrarse pero su historial de préstamos se conserva |

**Préstamos**

| Código | Requisito |
| --- | --- |
| RF-08 | Pedir una herramienta ajena para un rango de fechas, con nota opcional (máx. 300) |
| RF-09 | El dueño acepta o rechaza el pedido |
| RF-10 | El dueño marca "entregado" y luego "devuelto" |
| RF-11 | El solicitante puede cancelar mientras el pedido no fue entregado |
| RF-12 | Un préstamo pasa a "vencido" si no se devolvió en la fecha de fin |
| RF-17 | Ver el detalle de un préstamo: solo el dueño de la herramienta o el solicitante |

**Búsqueda**

| Código | Requisito |
| --- | --- |
| RF-13 | Listar herramientas disponibles, paginadas de a 12; parámetros de página inválidos responden 400 |
| RF-14 | Filtrar por categoría y barrio; buscar por nombre (máx. 60 caracteres, sin distinguir mayúsculas, escapando los comodines `%` y `_`) |

**Perfil**

| Código | Requisito |
| --- | --- |
| RF-15 | Ver mis herramientas, los pedidos que recibí y los que hice |
| RF-16 | Ver el historial de préstamos terminados (en estado devuelto, rechazado o cancelado) |

## Reglas de negocio y casos borde

El corazón del proyecto es el préstamo: tiene siete estados y solo ciertas personas pueden moverlo de uno a otro.

&#91;embedded content: estados del préstamo · 7 estados, 3 finales\]

**Quién puede hacer cada cambio**

| Cambio | Lo hace | Solo si |
| --- | --- | --- |
| Pendiente → Aceptado o Rechazado | Dueño | El pedido sigue pendiente |
| Pendiente o Aceptado → Cancelado | Solicitante | Todavía no se entregó |
| Aceptado → Entregado | Dueño | — |
| Entregado → Devuelto | Dueño | — |
| Entregado → Vencido | — | Pasó la fecha de fin sin devolución |

**Casos borde que el código debe cubrir**

- Nadie puede pedir prestada su propia herramienta.
- La fecha de fin no puede ser anterior a la de inicio, ni la de inicio anterior a hoy. "Hoy" y todas las comparaciones de fechas (incluido el vencimiento) se calculan en la zona horaria `America/Argentina/Tucuman`, no en la del servidor.
- Una herramienta pausada no aparece en la búsqueda y no acepta pedidos nuevos.
- Una herramienta borrada no aparece en ningún listado, pero sus préstamos pasados siguen en el historial.
- Un cambio de estado inválido (por ejemplo, Rechazado → Entregado) responde 409 y no toca la base.
- Si dos personas cambian el mismo préstamo a la vez, gana una sola: el cambio de estado se hace en una transacción.
- Un usuario solo ve el detalle de los préstamos donde es dueño o solicitante; si no, responde 404 (no 403, para no revelar que existe).

## Requisitos no funcionales

La seguridad y la accesibilidad son parte del MVP, no un extra para después.

**Seguridad**

- Validar todo dato externo en el servidor con un esquema (por ejemplo Zod), con límites de longitud en cada campo de texto. Los espacios al inicio y al final se recortan antes de validar, así un texto de solo espacios cuenta como vacío.
- Consultas SQL siempre parametrizadas; nunca concatenar texto del usuario.
- Contraseñas hasheadas con bcrypt, con largo máximo de 72 caracteres (bcrypt ignora lo que sigue, y una contraseña enorme sirve para saturar el servidor). Nunca se devuelven en ninguna respuesta.
- Protección XSS: React escapa por defecto; prohibido `dangerouslySetInnerHTML`.
- Protección CSRF: cookie de sesión con `SameSite=Lax`, y las peticiones que modifican datos (POST, PATCH, DELETE) verifican que el header `Origin` sea el del frontend.
- Rate limiting en login y registro (por ejemplo, 5 intentos por minuto por IP) y un límite general en la API.
- Detrás de un proxy (como Railway), Express usa `app.set('trust proxy', 1)` para leer la IP real; si no, todos los usuarios comparten una IP y el rate limit los bloquea a todos juntos.
- Tamaño máximo del body JSON (10 kb) para frenar ataques de denegación de servicio.
- Cabeceras seguras con Helmet y CORS limitado al dominio del frontend.
- Secretos solo en variables de entorno; el servidor no arranca si falta alguno.
- Mensajes de error genéricos hacia el cliente; el detalle queda en los logs.
- En producción, frontend y API deben verse como el mismo sitio para que la cookie `SameSite=Lax` viaje (por ejemplo, el frontend reenvía `/api` a la API con un rewrite).

**Accesibilidad (WCAG 2.2 nivel AA)**

- Todo se puede usar solo con teclado, con foco visible.
- Formularios con `label` asociado y errores anunciados por lectores de pantalla.
- Contraste mínimo de 4.5:1 en texto y de 3:1 en bordes de inputs, íconos y anillos de foco, en tema claro y oscuro.
- Áreas táctiles de al menos 24×24 px.
- Respetar `prefers-reduced-motion` en transiciones.

**Responsive y rendimiento**

- Mobile-first: CSS base a 320 px, media query de tablet a 768 px y de desktop a 1024 px.
- Listado de herramientas paginado desde el servidor (nunca traer todo).

**Calidad**

- Tests con Vitest (unidad), Supertest (API) y Testing Library (componentes React), escritos antes del código en las fases de implementación.
- Los tests de la API usan una base PostgreSQL separada de la de desarrollo, que se vacía y se recarga antes de cada corrida. Como protección, los tests se niegan a correr si el nombre de la base no contiene "test": así un error en la variable nunca borra los datos de desarrollo.
- Commits semánticos (`feat:`, `fix:`, `test:`, `docs:`…).

## Stack, estructura, datos y API

El stack es el que ya manejás, para concentrarse en el producto y no en aprender tecnologías nuevas.

| Capa | Tecnología |
| --- | --- |
| Backend | Node.js + Express 5 + TypeScript |
| Base de datos | PostgreSQL (consultas con `pg`, sin ORM, para ver el SQL) |
| Frontend | React + Vite + TypeScript + Tailwind + React Router |
| Tests | Vitest + Supertest + Testing Library |
| Control de versiones | Git con ramas por feature |
| Deploy (después del MVP) | Railway (API + una base de producción propia, distinta de las de desarrollo y tests) y Vercel (frontend) |

**Estructura de carpetas sugerida**

```
prestoteca/
  server/
    src/
      config/        # variables de entorno validadas al arrancar
      db/            # conexión, migraciones SQL y seed
      modules/
        auth/        # rutas, controlador, servicio, esquemas, tests
        tools/
        loans/
      middlewares/   # auth, errores, rate limit
      app.ts         # arma Express (sin escuchar puerto: así se testea)
      server.ts      # arranca y apaga limpio
  client/
    src/
      pages/
      components/
      hooks/
      services/      # llamadas a la API
```

**Modelo de datos**

| Tabla | Campos principales |
| --- | --- |
| users | id, name, email (único, guardado en minúsculas), password\_hash, neighborhood, created\_at |
| tools | id, owner\_id → users, name, description, category, condition, is\_paused, deleted\_at (borrado lógico), created\_at |
| loans | id, tool\_id → tools, borrower\_id → users, start\_date, end\_date (tipo DATE), status, note, created\_at, updated\_at |

**Listas fijas (iniciales, editables)**

| Lista | Valores |
| --- | --- |
| Barrios y zonas | Centro, Barrio Norte, Barrio Sur, Ciudadela, Villa Luján, Barrio Jardín, Villa 9 de Julio, Yerba Buena |
| Categorías | Herramientas eléctricas, Herramientas manuales, Jardín, Limpieza, Escaleras y altura, Otros |

**Entorno de desarrollo**

- PostgreSQL vive en un servicio de Railway, con dos bases en el mismo servicio: `prestoteca_dev` y `prestoteca_test`. El código corre en la PC y se conecta por internet.
- Desde la PC se usa la URL **pública** de conexión de Railway; la interna solo funciona entre servicios de Railway.
- Las URLs de conexión incluyen usuario y contraseña: van solo en `.env` (que nunca se commitea). Hay dos variables separadas, `DATABASE_URL` y `TEST_DATABASE_URL`.
- Un script de migraciones crea las tablas y un script de seed carga usuarios, herramientas y préstamos de ejemplo.
- Un archivo `.env.example` lista todas las variables necesarias, sin valores reales.

**API (todas bajo `/api`)**

| Método | Ruta | Auth | Para qué |
| --- | --- | --- | --- |
| GET | /health | No | Estado del servidor y de la conexión a la base |
| POST | /auth/register | No | Registro |
| POST | /auth/login | No | Login |
| POST | /auth/logout | No | Logout (borra la cookie) |
| GET | /tools | No | Listado con filtros y paginación |
| GET | /tools/:id | No | Detalle |
| POST | /tools | Sí | Publicar |
| PATCH | /tools/:id | Sí, dueño | Editar o pausar |
| DELETE | /tools/:id | Sí, dueño | Borrado lógico |
| POST | /tools/:id/loans | Sí | Pedir préstamo |
| GET | /loans/:id | Sí, dueño o solicitante | Detalle del préstamo |
| PATCH | /loans/:id/status | Sí | Cambiar estado (acepta, rechaza, entrega, devuelve, cancela) |
| GET | /me/tools | Sí | Mis herramientas |
| GET | /me/loans | Sí | Mis pedidos hechos y recibidos |

## Diseño

Propuesta: oscura por defecto, sobria y profesional, con el violeta como único color de acento. Los valores de color están verificados contra el contraste mínimo de WCAG AA.

| Elemento | Sugerencia |
| --- | --- |
| Tema | Oscuro y claro automáticos según `prefers-color-scheme` |
| Acento en botones | Violeta `#7C3AED` con texto blanco (contraste 5.7:1) |
| Acento en texto y links sobre fondo oscuro | Violeta claro `#A78BFA` (contraste 7.0:1); `#7C3AED` ahí solo da 3.35:1 y no alcanza |
| Acento sobre fondo claro | `#7C3AED` (contraste 5.7:1 sobre blanco) |
| Fondo oscuro | Gris casi negro `#0F0F14`, no negro puro |
| Texto en tema oscuro | Principal #E4E4E7 (15:1) y secundario #A1A1AA (7.5:1) |
| Tema claro | Fondo blanco #FFFFFF; texto principal #18181B (17.7:1) y secundario #52525B (7.7:1) |
| Bordes de inputs | #71717A en ambos temas (supera 3:1 sobre los dos fondos) |
| Tipografía | Una sola familia sans (por ejemplo Inter), dos pesos |
| Tarjetas de herramienta | Ícono de categoría, nombre, barrio, estado y botón "Pedir" |
| Estados del préstamo | Etiquetas de color con texto (nunca solo color, por accesibilidad) |
| Movimiento | Transiciones sutiles de 150–200 ms en hover y foco |

**Pantallas del MVP:** inicio con buscador, detalle de herramienta, formulario de publicación, pedido de préstamo, "Mis préstamos" con pestañas (pedí / me pidieron), login y registro.
