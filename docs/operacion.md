# Operación: despliegue, respaldo y restauración

## Variables de entorno

| Variable | Para qué | Valor por defecto |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL | (obligatoria, sin valor por defecto) |
| `PORT` | Puerto HTTP | `3000` |
| `SESSION_SECRET` | Firma de la cookie de sesión | (en producción es obligatoria) |
| `NODE_ENV` | Activa la cookie `secure` en producción | `development` |
| `CLAVE_ADMIN`, `CLAVE_DOCENTE` | Claves que crea `npm run seed` | `Admin-2026`, `Docente-2026` |
| `UPLOAD_DIR` | Carpeta de archivos subidos | `app/uploads` |

En producción, `SESSION_SECRET` debe ser una cadena larga y aleatoria
(`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Si cambia, todas las
sesiones abiertas se cierran.

## Con Docker

```bash
docker compose up -d --build
docker compose exec app npm run instalar
docker compose exec app npm run seed    # solo la primera vez
```

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

## Prueba de restauración (obligatoria en T11)

Un respaldo que nunca se restauró no es un respaldo. La prueba consiste en:

1. Sacar el respaldo de la base en uso.
2. Crear una base nueva y restaurar ahí.
3. Levantar la aplicación apuntando a la base nueva y recorrer el panel.
4. Anotar fecha y resultado en este archivo.

| Fecha | Quién | Resultado |
|---|---|---|
| (pendiente T11) | | |
