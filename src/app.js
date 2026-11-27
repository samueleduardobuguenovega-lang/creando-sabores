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
  // Toda hoja y script propio entra en el sello: si falta uno, el navegador
  // sigue usando la versión vieja después de cada cambio (y el CSS nuevo
  // parece no aplicarse).
  const archivos = [
    path.join(__dirname, '..', 'public', 'css', 'estilos.css'),
    path.join(__dirname, '..', 'public', 'css', 'cartel.css'),
    path.join(__dirname, '..', 'public', 'js', 'app.js'),
    path.join(__dirname, '..', 'public', 'js', 'formularios.js'),
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

// Iconos del proyecto: se leen una sola vez desde public/icons y se inyectan
// como SVG inline, así heredan el color del texto que acompañan y no suman una
// petición por icono. `<%- icono('pdf') %>` en cualquier vista.
const cacheIconos = new Map();
function icono(nombre, clase = '') {
  if (!/^[a-z-]+$/.test(String(nombre))) return '';
  if (!cacheIconos.has(nombre)) {
    try {
      cacheIconos.set(
        nombre,
        fs.readFileSync(path.join(__dirname, '..', 'public', 'icons', `${nombre}.svg`), 'utf8')
      );
    } catch {
      cacheIconos.set(nombre, '');
    }
  }
  const svg = cacheIconos.get(nombre);
  if (!svg) return '';
  const clases = clase ? `icono ${clase}` : 'icono';
  return svg.replace('<svg ', `<svg class="${clases}" focusable="false" `);
}

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

  // Las páginas se piden siempre frescas: mientras alguien revisa el sitio,
  // una copia guardada le muestra contenido viejo y parece que el cambio no
  // se aplicó. Los archivos estáticos sí llevan su sello de versión.
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

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

  // Datos estáticos que toda vista necesita. Van ANTES de la sesión a
  // propósito: si el almacén de sesiones falla (base caída, cookie corrupta),
  // error.ejs sigue teniendo versionAssets, fecha y rutaActual y puede
  // renderizarse en vez de reventar con "versionAssets is not defined".
  app.use((req, res, next) => {
    res.locals.usuario = null;
    res.locals.aviso = null;
    res.locals.error = null;
    res.locals.etiquetaEstado = ETIQUETA_ESTADO;
    res.locals.rutaActual = req.path;
    // Dirección completa de la página: la necesitan las etiquetas que arman la
    // vista previa del enlace al compartirlo (WhatsApp, Telegram, X).
    res.locals.urlBase = `${req.protocol}://${req.get('host')}`;
    res.locals.urlActual = `${res.locals.urlBase}${req.originalUrl}`;
    res.locals.terminoBusqueda = '';
    // Solo /buscar lo apaga: esa vista trae su propio formulario con el término.
    res.locals.ocultarBusqueda = false;
    res.locals.anioActual = new Date().getFullYear();
    res.locals.icono = icono;

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

  // Solo lo que depende de la sesión se lee después de montarla, y con acceso
  // opcional: una cookie vieja no puede tumbar el resto del sitio.
  app.use((req, res, next) => {
    res.locals.usuario = (req.session && req.session.usuario) || null;
    res.locals.aviso = typeof req.query.ok === 'string' ? req.query.ok : null;
    res.locals.error = typeof req.query.error === 'string' ? req.query.error : null;
    // El HTML no se guarda: una plantilla nueva tiene que llegar en la próxima
    // visita, sin que el teléfono siga mostrando la cabecera anterior.
    res.set('Cache-Control', 'no-cache');
    res.locals.terminoBusqueda = typeof req.query.q === 'string' ? req.query.q : '';
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
      reintentar: true,
    });
  });

  return app;
}

module.exports = { crearApp };
