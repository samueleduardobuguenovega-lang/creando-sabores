FROM node:20-alpine

WORKDIR /app

# Primero las dependencias: si no cambian, Docker reutiliza la capa.
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev

COPY app/ ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Los archivos subidos viven fuera de public/ y se montan como volumen.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["docker-entrypoint.sh"]
