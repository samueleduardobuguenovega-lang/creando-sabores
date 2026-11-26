# Imagen de la aplicación: Node con las herramientas que procesan los archivos.
FROM node:20-alpine

# pdftoppm convierte la primera página del PDF en imagen; gs comprime los PDF y
# magick orienta y reduce las fotos que se suben.
RUN apk add --no-cache poppler-utils ghostscript imagemagick

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
