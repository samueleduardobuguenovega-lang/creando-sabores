// Rastro de las acciones relevantes (RNF de auditoría).
const { query } = require('./db');

// No lanza error hacia arriba a propósito: si la auditoría falla, la acción
// del usuario ya se guardó y no tiene sentido botarlo con un error 500.
async function registrar(idUsuario, accion, entidad, entidadId, detalle = {}) {
  try {
    await query(
      'INSERT INTO auditoria (id_usuario, accion, entidad, entidad_id, detalle) VALUES ($1, $2, $3, $4, $5)',
      [idUsuario, accion, entidad, entidadId, detalle]
    );
  } catch (error) {
    console.error('No se pudo registrar la auditoría:', error.message);
  }
}

module.exports = { registrar };
