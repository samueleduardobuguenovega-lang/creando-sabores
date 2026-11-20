# Guía para quien mantiene la plataforma

Esta guía está pensada para la persona que queda a cargo de Creando Sabores cuando el equipo de
desarrollo ya no está. Dice qué hace el sistema, dónde corre, cómo se respalda y qué se puede cambiar
sin romperlo.

## Qué es y para qué sirve

Plataforma para registrar, administrar y mostrar los talleres gastronómicos de la actividad
**Creando Sabores**: talleres, recetas con ficha PDF, documentos, videos y la ejecución real de cada
taller. Tiene dos roles y un sitio público de solo lectura.

Queda **fuera del alcance** (lo dice el SRS): inscripción de participantes, control de asistencia,
certificados, pagos e inventario. La plataforma registra *cantidades* de participantes, nunca nombres de
alumnos.

## Las dos cuentas y qué puede cada una

| Rol | Puede | No puede |
|---|---|---|
| Administrador | Todo: usuarios, talleres, recetas, documentos, videos, ejecuciones, auditoría | — |
| Docente | Consultar y cargar talleres, recetas, documentos, videos y ejecuciones | Crear o editar usuarios y eliminar talleres (responde 403) |

La pantalla de entrada es `/login`. El menú cambia según el rol: lo que no corresponde simplemente no
aparece.

Toda acción relevante (crear, editar, eliminar) queda anotada en **Auditoría** con el usuario que la
hizo. Si alguien pregunta "¿quién borró esto?", la respuesta está ahí.

## Dónde corre

| Dato | Valor |
|---|---|
| Servidor | `pctesla` (192.168.1.112), encendido 24/7 |
| Carpeta | `/opt/data/repos/creando-sabores` |
| Dirección | <http://192.168.1.112:8099> (red local) |
| Servicios | dos contenedores Docker: `db` (PostgreSQL 16) y `app` (Node 20 + Express) |
| Datos | volumen `pgdata` (base) y volumen `uploads` (archivos subidos) |

Los dos contenedores arrancan solos al reiniciar el servidor (`restart: unless-stopped`).

## Arrancar, parar y mirar

Siempre desde `/opt/data/repos/creando-sabores`:

```bash
docker compose ps                 # ¿están los dos arriba?
docker compose logs -f app        # qué está pasando (Ctrl+C para salir)
docker compose restart app        # reiniciar solo la aplicación
docker compose down               # parar (NO borra datos)
docker compose up -d              # levantar de nuevo
```

`docker compose down -v` **borra la base y los archivos**. No lo uses salvo que quieras empezar de cero.

### Si el sitio no carga

1. `docker compose ps` → ¿`db` dice `healthy` y `app` está `Up`?
2. `docker compose logs app --tail 50` → el error real suele estar en las últimas líneas.
3. `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8099/` → debe responder `200`.
4. ¿La base responde? `docker compose exec db pg_isready -U creando -d creando_sabores`.

Si `app` está en `Restarting` en bucle, casi siempre es la base: revisá el paso 4 y los logs de `db`.

## Respaldo: antes de tocar nada

Un respaldo que nunca se restauró no es un respaldo. La rutina completa está en
`docs/operacion.md`; el resumen:

```bash
cd /opt/data/repos/creando-sabores
docker compose exec -T db pg_dump -U creando creando_sabores > respaldo-$(date +%F).sql
docker compose cp app:/app/uploads ./respaldo-uploads-$(date +%F)
```

Guardá esos dos archivos **fuera del servidor** (pendrive, nube, correo). Un respaldo en el mismo disco
no protege de que el disco falle.

## Qué se puede cambiar sin miedo

| Cambio | Cómo | Riesgo |
|---|---|---|
| Textos de las pantallas | vistas EJS en `app/views/` | bajo: recargar y mirar |
| Colores y espaciados | `app/public/css/estilos.css` | bajo |
| Datos (talleres, recetas, ejecuciones) | por la propia plataforma, con la cuenta de administrador | bajo, y queda en auditoría |
| Claves de las cuentas | por la plataforma (`/admin/usuarios`) | medio: avisá a quien corresponda |
| Esquema de la base | `app/src/schema.sql` | **alto**: respaldá y probá en una copia primero |

Regla de oro para cambios de código: rama nueva, `npm test` en verde, y un PR revisado por otra
persona. Nadie trabaja directo sobre `main`.

## Qué falta y a quién preguntar

Las tareas y quién las tiene están en `odd/tasks/creando-sabores.md`. En resumen, hoy están hechas la
base, el inicio de sesión con roles, el panel y talleres; recetas, ejecuciones, documentos y videos
están asignados y pendientes. Las pantallas de esos módulos todavía avisan "módulo en construcción": no
es una falla, es trabajo en curso.

| Tema | Responsable |
|---|---|
| Base, usuarios, panel, talleres, CI y despliegue | Samuel Bugueño Vega |
| Recetas, ejecuciones, adaptabilidad y accesibilidad | Francisco Puelles |
| Documentos PDF, videos y datos de demostración | Goran Almendra |
| Revisión académica | Jorge Ponce (tutor) |

## Cómo volver a levantar todo desde cero

En un servidor nuevo con Docker instalado:

```bash
git clone https://github.com/samueleduardobuguenovega-lang/creando-sabores.git
cd creando-sabores
cp entorno.ejemplo .env        # completar POSTGRES_PASSWORD y SESSION_SECRET
docker compose up -d --build   # crea las tablas solo
docker compose exec app npm run seed   # datos de ejemplo (opcional, una sola vez)
```

Las claves **no** están en el repositorio a propósito. `POSTGRES_PASSWORD` y `SESSION_SECRET` se generan
con `openssl rand -hex 32` (o el comando que indica `entorno.ejemplo`).

Si el sitio se publica por `http://` en la red local, `COOKIE_SEGURA=0` en `.env`. Detrás de HTTPS
(dominio con certificado o túnel) tiene que volver a `1`: con `0` la cookie de sesión viajaría sin
cifrar.
