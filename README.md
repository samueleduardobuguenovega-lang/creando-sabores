# Creando Sabores

Plataforma web para registrar, administrar y visualizar los talleres gastronómicos de la actividad
**Creando Sabores**: talleres, recetas en PDF, documentos, videos y la ejecución real de cada taller.

Proyecto académico — Analista Programador. Equipo: Francisco Puelles, Goran Almendra y Samuel Bugueño Vega.
Tutor: Jorge Ponce.

## Qué resuelve

- **Panel principal** con el total de talleres, su estado y los últimos talleres ejecutados.
- **Usuarios y roles**: administrador y docente, con sesión y registro de las acciones relevantes.
- **Talleres**: alta, edición, consulta y baja, con estado (planificado / en ejecución / finalizado).
- **Recetas**: ficha con código único y PDF, reutilizable en varios talleres.
- **Documentos y videos**: PDF subidos a la plataforma y enlaces de YouTube o Vimeo.
- **Ejecuciones**: qué pasó realmente en cada taller, con cantidad de participantes.
- **Sitio público** de solo lectura para consultar talleres y ejecuciones sin cuenta.

Fuera del alcance (lo dice el SRS): inscripción de participantes, asistencia, certificados, pagos e inventario.

## Stack

| Capa | Tecnología |
|---|---|
| Servidor | Node.js 20+ · Express 4 · EJS |
| Base de datos | PostgreSQL 16 |
| Sesión | `express-session` + `connect-pg-simple` |
| Claves | `bcryptjs` |
| Pruebas | `node:test` + HTTP real contra la app |

## Cómo levantarlo

### 1. Con Docker (lo más simple)

Las claves no están en el repositorio: primero se crea el archivo de configuración a partir de la
plantilla y se completan `POSTGRES_PASSWORD` y `SESSION_SECRET`.

```bash
cp entorno.ejemplo .env    # completar POSTGRES_PASSWORD y SESSION_SECRET
docker compose up -d --build
```

La plataforma queda en <http://localhost:3000>. La primera vez hay que crear el esquema y los datos de
ejemplo. El arranque del contenedor ya crea las tablas (es idempotente); el seed se pide una sola vez:

```bash
docker compose exec app npm run instalar
docker compose exec app npm run seed
```

Si `docker compose` responde `falta POSTGRES_PASSWORD en .env` o `falta SESSION_SECRET en .env`, es a
propósito: no arranca con claves de ejemplo.

### 2. Con PostgreSQL instalado en tu máquina

```bash
cd app
cp ../entorno.ejemplo .env       # ajusta DATABASE_URL si tu clave es distinta
npm install
npm run instalar                 # crea las tablas
npm run seed                     # datos de ejemplo (opcional)
npm start                        # http://localhost:3000
```

### 3. Solo pruebas

```bash
cd app
DATABASE_URL=postgres://usuario:clave@localhost:5432/creando_test npm test
```

Las pruebas crean el esquema desde cero en la base que reciben: **usa una base de pruebas, no la de
desarrollo**, porque borran el esquema `public` antes de empezar.

## Usuarios de ejemplo

Los crea `npm run seed`. Se pueden cambiar con `CLAVE_ADMIN` y `CLAVE_DOCENTE` antes de ejecutarlo.

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `Admin-2026` |
| Docente | `docente` | `Docente-2026` |

## Estructura

```
app/
  server.js              arranque HTTP
  src/
    app.js               armado de Express (lo usan también las pruebas)
    db.js                conexión y transacciones
    auth.js              claves y guardas de rol
    auditoria.js         bitácora de acciones
    validaciones.js      validaciones compartidas
    schema.sql           modelo de datos completo
    instalar.js          crea las tablas
    seed.js              datos de ejemplo
  routes/                publico.js · auth.js · admin.js
  views/                 EJS: partials, público y panel
  public/                CSS y archivos estáticos
  tests/                 pruebas de integración por HTTP
docs/                    requerimientos, modelo, plan de trabajo, manual, operación
odd/tasks/               plan de tareas con responsables y criterios de aceptación
```

## Estado

| Módulo | Estado | Responsable |
|---|---|---|
| Base, esquema, sesión | Listo | Samuel Bugueño |
| Usuarios, roles y auditoría | Listo | Samuel Bugueño |
| Panel principal | Listo | Samuel Bugueño |
| Talleres | Listo (slice de referencia) | Samuel Bugueño |
| Recetas y vínculo con talleres | Pendiente (T5) | Francisco Puelles |
| Ejecución de talleres | Pendiente (T6) | Francisco Puelles |
| Adaptabilidad, PWA y accesibilidad | Pendiente (T9) | Francisco Puelles |
| Documentos PDF | Pendiente (T7) | Goran Almendra |
| Videos | Pendiente (T8) | Goran Almendra |
| Datos demo y QA | Pendiente (T10) | Goran Almendra |
| CI, despliegue y respaldo | Listo (T11) | Samuel Bugueño |
| Manual y presentación | Pendiente (T12) | Samuel Bugueño |

El detalle de cada tarea, con lo que hay que cumplir para darla por terminada, está en
[`odd/tasks/creando-sabores.md`](odd/tasks/creando-sabores.md).

## Documentación

- [`docs/requerimientos.md`](docs/requerimientos.md) — trazabilidad SRS → código → prueba.
- [`docs/modelo-datos.md`](docs/modelo-datos.md) — diagrama, decisiones y relación con el del SRS.
- [`docs/plan-trabajo.md`](docs/plan-trabajo.md) — reparto, ramas, hitos y forma de entrega.
- [`docs/despliegue.md`](docs/despliegue.md) — cómo publicarlo (y por qué Firebase Hosting solo no alcanza).
- [`docs/manual-usuario.md`](docs/manual-usuario.md) — uso por rol.
- [`docs/operacion.md`](docs/operacion.md) — despliegue, respaldo y restauración.
- [`docs/guia-mantenedores.md`](docs/guia-mantenedores.md) — guía para quien quede a cargo de la plataforma.

## Licencia

Uso académico. El material de la actividad Creando Sabores pertenece a sus autores.
