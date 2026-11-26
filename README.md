# Creando Sabores

Sitio del taller de gastronomía del Colegio Yungay, con Santo Tomás. Registra talleres,
recetas, ejecuciones, documentos y videos, y publica una vitrina abierta para visitas.
Los contenidos se cargan desde un panel con sesión.

## Stack

- Node.js 20 o superior, Express y EJS (server-side rendering, sin bundler).
- PostgreSQL 16 para los datos y las sesiones.
- CSS propio con dos hojas: `public/css/estilos.css` (base) y `public/css/cartel.css`
  (capa que gana en cascada: allí viven los ajustes de cabecera, tablas y responsividad).
- Ghostscript, ImageMagick y Poppler para procesar los archivos que se suben.

## Requisitos

| Pieza | Para qué | Cómo se instala |
| --- | --- | --- |
| Node.js >= 20 | correr el servidor y las pruebas | https://nodejs.org o `nvm install 20` |
| PostgreSQL >= 16 | base de datos | `apt install postgresql` / Docker |
| Poppler (`pdftoppm`) | mostrar la página del PDF dentro de la receta | `apt install poppler-utils` / `apk add poppler-utils` |
| Ghostscript (`gs`) | comprimir los PDF que se suben | `apt install ghostscript` |
| ImageMagick (`magick`) | orientar y reducir las fotos que se suben | `apt install imagemagick` |

Sin Poppler, las recetas con PDF responden con error 500 al abrir la vista previa: es la
causa más común de que "funcione todo menos una página".

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

Las pruebas crean y borran datos, así que necesitan una base aparte de la de trabajo:

```bash
createdb creando_pruebas
DATABASE_URL=postgres://usuario:clave@localhost:5432/creando_pruebas \
  SESSION_SECRET=pruebas NODE_ENV=test npm test
```

Requieren `pdftoppm` instalado; sin él fallan las pruebas de PDF con `spawn pdftoppm ENOENT`.
La suite tarda varios minutos porque cada prueba levanta el servidor.

## Estructura

```
server.js              arranque del proceso
src/app.js             configuración de Express, sesiones y middlewares
src/db.js              pool de PostgreSQL
src/schema.sql         esquema completo de la base
src/instalar.js        crea o actualiza las tablas
src/seed.js            datos y usuarios de ejemplo
src/pdf.js             convierte la primera página del PDF en imagen
src/archivos.js        comprime PDF y fotos al subirlos
routes/                rutas públicas y del panel
views/                 plantillas EJS (publico/, admin/, partials/)
public/css/            estilos: estilos.css (base) y cartel.css (capa final)
public/js/             comportamiento del cliente
tests/                 pruebas de integración con node:test
docs/                  requerimientos, modelo de datos, manual y operación
```

## Problemas frecuentes

- **`ENOTFOUND db`** al correr `npm run instalar` en el host: `db` es el nombre del
  servicio dentro de Docker. En el host usa `localhost` en `DATABASE_URL`.
- **Error 500 en una receta con PDF**: falta `pdftoppm` (paquete `poppler-utils`).
- **Entra al panel y la sesión no persiste sobre HTTP**: pon `COOKIE_SEGURA=0` fuera de
  producción.
- **El puerto 3000 está ocupado**: cambia `PORT`, o `docker compose up` con otro mapeo.
- **Los estilos no cambian después de editar**: las dos hojas se cachean con sello de
  versión; reinicia el servidor o fuerza recarga en el navegador.

## Responsividad

La interfaz se verifica midiendo 21 pantallas en 9 anchuras (320, 360, 390, 480, 768,
1024, 1200, 1440 y 1920 px) y buscando tres defectos: elementos fuera del ancho visible,
contenido recortado por `overflow` y controles solapados. Al tocar la cabecera, las tablas
o los listados conviene repetir esa medición antes de dar el cambio por terminado.
