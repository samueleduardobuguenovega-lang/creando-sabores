# Requerimientos y trazabilidad

Resumen del SRS v1.0 y dónde queda implementado cada punto. Sirve para la revisión del tutor: cada fila
dice qué se pidió, dónde está y con qué prueba se demuestra.

## Requerimientos funcionales

| Código | Requerimiento | Dónde | Prueba |
|---|---|---|---|
| RF-01 | Panel principal con totales, desglose por estado, últimos ejecutados y accesos | `app/routes/admin.js` (`/panel`), `app/views/admin/panel.ejs` | `app/tests/panel.test.js` |
| RF-02 | Dos roles (administrador, docente), inicio de sesión y acciones asociadas a la cuenta | `app/src/auth.js`, `app/routes/auth.js`, `/admin/usuarios`, `/admin/auditoria` | `app/tests/auth.test.js`, `app/tests/usuarios.test.js` |
| RF-03 | Crear, editar, consultar y administrar talleres | `/admin/talleres*` | `app/tests/talleres.test.js` |
| RF-04 | Recetas con identificador y enlace PDF, reutilizables en uno o varios talleres | T5 — `app/routes/recetas.js` | `app/tests/recetas.test.js` (pendiente) |
| RF-05 | Documentos PDF asociados a taller o receta, con visor; videos de YouTube con nombre, descripción y enlace | T7 — `app/routes/documentos.js`; T8 — `app/routes/videos.js` | `app/tests/documentos.test.js`, `app/tests/videos.test.js` |
| RF-06 | Ejecución del taller: id, fecha, taller, cantidad de participantes, observaciones, video | T6 — `app/routes/ejecuciones.js` | `app/tests/ejecuciones.test.js` (pendiente) |

## Casos de uso

| Código | Caso de uso | Ruta | Estado |
|---|---|---|---|
| CU-01 | Iniciar sesión y autenticar usuario | `POST /login` | Hecho |
| CU-02 | Consultar panel principal | `GET /panel` | Hecho |
| CU-03 | Crear y modificar taller gastronómico | `POST /admin/talleres`, `POST /admin/talleres/:id` | Hecho |
| CU-04 | Registrar y vincular receta (ficha PDF) | T5 | Pendiente |
| CU-05 | Gestionar documentos PDF y enlaces de video | T7, T8 | Hecho |
| CU-06 | Documentar ejecución de taller | T6 | Pendiente |

## Requerimientos no funcionales

| Requerimiento del SRS | Cómo se cumple | Dónde |
|---|---|---|
| Diseño adaptable a computador, tablet y celular | CSS propio con grilla fluida, revisado a 390 px y 1280 px | `app/public/css/estilos.css` (T9) |
| Autenticación segura | Contraseñas con bcrypt (costo 10), sesión en base con cookie `httpOnly` y `sameSite=lax`, `secure` en producción | `app/src/auth.js`, `app/src/app.js` |
| Control de acceso según roles y permisos | Guardas `requiereSesion` / `requiereRol` en cada ruta privada | `app/src/auth.js`, `app/routes/admin.js` |
| Almacenamiento seguro de archivos | PDF de hasta 10 MB validado por contenido, nombre generado por el servidor y bytes guardados en PostgreSQL | `app/routes/documentos.js` |
| Copias de seguridad y recuperación | `pg_dump` diario documentado, restauración probada | `docs/operacion.md` (T11) |
| Interfaz sencilla e intuitiva | Formularios de una columna, mensajes en español que dicen qué corregir | Todas las vistas |
| Carga de fotografías desde el móvil | Acepta PDF e imágenes desde la cámara del teléfono en el mismo formulario de subida | T7 |
| Registro de modificaciones y acciones relevantes | Tabla `auditoria` con usuario, acción, entidad, id y detalle | `app/src/auditoria.js`, `/admin/auditoria` |
| Protección de datos y archivos privados | El sitio público no muestra usuarios ni nombres de alumnos; los documentos exigen sesión | `app/routes/publico.js`, T7 |

## Decisiones que se apartan del diagrama del SRS

El diagrama de base de datos del SRS dibuja `recetaTaller` con `idTaller` como llave foránea, es decir
una receta pertenece a un taller. El texto del RF-04 dice lo contrario: la receta es independiente y
"podrá asociarse a uno o varios talleres", para no volver a ingresarla.

Se implementa lo que dice el texto (tabla intermedia `receta_taller`, muchos a muchos) porque:

1. Es requisito explícito y verificable del SRS.
2. El diagrama no puede representar la reutilización sin duplicar la receta, que es justo lo que el RF-04
   prohíbe.
3. Cuesta lo mismo: una tabla de dos columnas con llave compuesta.

La diferencia está anotada en `docs/modelo-datos.md` para discutirla en H1 con el tutor.
