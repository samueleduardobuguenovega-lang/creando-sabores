// Conexión única a PostgreSQL para toda la aplicación.
// La cadena de conexión viene de DATABASE_URL (ver .env.example).
const { Pool, types } = require('pg');

// Las columnas DATE se devuelven como texto 'aaaa-mm-dd': así no aparecen
// corridas de un día cuando el servidor corre en otra zona horaria.
types.setTypeParser(1082, (valor) => valor);

if (!process.env.DATABASE_URL) {
  console.error('Falta la variable DATABASE_URL. Copia .env.example a .env o expórtala antes de arrancar.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (error) => {
  console.error('Error inesperado en la conexión a PostgreSQL:', error.message);
});

function query(texto, parametros) {
  return pool.query(texto, parametros);
}

// Ejecuta varias consultas dentro de una transacción; si algo falla, no queda nada a medias.
async function transaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

module.exports = { pool, query, transaccion };
