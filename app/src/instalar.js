// Crea las tablas a partir de src/schema.sql.
// Uso: npm run instalar
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function instalar() {
  const ruta = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(ruta, 'utf8');
  await pool.query(sql);
  console.log('Esquema creado o actualizado correctamente.');
  await pool.end();
}

instalar().catch(async (error) => {
  console.error('No se pudo instalar el esquema:', error.message);
  await pool.end();
  process.exit(1);
});
