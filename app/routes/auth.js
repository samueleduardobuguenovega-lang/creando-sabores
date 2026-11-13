// Login y cierre de sesión (RF-02 / CU-01).
const express = require('express');
const { query } = require('../src/db');
const { verificar } = require('../src/auth');

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

module.exports = router;
