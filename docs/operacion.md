# Operación: despliegue, respaldo y restauración

## Variables de entorno

| Variable | Para qué | Valor por defecto |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL | (obligatoria, sin valor por defecto) |
| `PORT` | Puerto HTTP | `3000` |
| `SESSION_SECRET` | Firma de la cookie de sesión | (en producción es obligatoria) |
| `NODE_ENV` | Activa la cookie `secure` en producción | `development` |
| `COOKIE_SEGURA` | `1` exige HTTPS para la cookie de sesión, `0` la permite por HTTP | según `NODE_ENV` |
| `SEMBRAR` | `1` siembra los datos de ejemplo al arrancar el contenedor | `0` |
| `CLAVE_ADMIN`, `CLAVE_DOCENTE` | Claves que crea `npm run seed` | `Admin-2026`, `Docente-2026` |
| `UPLOAD_DIR` | Carpeta de archivos subidos | `app/uploads` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Base que crea el servicio `db` de compose | `creando`, (obligatoria), `creando_sabores` |
| `PUERTO_APP` | Puerto del host donde se publica el sitio | `3000` |

En producción, `SESSION_SECRET` debe ser una cadena larga y aleatoria
(`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Si cambia, todas las
sesiones abiertas se cierran.

## Con Docker

```bash
cp entorno.ejemplo .env                 # completar POSTGRES_PASSWORD y SESSION_SECRET
docker compose up -d --build
docker compose exec app npm run instalar
docker compose exec app npm run seed    # solo la primera vez
```

Las claves no están en el repositorio: si falta `POSTGRES_PASSWORD` o `SESSION_SECRET`, compose se
niega a arrancar (`falta POSTGRES_PASSWORD en .env`) en lugar de usar un valor de ejemplo. El servicio
`db` **no publica puerto al host**: solo lo alcanza `app` por la red interna. Para respaldar, consultar
o restaurar se usan los comandos `docker compose exec db ...` de más abajo.

### Cookie de sesión y HTTPS

En producción la cookie de sesión se marca `secure`, es decir que el navegador solo la manda por
HTTPS. Servida por HTTP (por ejemplo una demo en la red local con `http://192.168.1.112:8099`), el
navegador descarta la cookie: el login acepta la clave y la sesión no persiste. Para ese caso se pone
`COOKIE_SEGURA=0` en `.env`. Cuando el sitio queda detrás de HTTPS (dominio con certificado o túnel)
hay que volver a `COOKIE_SEGURA=1`.

Los datos de PostgreSQL viven en el volumen `pgdata` y los archivos subidos en `uploads`. Un
`docker compose down` sin `-v` no borra nada.

## Respaldo

Base de datos:

```bash
docker compose exec -T db pg_dump -U creando creando_sabores > respaldo-$(date +%F).sql
```

Archivos subidos:

```bash
docker compose cp app:/app/uploads ./respaldo-uploads-$(date +%F)
```

Si PostgreSQL corre en el host, es lo mismo sin `docker compose exec`:

```bash
pg_dump "$DATABASE_URL" > respaldo-$(date +%F).sql
tar czf respaldo-uploads-$(date +%F).tgz app/uploads
```

Frecuencia recomendada: diaria, y **antes de cada entrega o demo**. Guardar los respaldos fuera del
servidor (nube, pendrive, correo) — un respaldo en el mismo disco no protege de una falla del disco.

## Restauración

Sobre una base vacía:

```bash
createdb -U creando creando_sabores_restaurada
psql -U creando -d creando_sabores_restaurada < respaldo-2026-11-20.sql
```

Con Docker:

```bash
docker compose exec -T db psql -U creando -d creando_sabores < respaldo-2026-11-20.sql
```

Después de restaurar, verificar tres cosas:

1. `SELECT COUNT(*) FROM taller;` devuelve el número esperado.
2. `SELECT COUNT(*) FROM ejecucion;` también.
3. Se puede iniciar sesión con una cuenta conocida.

Los archivos subidos se restauran descomprimiendo el `.tgz` en `app/uploads` (o copiándolos al volumen).

## Instancia de demostración (red local)

Hay una instalación corriendo en el servidor de la casa de estudios para mostrar el avance sin
depender de la máquina de nadie.

| Dato | Valor |
|---|---|
| Servidor | `pctesla` (192.168.1.112) |
| Carpeta | `/opt/data/repos/creando-sabores` |
| Dirección | <http://192.168.1.112:8099> |
| Contenedores | `creando-sabores-app-1` y `creando-sabores-db-1` |
| Configuración | `PUERTO_APP=8099`, `COOKIE_SEGURA=0` (HTTP), `SEMBRAR=1` la primera vez |

Las claves de esa instalación **no** están en el repositorio: se generaron al desplegar
(`openssl rand -hex`) y viven en el entorno de los contenedores. Para recrear los contenedores hay que
volver a exportar `POSTGRES_PASSWORD`, `SESSION_SECRET`, `CLAVE_ADMIN` y `CLAVE_DOCENTE`, o crear el
`.env` correspondiente a partir de `entorno.ejemplo`.

Los datos de demostración (talleres y ejecuciones coherentes con la actividad real) se cargaron por SQL
directo sobre esa base, porque la siembra oficial la define T10. Si se recrea la base, hay que volver a
cargarlos.

Comandos útiles con los contenedores ya creados (no necesitan las variables):

```bash
docker exec creando-sabores-db-1 psql -U creando -d creando_sabores -c 'SELECT COUNT(*) FROM taller'
docker exec creando-sabores-db-1 pg_dump -U creando -d creando_sabores > respaldo-$(date +%F).sql
docker logs creando-sabores-app-1 --tail 40
```

## Prueba de restauración (obligatoria en T11)

Un respaldo que nunca se restauró no es un respaldo. La prueba consiste en:

1. Sacar el respaldo de la base en uso.
2. Crear una base nueva y restaurar ahí.
3. Levantar la aplicación apuntando a la base nueva y recorrer el panel.
4. Anotar fecha y resultado en este archivo.

| Fecha | Quién | Resultado |
|---|---|---|
| 2026-11-20 | Samuel Bugueño Vega | **Correcta.** `pg_dump` de 23 KB en `/opt/backups/creando-sabores-2026-11-20.sql`, restaurado en la base limpia `creando_restaurada` con `psql -v ON_ERROR_STOP=1` sin errores. Conteos idénticos en las siete tablas (usuario 2, taller 11, receta 1, documento 0, video 0, ejecucion 6, auditoria 0). Un contenedor de la aplicación apuntando a la base restaurada respondió el login (302), el panel (200) y el listado de talleres con los datos restaurados. |
