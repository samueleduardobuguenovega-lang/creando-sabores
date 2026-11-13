FROM node:20-alpine

WORKDIR /app

# Primero las dependencias: si no cambian, Docker reutiliza la capa.
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev

COPY app/ ./

# Los archivos subidos viven fuera de public/ y se montan como volumen.
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
