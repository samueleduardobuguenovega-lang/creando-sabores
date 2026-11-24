// Datos de partida para poder probar la plataforma sin cargar todo a mano.
// Uso: npm run seed
const { pool, query } = require('./db');
const { hashear } = require('./auth');

const CLAVE_ADMIN = process.env.CLAVE_ADMIN || 'Admin-2026';
const CLAVE_DOCENTE = process.env.CLAVE_DOCENTE || 'Docente-2026';

async function seed() {
  const { rows: existentes } = await query('SELECT COUNT(*)::int AS total FROM usuario');
  if (existentes[0].total > 0) {
    console.log('Ya hay usuarios cargados; no se vuelve a sembrar para no duplicar.');
    await pool.end();
    return;
  }

  const { rows: admin } = await query(
    `INSERT INTO usuario (nombre, usuario, clave_hash, rol)
     VALUES ($1, $2, $3, 'admin') RETURNING id`,
    ['Administración Creando Sabores', 'admin', await hashear(CLAVE_ADMIN)]
  );

  await query(
    `INSERT INTO usuario (nombre, usuario, clave_hash, rol)
     VALUES ($1, $2, $3, 'docente')`,
    ['Docente de Gastronomía', 'docente', await hashear(CLAVE_DOCENTE)]
  );

  const { rows: taller } = await query(
    `INSERT INTO taller (nombre, tematica, descripcion, fecha_planificada, estado, id_usuario)
     VALUES ($1, $2, $3, $4, 'planificado', $5) RETURNING id`,
    [
      'Pan amasado para la venta',
      'Panadería básica',
      'Taller de dos sesiones: amasado, fermentación y horneado en bandejas.',
      '2026-11-20',
      admin[0].id,
    ]
  );

  await query(
    `INSERT INTO taller (nombre, tematica, descripcion, fecha_planificada, estado, id_usuario)
     VALUES ($1, $2, $3, $4, 'finalizado', $5)`,
    [
      'Conservas de temporada',
      'Conservas',
      'Mermeladas y encurtidos con fruta de la temporada, con etiquetado para venta.',
      '2026-10-15',
      admin[0].id,
    ]
  );

  const { rows: receta } = await query(
    `INSERT INTO receta (codigo, nombre, descripcion, enlace_pdf, id_usuario)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    ['REC-001', 'Mermelada de ciruela', 'Receta base con proporción fruta/azúcar y tiempo de cocción.', null, admin[0].id]
  );

  await query('INSERT INTO receta_taller (id_receta, id_taller) VALUES ($1, $2)', [receta[0].id, taller[0].id]);

  await query(
    `INSERT INTO ejecucion (fecha_ejecucion, id_taller, cantidad_participantes, observaciones, id_usuario)
     VALUES ($1, $2, $3, $4, $5)`,
    ['2026-10-15', taller[0].id, 12, 'Se horneó todo dentro del tiempo; faltó bandeja para enfriar.', admin[0].id]
  );

  console.log('Datos de ejemplo cargados.');
  console.log(`  admin   / ${CLAVE_ADMIN}`);
  console.log(`  docente / ${CLAVE_DOCENTE}`);
  console.log('Cambia esas claves antes de publicar la plataforma.');
  await pool.end();
}

seed().catch(async (error) => {
  console.error('No se pudieron cargar los datos:', error.message);
  await pool.end();
  process.exit(1);
});
