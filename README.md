# Creando Sabores

Sitio del taller de gastronomía del **Colegio Yungay** (con Santo Tomás). Reúne talleres,
recetas, clases, videos y documentos del año, y los publica en una vitrina abierta para
estudiantes y apoderados. Los contenidos se cargan desde un panel con sesión.

Sitio público sin registro, panel con dos roles (`admin` y `docente`) y renderizado en el
servidor: no hay bundler ni framework de cliente, sólo Node, EJS y CSS propio.

## Capturas

**Escritorio**

<table>
  <tr>
    <td width="50%"><img src="docs/capturas/inicio-escritorio.webp" alt="Portada"></td>
    <td width="50%"><img src="docs/capturas/talleres-escritorio.webp" alt="Talleres"></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/capturas/recetas-escritorio.webp" alt="Recetario"></td>
    <td width="50%"><img src="docs/capturas/taller-detalle-escritorio.webp" alt="Ficha de taller"></td>
  </tr>
</table>

**Teléfono** (390 × 844, navegación inferior fija de cinco destinos)

<table>
  <tr>
    <td width="25%"><img src="docs/capturas/inicio-movil.webp" alt="Portada en teléfono"></td>
    <td width="25%"><img src="docs/capturas/talleres-movil.webp" alt="Talleres en teléfono"></td>
    <td width="25%"><img src="docs/capturas/taller-detalle-movil.webp" alt="Ficha de taller en teléfono"></td>
    <td width="25%"><img src="docs/capturas/archivos-movil.webp" alt="Archivos en teléfono"></td>
  </tr>
</table>

## Qué incluye

- **Vitrina pública**: portada con el taller en curso, talleres con sus recetas, recetario
  completo, clases, videos y una galería de archivos donde la foto se ve antes que el nombre.
- **Ficha de taller**: fecha, participantes, recetas asociadas y videos embebidos.
- **Recetario**: ingredientes y pasos, con previa de la primera página si la receta viene en
  PDF y con las fotos propias de cada preparación.
- **Panel**: alta y edición de talleres, recetas, ejecuciones, documentos y videos, con
  permisos por rol y auditoría de cambios.
- **Archivos**: los PDF se comprimen y las fotos se orientan y reducen al subirlos. La
  galería no baja la foto de 1600 px: cada tarjeta recibe un WebP de 480 px con `srcset` y
  `loading="lazy"`, y sólo escala a la completa si la pantalla lo necesita.
- **Videos**: sólo enlaces de **YouTube**; cualquier otro proveedor se rechaza con un mensaje
  claro en el formulario.
- **Navegación en teléfono**: barra inferior fija con cinco destinos, sin menú hamburguesa.
- **Errores con salida**: estados de error con botón «Reintentar» y enlaces a inicio y
  talleres, en lugar de una pantalla en blanco.

## Stack

- Node.js 20 o superior, Express y EJS (renderizado en el servidor, sin bundler).
- PostgreSQL 16, también para las sesiones (`connect-pg-simple`).
- CSS propio en dos hojas: `public/css/estilos.css` (base) y `public/css/cartel.css`
  (capa final: cabecera, tablas, navegación móvil y responsividad).

### Dependencias de Node

| Paquete | Para qué |
| --- | --- |
| `express` | servidor HTTP y ruteo |
| `ejs` | plantillas del servidor |
| `pg` | cliente de PostgreSQL, pool de conexiones y consultas |
| `express-session` + `connect-pg-simple` | sesión del panel guardada en la base |
| `bcryptjs` | hash de las claves de usuario |
| `multer` | subida de archivos (PDF y fotos) |
| `dotenv` | carga `.env` en desarrollo; si no está, usa las variables del entorno |
| `playwright` (dev) | pruebas de navegador de la variante E2E |

### Herramientas del sistema

| Pieza | Para qué | Cómo se instala |
| --- | --- | --- |
| Node.js >= 20 | correr el servidor y las pruebas | https://nodejs.org o `nvm install 20` |
| PostgreSQL >= 16 | base de datos | `apt install postgresql` / Docker |
| Poppler (`pdftoppm`) | mostrar la página del PDF dentro de la receta | `apt install poppler-utils` / `apk add poppler-utils` |
| Ghostscript (`gs`) | comprimir los PDF que se suben | `apt install ghostscript` |
| ImageMagick (`magick`) | orientar y reducir las fotos que se suben | `apt install imagemagick` |

Sin Poppler, las recetas con PDF responden con error 500 al abrir la vista previa: es la
causa más común de que «funcione todo menos una página».

## Arranque con Docker (recomendado)

Trae Node, PostgreSQL y las tres herramientas en un solo paso.

```bash
git clone https://github.com/samueleduardobuguenovega-lang/creando-sabores.git
cd creando-sabores
cp .env.example .env          # revisa las claves de ejemplo
docker compose up --build -d
docker compose exec app npm run instalar   # crea o actualiza las tablas
docker compose exec app npm run seed       # datos de ejemplo y usuarios
```

Queda en http://localhost:3000. Si ese puerto ya está ocupado en tu equipo:

```bash
APP_PORT=3199 docker compose up -d   # http://localhost:3199
```

## Arranque manual

```bash
git clone https://github.com/samueleduardobuguenovega-lang/creando-sabores.git
cd creando-sabores
npm install

createdb creando_sabores     # o créala desde psql
cp .env.example .env         # ajusta DATABASE_URL y SESSION_SECRET

npm run instalar             # crea el esquema (src/schema.sql)
npm run seed                 # talleres, recetas y usuarios de ejemplo
npm start                    # http://localhost:3000
```

`npm run dev` hace lo mismo con recarga automática (`node --watch`).

## Variables de entorno

| Variable | Obligatoria | Por defecto | Qué hace |
| --- | --- | --- | --- |
| `DATABASE_URL` | sí | — | cadena de conexión de PostgreSQL |
| `SESSION_SECRET` | sí en producción | `clave-solo-para-desarrollo` | firma la cookie de sesión; en producción el servidor no arranca sin ella |
| `PORT` | no | `3000` | puerto del servidor |
| `NODE_ENV` | no | `development` | `production` activa cookies seguras y exige `SESSION_SECRET` |
| `COOKIE_SEGURA` | no | según `NODE_ENV` | `0` permite sesión por HTTP; en producción detrás de HTTPS va `1` |
| `CLAVE_ADMIN` | no | `Admin-2026` | clave del usuario `admin` que crea el seed |
| `CLAVE_DOCENTE` | no | `Docente-2026` | clave del usuario `docente` que crea el seed |
| `SEMBRAR` | no | `0` | `1` siembra datos al arrancar el contenedor |
| `GS_BIN` / `MAGICK_BIN` | no | `gs` / `magick` | ruta a los binarios si están en otro sitio |
| `APP_PORT` | no | `3000` | puerto del host cuando se levanta con Docker |

## Usuarios de ejemplo

El seed crea dos cuentas:

- `admin` / `Admin-2026` — administración, con acceso a usuarios y auditoría.
- `docente` / `Docente-2026` — carga de contenidos propios.

Cámbialas con `CLAVE_ADMIN` y `CLAVE_DOCENTE` antes de sembrar, o desde la pantalla de
clave propia después de entrar.

## Pruebas

La suite es de integración real: levanta el servidor contra PostgreSQL y **borra el esquema
en cada corrida**, así que necesita una base aparte de la de trabajo.

```bash
createdb creando_pruebas
DATABASE_URL=postgres://usuario:clave@localhost:5432/creando_pruebas \
  SESSION_SECRET=pruebas NODE_ENV=test npm test
```

Son 89 pruebas, tardan alrededor de medio minuto y requieren `pdftoppm`; sin él fallan las de
PDF con `spawn pdftoppm ENOENT`. `npm run test:e2e` corre además la variante de navegador.

## Estructura

```
server.js              arranque del proceso
src/app.js             configuración de Express, sesiones, CSP y middlewares
src/db.js              pool de PostgreSQL (dotenv opcional)
src/schema.sql         esquema completo de la base
src/instalar.js        crea o actualiza las tablas
src/seed.js            datos y usuarios de ejemplo
src/pdf.js             convierte la primera página del PDF en imagen
src/archivos.js        comprime PDF y fotos al subirlos y arma la miniatura WebP
src/miniaturas.js      completa las miniaturas que falten (npm run miniaturas)
routes/                rutas públicas y del panel
views/                 plantillas EJS (publico/, admin/, partials/)
public/css/            estilos: estilos.css (base) y cartel.css (capa final)
public/js/             comportamiento del cliente
tests/                 pruebas de integración con node:test
docs/                  requerimientos, modelo de datos, manual, operación y capturas
```

## Problemas frecuentes

- **`ENOTFOUND db`** al correr `npm run instalar` en el host: `db` es el nombre del
  servicio dentro de Docker. En el host usa `localhost` en `DATABASE_URL`.
- **Error 500 en una receta con PDF**: falta `pdftoppm` (paquete `poppler-utils`).
- **Entra al panel y la sesión no persiste sobre HTTP**: pon `COOKIE_SEGURA=0` fuera de
  producción.
- **El puerto 3000 está ocupado**: cambia `PORT`, o `docker compose up` con otro mapeo.
- **Los estilos no cambian después de editar**: las hojas se cachean con sello de versión y
  el HTML va con `Cache-Control: no-cache`; fuerza una recarga del navegador.

## Responsividad

La interfaz se verifica midiendo 21 pantallas en 9 anchuras (320, 360, 390, 480, 768, 1024,
1200, 1440 y 1920 px) y buscando tres defectos: elementos fuera del ancho visible, contenido
recortado por `overflow` y controles solapados. Al tocar la cabecera, las tablas o los
listados conviene repetir esa medición antes de dar el cambio por terminado.

## Documentación

- [`docs/requerimientos.md`](docs/requerimientos.md) — alcance, actores y requisitos.
- [`docs/modelo-datos.md`](docs/modelo-datos.md) — tablas, relaciones y reglas.
- [`docs/manual-usuario.md`](docs/manual-usuario.md) — uso del panel paso a paso.
- [`docs/operacion.md`](docs/operacion.md) — respaldo, restauración y despliegue.
- [`docs/despliegue.md`](docs/despliegue.md) — puesta en marcha con Docker.

Las capturas de `docs/capturas/` corresponden a la versión actual del sitio con los datos de
ejemplo del seed.
