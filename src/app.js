// Armado de la aplicación Express. Vive aparte de server.js para que las
// pruebas puedan levantarla en un puerto libre sin tocar el proceso real.
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);

const { pool } = require('./db');
const { ETIQUETA_ESTADO } = require('./validaciones');

// Sello de los estáticos: fecha de modificación de los dos archivos que
// importan. Cambian, cambia la URL, y el navegador no puede servir lo viejo.
function selloDeArchivos() {
  const archivos = [
    path.join(__dirname, '..', 'public', 'css', 'estilos.css'),
    path.join(__dirname, '..', 'public', 'js', 'app.js'),
  ];
  const marcas = archivos.map((ruta) => {
    try {
      return Math.floor(fs.statSync(ruta).mtimeMs).toString(36);
    } catch {
      return '0';
    }
  });
  return marcas.join('-');
}

const versionAssets = selloDeArchivos();

const rutasPublicas = require('../routes/publico');
const rutasAuth = require('../routes/auth');
const rutasAdmin = require('../routes/admin');
const rutasRecetas = require('../routes/recetas');
const rutasDocumentos = require('../routes/documentos');
const rutasVideos = require('../routes/videos');

// La cookie de sesión se marca "secure" (el navegador solo la manda por HTTPS)
// cuando se corre en producción. Eso es lo correcto detrás de un dominio con
// certificado, pero rompe una demo servida por HTTP en la red local: el
// navegador nunca devuelve la cookie y el login no persiste aunque la clave sea
// correcta. COOKIE_SEGURA permite elegir explícitamente: 1 fuerza la cookie
// segura, 0 la apaga (solo HTTP), y sin la variable manda NODE_ENV.
function cookieSegura() {
  const forzado = process.env.COOKIE_SEGURA;
  if (forzado === '1' || forzado === '0') return forzado === '1';
  return process.env.NODE_ENV === 'production';
}

function crearApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.disable('x-powered-by');

  // Detrás del proxy del hosting (Render, Cloud Run) las cookies "secure" solo
  // se envían si Express confía en el proxy: sin esto el login no persiste.
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Cabeceras de seguridad mínimas: no hay helmet entre las dependencias y la
  // demo se sirve por HTTPS a través de un túnel, así que se declaran a mano.
  // La CSP deja entrar solo los reproductores de YouTube que usan los videos.
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': [
        "default-src 'self'",
        "img-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline'",
        'frame-src https://www.youtube-nocookie.com https://www.youtube.com',
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
      ].join('; '),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    next();
  });

  // Un secreto de ejemplo permite firmar cookies desde fuera: en producción no
  // se arranca sin uno propio.
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    console.error('Falta SESSION_SECRET: no se puede arrancar en producción sin él.');
    process.exit(1);
  }

  app.use(
    session({
      store: new PgStore({ pool, createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET || 'clave-solo-para-desarrollo',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: cookieSegura(),
        maxAge: 1000 * 60 * 60 * 8,
      },
    })
  );

  // Datos que todas las vistas necesitan.
  app.use((req, res, next) => {
    res.locals.usuario = req.session.usuario || null;
    res.locals.aviso = typeof req.query.ok === 'string' ? req.query.ok : null;
    res.locals.error = typeof req.query.error === 'string' ? req.query.error : null;
    res.locals.etiquetaEstado = ETIQUETA_ESTADO;
    res.locals.rutaActual = req.path;
    res.locals.terminoBusqueda = typeof req.query.q === 'string' ? req.query.q : '';
    res.locals.anioActual = new Date().getFullYear();

    // Versión de los archivos estáticos para que el navegador estrene el CSS y
    // el JS nuevos al primer clic. Sin esto, un docente puede quedarse semanas
    // viendo la hoja de estilos vieja desde la caché.
    res.locals.versionAssets = versionAssets;
    res.locals.fecha = (valor) => {
      if (!valor) return '—';
      const soloFecha = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor));
      if (soloFecha) return `${soloFecha[3]}-${soloFecha[2]}-${soloFecha[1]}`;
      const momento = new Date(valor);
      if (Number.isNaN(momento.getTime())) return '—';
      return new Intl.DateTimeFormat('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/Santiago',
      }).format(momento);
    };
    next();
  });

  app.get('/admin', (req, res) => res.redirect('/panel'));

  app.use('/', rutasPublicas);
  app.use('/', rutasAuth);
  app.use('/', rutasRecetas);
  app.use('/', rutasAdmin);
  app.use('/', rutasDocumentos);
  app.use('/', rutasVideos);

  app.use((req, res) => {
    res.status(404).render('error', {
      titulo: 'Página no encontrada',
      mensaje: 'La dirección que abriste no existe en la plataforma.',
      detalle: 'Revisa el menú superior o vuelve al inicio.',
    });
  });

  // Express manda acá cualquier error no controlado por una ruta.
  app.use((error, req, res, next) => {
    console.error('Error no controlado:', error);
    res.status(500).render('error', {
      titulo: 'Algo salió mal',
      mensaje: 'El servidor no pudo completar la acción.',
      detalle: 'Vuelve a intentarlo; si sigue pasando, avisa al equipo.',
    });
  });

  return app;
}

module.exports = { crearApp };
