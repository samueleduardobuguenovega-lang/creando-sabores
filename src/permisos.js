// Reglas de propiedad del contenido (RF-02).
//
// Leer es de todos; escribir es del dueño, salvo la administración, que responde
// por el archivo completo. Sin estas guardas un docente puede pisar el taller de
// otro y la auditoría, aunque lo registre, no lo impide.

const { query } = require('./db');

function esAdmin(usuario) {
  return Boolean(usuario && usuario.rol === 'admin');
}

// Una fila es editable si no hay dueño registrado (datos viejos) o si el dueño
// es quien la quiere tocar. La administración siempre puede.
function puedeTocar(usuario, fila) {
  if (!usuario || !fila) return false;
  if (esAdmin(usuario)) return true;
  if (fila.id_usuario === null || fila.id_usuario === undefined) return true;
  return Number(fila.id_usuario) === Number(usuario.id);
}

async function tallerDe(id) {
  const { rows } = await query('SELECT id, nombre, id_usuario FROM taller WHERE id = $1 AND eliminado_en IS NULL', [Number(id) || 0]);
  return rows[0] || null;
}

async function recetaDe(id) {
  const { rows } = await query('SELECT id, nombre, id_usuario FROM receta WHERE id = $1 AND eliminado_en IS NULL', [Number(id) || 0]);
  return rows[0] || null;
}

// Respuesta uniforme cuando la sesión no alcanza.
function sinPermiso(res, mensaje, detalle) {
  return res.status(403).render('error', {
    titulo: 'Sin permiso',
    mensaje: mensaje || 'Este contenido pertenece a otra persona.',
    detalle:
      detalle ||
      'Puedes consultarlo, pero solo quien lo creó o la administración pueden modificarlo.',
  });
}

module.exports = { esAdmin, puedeTocar, tallerDe, recetaDe, sinPermiso };
