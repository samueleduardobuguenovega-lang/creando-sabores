// Armado de la aplicación Express. Vive aparte de server.js para que las
// pruebas puedan levantarla en un puerto libre sin tocar el proceso real.
const path = require('path');
const express = require('express');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);

const { pool } = require('./db');
const { ETIQUETA_ESTADO } = require('./validaciones');

const rutasPublicas = require('../routes/publico');
const rutasAuth = require('../routes/auth');
const rutasAdmin = require('../routes/admin');
const rutasDocumentos = require('../routes/documentos');
const rutasVideos = require('../routes/videos');

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

  app.use(
    session({
      store: new PgStore({ pool, createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET || 'clave-solo-para-desarrollo',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
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
    res.locals.anioActual = new Date().getFullYear();
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

  app.use('/', rutasPublicas);
  app.use('/', rutasAuth);
  app.use('/', rutasAdmin);
  app.use('/', rutasDocumentos);
  app.use('/', rutasVideos);

  app.use((req, res) => {
    res.status(404).render('error', {
      titulo: 'Página no encontrada',
      mensaje: 'La dirección que abriste no existe en la plataforma.',
      detalle: `/admin/... /talleres ... revisa el menú.`,
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
