// Login y cierre de sesión (RF-02 / CU-01).
const express = require('express');
const { query } = require('../src/db');
const { verificar, hashear, requiereSesion } = require('../src/auth');
const { registrar } = require('../src/auditoria');

const router = express.Router();

// Solo se aceptan destinos internos; evita que "volver" sirva para saltar a otro sitio.
function destinoSeguro(valor) {
  const texto = (valor ?? '').toString();
  if (!texto.startsWith('/') || texto.startsWith('//')) return '/panel';
  return texto;
}

router.get('/login', (req, res) => {
  if (req.session.usuario) return res.redirect('/panel');
  res.render('login', {
    titulo: 'Ingresar',
    volver: destinoSeguro(req.query.volver),
    usuarioIntentado: '',
    mensajeError: null,
  });
});

router.post('/login', async (req, res, next) => {
  const nombreUsuario = (req.body.usuario ?? '').toString().trim();
  const clave = (req.body.clave ?? '').toString();
  const volver = destinoSeguro(req.body.volver);

  if (!nombreUsuario || !clave) {
    return res.status(400).render('login', {
      titulo: 'Ingresar',
      volver,
      usuarioIntentado: nombreUsuario,
      mensajeError: 'Escribe tu usuario y tu contraseña.',
    });
  }

  try {
    const { rows } = await query(
      'SELECT id, nombre, usuario, clave_hash, rol, activo FROM usuario WHERE usuario = $1',
      [nombreUsuario]
    );
    const cuenta = rows[0];

    // Mismo mensaje para usuario inexistente y clave mala: no se filtra qué existe.
    const claveOk = cuenta ? await verificar(clave, cuenta.clave_hash) : false;
    if (!cuenta || !claveOk) {
      return res.status(401).render('login', {
        titulo: 'Ingresar',
        volver,
        usuarioIntentado: nombreUsuario,
        mensajeError: 'El usuario o la contraseña no coinciden.',
      });
    }
    if (!cuenta.activo) {
      return res.status(403).render('login', {
        titulo: 'Ingresar',
        volver,
        usuarioIntentado: nombreUsuario,
        mensajeError: 'Tu cuenta está desactivada. Pide a la administración que la reactive.',
      });
    }

    req.session.usuario = {
      id: cuenta.id,
      nombre: cuenta.nombre,
      usuario: cuenta.usuario,
      rol: cuenta.rol,
    };

    // Sin este save la petición siguiente puede llegar antes que la sesión
    // quede escrita en PostgreSQL y el usuario vuelve al login.
    await new Promise((ok, mal) => req.session.save((error) => (error ? mal(error) : ok())));

    res.redirect(volver);
  } catch (error) {
    next(error);
  }
});

async function cerrarSesion(req, res) {
  req.session.destroy(() => res.redirect('/login?ok=Sesión cerrada.'));
}

router.post('/salir', cerrarSesion);
router.get('/salir', cerrarSesion);

// Cambio de clave propia (RF-08). Sin esta pantalla cada docente depende de la
// administración para rotar su clave, y en la práctica nadie la rota.
router.get('/mi-clave', requiereSesion, (req, res) => {
  res.render('mi-clave', { titulo: 'Cambiar mi clave', errores: [] });
});

router.post('/mi-clave', requiereSesion, async (req, res, next) => {
  const actual = (req.body.actual ?? '').toString();
  const nueva = (req.body.nueva ?? '').toString();
  const repetir = (req.body.repetir ?? '').toString();
  const errores = [];

  try {
    const { rows } = await query('SELECT clave_hash FROM usuario WHERE id = $1', [req.session.usuario.id]);
    if (!rows[0] || !(await verificar(actual, rows[0].clave_hash))) {
      errores.push('La clave actual no coincide.');
    }
    if (nueva.length < 8) errores.push('La clave nueva debe tener al menos 8 caracteres.');
    if (nueva !== repetir) errores.push('La clave nueva y su repetición no coinciden.');
    if (nueva && nueva === actual) errores.push('La clave nueva debe ser distinta de la actual.');

    if (errores.length > 0) {
      return res.status(400).render('mi-clave', { titulo: 'Cambiar mi clave', errores });
    }

    await query('UPDATE usuario SET clave_hash = $1 WHERE id = $2', [
      await hashear(nueva),
      req.session.usuario.id,
    ]);
    await registrar(req.session.usuario.id, 'cambiar_clave', 'usuario', req.session.usuario.id, {});
    res.redirect('/mi-clave?ok=Clave actualizada.');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
