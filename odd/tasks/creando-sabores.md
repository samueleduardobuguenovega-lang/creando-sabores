# ODD — Creando Sabores: plataforma de talleres

**Proyecto:** Creando Sabores (SRS v1.0, noviembre 2026)
**Equipo:** Francisco Puelles · Goran Almendra · Samuel Bugueño Vega
**Tutor:** Jorge Ponce
**Repositorio:** https://github.com/samueleduardobuguenovega-lang/creando-sabores
**Estado:** base construida y en verde (37 pruebas de integración). Módulos de recetas, ejecuciones, documentos y videos asignados y pendientes.

---

## 1. Contexto y alcance

El SRS pide una aplicación web adaptable (PWA) para registrar, administrar y visualizar los talleres
gastronómicos de la actividad Creando Sabores: talleres, recetas (ficha PDF), documentos PDF, enlaces a
videos y la ejecución real de cada taller, con dos roles (administrador y docente) y registro de las
acciones relevantes.

Queda fuera: inscripción de participantes, control de asistencia, certificados, pagos e inventario.
La plataforma registra **cantidades** de participantes, nunca nombres de alumnos.

### Decisiones de arquitectura (y por qué)

| Decisión | Motivo |
|---|---|
| Node.js + Express + EJS, server-rendered | Es el stack acordado en la reunión de requerimientos y no necesita compilar nada: cualquiera del equipo levanta el proyecto con `npm start`. |
| PostgreSQL 16 | Modelo relacional normalizado (1FN–3FN), que es lo que evalúa la asignatura. |
| Receta ↔ Taller en tabla intermedia (`receta_taller`) | El RF-04 dice que una receta "podrá asociarse a uno o varios talleres". El diagrama del SRS la dibuja 1:N; se implementa N:M porque el texto manda y la receta debe ser reutilizable sin duplicarse. La diferencia queda documentada en `docs/modelo-datos.md`. |
| Sesión en PostgreSQL (`connect-pg-simple`) | Sin estado en memoria: el servidor puede reiniciarse sin botar a los usuarios. |
| Contraseñas con bcrypt | Nunca se guarda la clave en texto plano; la prueba lo verifica. |
| Videos por embed de YouTube/Vimeo, no alojados | Cero costo de almacenamiento; el SRS ya pide solo registrar el enlace. |
| Archivos fuera de `public/` | Un PDF de receta no debe quedar accesible sin sesión: se sirve por una ruta que valida rol. |

### Mapa SRS → código

| Requerimiento | Dónde vive | Tarea |
|---|---|---|
| RF-01 Panel principal | `routes/admin.js` (`/panel`), `views/admin/panel.ejs` | T3 (hecho) |
| RF-02 Usuarios y roles | `src/auth.js`, `routes/auth.js`, `/admin/usuarios` | T2 (hecho) |
| RF-03 Talleres | `/admin/talleres*` | T4 (hecho, slice de referencia) |
| RF-04 Recetas | `/admin/recetas` | T5 |
| RF-05 Documentos y videos | `/admin/documentos`, `/admin/videos` | T7, T8 |
| RF-06 Ejecución de talleres | `/admin/ejecuciones` | T6 |
| RNF accesibilidad y diseño adaptable | `public/css/estilos.css` | T9 |
| RNF auditoría de acciones | `src/auditoria.js`, `/admin/auditoria` | T2 (hecho) |
| RNF copias de seguridad | `docs/operacion.md` (respaldo con `pg_dump`) | T11 |
| Manual de usuario | `docs/manual-usuario.md` | T12 |

---

## 2. Especificaciones

Cada spec se cumple o no se cumple; no hay términos medios.

- **S1** — El esquema crea las tablas `usuario`, `taller`, `receta`, `receta_taller`, `documento`, `video`, `ejecucion` y `auditoria` con sus llaves y restricciones, y se puede ejecutar dos veces sin error.
- **S2** — Solo se entra con usuario y contraseña válidos y cuenta activa. Una clave incorrecta responde 401 y el mismo mensaje exista o no el usuario.
- **S3** — Toda ruta de administración exige sesión; sin ella responde 302 al login recordando el destino, y solo se aceptan destinos internos.
- **S4** — El rol `docente` no puede crear ni editar usuarios, ni eliminar talleres: recibe 403. El rol `admin` sí.
- **S5** — Crear, editar y eliminar talleres valida nombre, temática, fecha y estado; un dato inválido responde 400, no guarda nada y explica qué corregir.
- **S6** — El panel muestra el total de talleres, el desglose por estado, los últimos talleres ejecutados y accesos a Nuevo taller, Consultar e Informe.
- **S7** — Una receta se identifica por un código único, guarda el enlace de su PDF y se vincula a uno o varios talleres sin duplicar el registro.
- **S8** — Un documento PDF se sube con nombre, se asocia a un taller **o** a una receta (nunca a ambos), se valida tipo y tamaño, y se visualiza dentro del navegador con sesión iniciada.
- **S9** — Un video se registra con nombre, descripción y enlace de YouTube o Vimeo; un enlace de otro proveedor se rechaza con mensaje claro.
- **S10** — Una ejecución guarda fecha, taller, cantidad de participantes, observaciones opcionales y video opcional; al guardarla, el panel refleja el cambio.
- **S11** — Toda acción relevante (crear, actualizar, eliminar) deja una fila en `auditoria` con el usuario responsable, la entidad y el id.
- **S12** — El sitio público (inicio, talleres, ejecuciones) se ve sin sesión, es usable a 390 px de ancho y no expone datos personales.

---

## 3. Tareas

Cada tarea corta vertical (esquema → lógica → pantalla → prueba) y declara de qué depende.

### T1 · Base del proyecto y esquema — *Samuel Bugueño* — **hecha**

- Esquema completo, conexión, arranque, sesión en base, layout, estilos base, seed.
- Hecho cuando: `npm run instalar` + `npm run seed` + `npm start` levantan el sitio y las pruebas pasan.
- Superficies: `app/src/schema.sql`, `app/src/db.js`, `app/src/app.js`, `app/server.js`, `app/src/seed.js`, `app/src/instalar.js`, `app/views/partials/**`, `app/public/css/**`, `docker-compose.yml`.

### T2 · Usuarios, roles y auditoría — *Samuel Bugueño* — **hecha**

- Login con bcrypt, sesión persistida, guardas por rol, CRUD de usuarios, bitácora.
- Hecho cuando: S2, S3, S4, S11 tienen prueba en verde.
- Superficies: `app/src/auth.js`, `app/src/auditoria.js`, `app/routes/auth.js`, `app/views/login.ejs`, `app/views/admin/usuarios-*.ejs`, `app/views/admin/*usuario-form.ejs`, `app/tests/auth.test.js`, `app/tests/usuarios.test.js`.

### T3 · Panel principal — *Samuel Bugueño* — **hecha**

- Totales, desglose por estado, últimos ejecutados, accesos directos.
- Hecho cuando: S6 probado con y sin datos.
- Superficies: `app/views/admin/panel.ejs`, `app/routes/admin.js` (bloque panel), `app/tests/panel.test.js`.

### T4 · Talleres (slice de referencia) — *Samuel Bugueño* — **hecha**

- Listado con búsqueda y filtro por estado, alta, edición, detalle y baja (solo admin).
- Es el patrón que copian T5–T8: ruta → validación → consulta → vista → prueba.
- Hecho cuando: S5 probado, incluida la baja restringida por rol.
- Superficies: `app/routes/admin.js` (bloque talleres), `app/views/admin/taller*.ejs`, `app/tests/talleres.test.js`.

### T5 · Recetas y vínculo con talleres — *Francisco Puelles*

- CRUD de recetas: código único (`REC-001`), nombre, descripción, enlace o PDF de la ficha.
- Pantalla para asociar y desasociar una receta de varios talleres; el detalle del taller muestra sus recetas.
- Hecho cuando: S7 probado (código repetido → 400; receta en dos talleres → dos filas en `receta_taller`, una sola receta).
- Superficies: `app/routes/recetas.js` (nuevo), `app/views/admin/receta-*.ejs` (nuevos), `app/routes/admin.js` (solo el bloque `PENDIENTES`), `app/tests/recetas.test.js` (nuevo).
- **Bloqueada por:** T1. Sin bloqueo para empezar.

### T6 · Ejecución de talleres — *Francisco Puelles*

- Formulario de ejecución: fecha, taller, cantidad de participantes, observaciones, video opcional.
- Listado con filtro por taller y año; el panel y el sitio público reflejan el alta.
- Hecho cuando: S10 probado (participantes negativos → 400; ejecución visible en el taller y en el panel).
- Superficies: `app/routes/ejecuciones.js` (nuevo), `app/views/admin/ejecucion-*.ejs` (nuevos), `app/tests/ejecuciones.test.js` (nuevo).
- **Bloqueada por:** T1. Conviene después de T4 para reusar validaciones.

### T7 · Documentos PDF — *Goran Almendra*

- Subida con `multer` (solo PDF, máximo 10 MB), nombre visible, asociación a taller **o** receta.
- Visor en el navegador: `Content-Type: application/pdf` en línea, con sesión obligatoria; el archivo vive fuera de `public/`.
- Hecho cuando: S8 probado (archivo que no es PDF → 400; sin sesión → 302; descarga con el tipo correcto).
- Superficies: `app/src/uploads.js` (nuevo), `app/routes/documentos.js` (nuevo), `app/views/admin/documento-*.ejs` (nuevos), `app/tests/documentos.test.js` (nuevo), `app/.gitignore` (carpeta de subidas).

### T8 · Videos — *Goran Almendra*

- Alta de video con nombre, descripción, enlace y asociación; validación de proveedor con `enlaceVideo()`.
- Reproductor embebido en el detalle del taller y en la ficha de receta.
- Hecho cuando: S9 probado (enlace de YouTube y de Vimeo aceptados; otro dominio → 400).
- Superficies: `app/routes/videos.js` (nuevo), `app/views/admin/video-*.ejs` (nuevos), `app/tests/videos.test.js` (nuevo).

### T9 · Adaptabilidad, PWA y accesibilidad — *Francisco Puelles*

- Revisión a 390 px y 1280 px de todas las pantallas; menú usable con ocho entradas.
- `manifest.webmanifest` + icono, sin service worker en esta etapa (el SRS pide "adaptable / PWA", no offline).
- Contraste y foco visible: todo control alcanzable con teclado.
- Hecho cuando: captura a 390 px de cada pantalla revisada y contraste ≥ 4.5:1 en texto normal.
- Superficies: `app/public/css/estilos.css`, `app/public/manifest.webmanifest` (nuevo), `app/views/partials/head.ejs`.
- **Bloqueada por:** T4 (necesita pantallas que revisar).

### T10 · Datos de demostración y QA — *Goran Almendra*

- `seed` ampliado con 6 talleres, 4 recetas, 3 videos, 4 ejecuciones coherentes con la actividad real.
- Planilla de pruebas manuales (navegador, celular, teclado) con resultado y evidencia.
- Hecho cuando: la demo se puede mostrar completa sin cargar datos a mano.
- Superficies: `app/src/seed.js`, `docs/pruebas-manuales.md` (nuevo).
- **Bloqueada por:** T5, T6, T7, T8.

### T11 · CI, despliegue y respaldo — *Samuel Bugueño*

- GitHub Actions con PostgreSQL de servicio: instalación, esquema y pruebas en cada push.
- `docker-compose` para levantar base + aplicación; `docs/operacion.md` con respaldo y restauración (`pg_dump`).
- Hecho cuando: el workflow queda en verde en un PR real y el respaldo se restaura en una base limpia.
- Superficies: `.github/workflows/ci.yml`, `docker-compose.yml`, `Dockerfile`, `docs/operacion.md`.

### T12 · Manual de usuario y presentación — *Samuel Bugueño* (con revisión de los tres)

- Manual con capturas por rol, en `docs/manual-usuario.md`.
- Guion de la demo: qué se muestra, en qué orden y con qué datos.
- Hecho cuando: una persona que no conoce el sistema completa el circuito (crear taller → asociar receta → subir PDF → registrar video → documentar ejecución) siguiendo solo el manual.
- **Bloqueada por:** T5, T6, T7, T8, T9.

### Compromisos del tutor (Jorge Ponce)

| Hito | Qué revisa | Cuándo |
|---|---|---|
| H1 | Alcance y modelo de datos antes de codificar los módulos | Semana 1 |
| H2 | Demo funcional con talleres + recetas + ejecuciones | Semana 3 |
| H3 | Entrega completa: módulos, pruebas, manual y despliegue | Semana 4 |

---

## 4. Cómo trabajamos

- **Una rama por tarea**: `feat/t5-recetas` (nombre en el estilo `feat/tN-algo`). Nadie trabaja en `main`.
- **Carpetas por persona** para no chocar: cada módulo es su propio archivo de rutas y sus propias vistas. El único archivo compartido es `app/routes/admin.js`, y solo se toca en el bloque `PENDIENTES` al sacar un módulo de la lista.
- **Antes de pedir revisión**: `npm test` en verde y una captura de la pantalla nueva.
- **PR con una tarea por PR** y el número de spec en el título: `feat(recetas): CRUD y vínculo con talleres (S7)`.
- **Commits** en Conventional Commits, en español, sin menciones a herramientas de IA.
- **Al terminar una tarea**: marcar el checkbox en la issue, avisar en el grupo y actualizar este documento (mover la tarea a "hecha" con la fecha).

Detalle operativo en `docs/plan-trabajo.md`.

---

## 5. Riesgos

| Riesgo | Efecto | Mitigación |
|---|---|---|
| Dos personas tocando `admin.js` a la vez | Conflictos de merge diarios | Rutas por módulo en archivos propios; `admin.js` solo se toca para quitar el aviso de "pendiente". |
| El diagrama del SRS (1:N) choca con el texto del RF-04 (N:M) | Reproceso del modelo | Se implementa N:M y se documenta el motivo; el tutor lo valida en H1. |
| Subida de archivos sin validar | PDF ejecutable, disco lleno, ruta traversal | T7 valida tipo real, tamaño y nombre generado; nunca se usa el nombre del usuario como ruta. |
| Pruebas que dependen de una base real | "En mi máquina funciona" | CI con PostgreSQL de servicio; el esquema se crea desde `schema.sql` en cada corrida. |
| Dependencia de una sola persona para levantar el entorno | El equipo se frena | README con los tres caminos: Docker, PostgreSQL local y CI. |
| Fechas del curso se cruzan con el cierre del proyecto real (26-nov) | Menos tiempo de pulido | Módulos en orden de riesgo: recetas y ejecuciones primero, PWA al final. |

---

## 6. Log

- **2026-11-13** — Repositorio creado. T1–T4 implementadas por Samuel con 37 pruebas de integración en verde (auth, talleres, panel, usuarios, módulos pendientes). Documento ODD creado; issues abiertas para T5–T12. Base de referencia tomada del prototipo de noviembre 2026 (misma decisión de stack: Express + PostgreSQL).
- **2026-11-13** — Listo para publicar: `render.yaml` (servicio + base en un clic), arranque en contenedor que crea el esquema y siembra datos, y `trust proxy` para que la sesión funcione detrás de HTTPS. Firebase Hosting queda descartado para el servidor: exige Blaze con tarjeta (ver `docs/despliegue.md`).
