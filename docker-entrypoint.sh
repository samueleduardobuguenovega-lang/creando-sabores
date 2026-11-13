#!/bin/sh
# Arranque en contenedor: crea las tablas (idempotente) y, si se pide, siembra
# los datos de ejemplo. SEMBRAR=1 solo en la primera publicación.
set -e

echo "Creando o verificando el esquema..."
node src/instalar.js

if [ "$SEMBRAR" = "1" ]; then
  echo "Sembrando datos de ejemplo..."
  node src/seed.js
fi

echo "Arrancando la aplicación..."
exec node server.js
