// Autenticación y control de acceso por rol (RF-02).
const bcrypt = require('bcryptjs');

const RONDAS = 10;

function hashear(clave) {
  return bcrypt.hash(clave, RONDAS);
}

function verificar(clave, hash) {
  return bcrypt.compare(clave, hash);
}

// Corta el paso a cualquier ruta privada y devuelve al login recordando a dónde iba.
function requiereSesion(req, res, next) {
  if (!req.session.usuario) {
    const destino = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?volver=${destino}`);
  }
  next();
}

function requiereRol(...roles) {
  return (req, res, next) => {
    const usuario = req.session.usuario;
    if (!usuario) return res.redirect('/login');
    if (!roles.includes(usuario.rol)) {
      return res.status(403).render('error', {
        titulo: 'Sin permiso',
        mensaje: 'Tu cuenta no tiene permisos para esta sección.',
        detalle: `Esta sección es solo para: ${roles.join(', ')}.`,
      });
    }
    next();
  };
}

module.exports = { hashear, verificar, requiereSesion, requiereRol };
