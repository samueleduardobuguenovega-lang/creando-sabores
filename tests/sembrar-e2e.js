// Datos fijos para la calibración en navegador (tests/e2e-invariantes.js).
// Uso: node tests/sembrar-e2e.js  (con DATABASE_URL apuntando a la base de E2E)
//
// Deja el archivo en un estado conocido: talleres publicados, uno oculto, uno en
// papelera; recetas con y sin taller visible; documentos PDF e imagen; videos de
// YouTube; ejecuciones; y un registro de auditoría por cada caso.
const { pool } = require('../src/db');
const { hashear } = require('../src/auth');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function sembrar() {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.query(require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'schema.sql'), 'utf8'));

  const { rows: usuarios } = await pool.query(
    `INSERT INTO usuario (nombre, usuario, clave_hash, rol)
     VALUES ('Administración Creando Sabores', 'admin', $1, 'admin'),
            ('Docente de Gastronomía', 'docente', $2, 'docente'),
            ('Docente de Repostería', 'docente2', $2, 'docente')
     RETURNING id, usuario`,
    [await hashear('Admin-2026'), await hashear('Docente-2026')]
  );
  const admin = usuarios.find((u) => u.usuario === 'admin').id;
  const docente = usuarios.find((u) => u.usuario === 'docente').id;
  const docente2 = usuarios.find((u) => u.usuario === 'docente2').id;

  const talleres = [
    ['Pan amasado y hallullas', 'Panadería', 'Amasado, fermentación y horneado en bandejas.', '2026-08-14', 'finalizado', admin, true],
    ['Mermeladas de temporada', 'Conservas', 'Frutas de la zona, esterilización y etiquetado.', '2026-09-02', 'finalizado', docente, true],
    ['Empanadas de pino', 'Cocina chilena', 'Masa, relleno y armado para 40 personas.', '2026-10-12', 'en_ejecucion', docente, true],
    ['Sopas y caldos de invierno', 'Cocina chilena', 'Fondos, tiempos y aprovechamiento de verduras.', '2026-06-05', 'finalizado', docente2, true],
    ['Postres de leche', 'Repostería', 'Manjar, leche asada y arroz con leche.', '2026-11-18', 'planificado', docente2, true],
    ['Pan de masa madre', 'Panadería', 'Fermentación lenta con masa madre viva.', '2025-07-09', 'finalizado', admin, true],
    ['TALLER OCULTO E2E', 'Conservas', 'Borrador sin publicar: no debe verse en el sitio público.', '2026-12-01', 'planificado', docente, false],
    ['TALLER PAPELERA E2E', 'Repostería', 'En papelera: no debe verse ni descargarse.', '2026-05-01', 'finalizado', admin, true],
  ];
  const ids = {};
  for (const [nombre, tematica, descripcion, fecha, estado, dueno, publicado] of talleres) {
    const { rows } = await pool.query(
      `INSERT INTO taller (nombre, tematica, descripcion, fecha_planificada, estado, id_usuario, publicado, eliminado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [nombre, tematica, descripcion, fecha, estado, dueno, publicado, nombre.includes('PAPELERA') ? new Date() : null]
    );
    ids[nombre] = rows[0].id;
  }

  // Recetas: una visible en dos talleres, una que solo cuelga del taller oculto,
  // una en papelera.
  const recetas = [
    ['REC-001', 'Pan amasado tradicional', 'Receta base del taller de panadería.', docente, null],
    ['REC-002', 'Mermelada de ciruela', 'Con proporción fruta-azúcar y prueba de gel.', docente, null],
    ['RECETA SOLO OCULTA E2E', 'Receta de borrador', 'Solo existe dentro de un taller sin publicar.', docente, null],
    ['RECETA PAPELERA E2E', 'Receta descartada', 'En papelera: no debe aparecer.', admin, new Date()],
  ];
  const idsRecetas = {};
  for (const [codigo, nombre, descripcion, dueno, eliminado] of recetas) {
    const { rows } = await pool.query(
      `INSERT INTO receta (codigo, nombre, descripcion, id_usuario, eliminado_en)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [codigo, nombre, descripcion, dueno, eliminado]
    );
    idsRecetas[codigo] = rows[0].id;
  }
  await pool.query(
    `INSERT INTO receta_taller (id_receta, id_taller) VALUES
       ($1,$2),($1,$3),($4,$2),($5,$6),($7,$8)`,
    [
      idsRecetas['REC-001'], ids['Pan amasado y hallullas'], ids['Pan de masa madre'],
      idsRecetas['REC-002'], idsRecetas['RECETA SOLO OCULTA E2E'], ids['TALLER OCULTO E2E'],
      idsRecetas['RECETA PAPELERA E2E'], ids['Empanadas de pino'],
    ]
  );

  // Documentos: imagen de portada, PDF del taller, PDF de la receta, más las
  // dos trampas (hijo de taller oculto y de taller en papelera).
  const documentos = [
    ['Portada pan amasado', 'portada.png', 'image/png', PNG_1X1.length, PNG_1X1, ids['Pan amasado y hallullas'], null, null],
    ['Pauta del taller', 'pauta.pdf', 'application/pdf', 1024, Buffer.from('%PDF-1.4 prueba'), ids['Pan amasado y hallullas'], null, null],
    ['Ficha de receta', 'ficha.pdf', 'application/pdf', 1024, Buffer.from('%PDF-1.4 prueba'), null, idsRecetas['REC-001'], null],
    ['DOC OCULTO E2E', 'oculto.pdf', 'application/pdf', 1024, Buffer.from('%PDF-1.4 prueba'), ids['TALLER OCULTO E2E'], null, null],
    ['DOC PAPELERA E2E', 'papelera.pdf', 'application/pdf', 1024, Buffer.from('%PDF-1.4 prueba'), ids['TALLER PAPELERA E2E'], null, null],
    ['DOC SUELTO PAPELERA E2E', 'suelto.pdf', 'application/pdf', 1024, Buffer.from('%PDF-1.4 prueba'), ids['Pan amasado y hallullas'], null, new Date()],
  ];
  const idsDocs = [];
  for (const [nombre, archivo, mime, tamano, contenido, idTaller, idReceta, eliminado] of documentos) {
    const { rows } = await pool.query(
      `INSERT INTO documento (nombre, archivo, tipo_mime, tamano, contenido, id_taller, id_receta, id_usuario, eliminado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [nombre, archivo, mime, tamano, contenido, idTaller, idReceta, admin, eliminado]
    );
    idsDocs.push({ nombre, id: rows[0].id });
  }

  const videos = [
    ['Amasado paso a paso', 'YouTube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', ids['Pan amasado y hallullas'], null, null],
    ['VIDEO OCULTO E2E', 'Borrador', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', ids['TALLER OCULTO E2E'], null, null],
    ['VIDEO PAPELERA E2E', 'Descartado', 'https://vimeo.com/76979871', 'vimeo', ids['Empanadas de pino'], null, new Date()],
  ];
  for (const [nombre, descripcion, enlace, proveedor, idTaller, idReceta, eliminado] of videos) {
    await pool.query(
      `INSERT INTO video (nombre, descripcion, enlace, proveedor, id_taller, id_receta, id_usuario, eliminado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [nombre, descripcion, enlace, proveedor, idTaller, idReceta, docente, eliminado]
    );
  }

  const ejecuciones = [
    [ids['Pan amasado y hallullas'], '2026-08-14', 28, 'Salieron 60 panes.', null],
    [ids['Mermeladas de temporada'], '2026-09-02', 24, 'Se llenaron 48 frascos.', null],
    [ids['Empanadas de pino'], '2026-10-12', 32, 'Faltó relleno en la última bandeja.', null],
    [ids['TALLER PAPELERA E2E'], '2026-05-01', 10, 'Ejecución de un taller en papelera.', new Date()],
  ];
  for (const [idTaller, fecha, cantidad, observaciones, eliminado] of ejecuciones) {
    await pool.query(
      `INSERT INTO ejecucion (id_taller, fecha_ejecucion, cantidad_participantes, observaciones, id_usuario, eliminado_en)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [idTaller, fecha, cantidad, observaciones, docente, eliminado]
    );
  }

  // Auditoría: una acción por caso, con una entidad viva, una en papelera y una
  // ya purgada (id que no existe).
  await pool.query(
    `INSERT INTO auditoria (id_usuario, accion, entidad, entidad_id, detalle) VALUES
       ($1,'crear','taller',$2,'{"nombre":"Pan amasado y hallullas","tematica":"Panadería"}'::jsonb),
       ($1,'actualizar','taller',$3,'{"nombre":"TALLER PAPELERA E2E"}'::jsonb),
       ($1,'eliminar','documento',$4,'{"nombre":"DOC SUELTO PAPELERA E2E","tipo":"application/pdf"}'::jsonb),
       ($1,'purgar','video',999999,'{"nombre":"Video ya borrado","proveedor":"youtube"}'::jsonb)`,
    [admin, ids['Pan amasado y hallullas'], ids['TALLER PAPELERA E2E'], idsDocs.find((d) => d.nombre === 'DOC SUELTO PAPELERA E2E').id]
  );

  console.log('Base de E2E sembrada.');
  console.log('Taller publicado:', ids['Pan amasado y hallullas']);
  console.log('Documento en papelera:', idsDocs.find((d) => d.nombre === 'DOC SUELTO PAPELERA E2E').id);
  await pool.end();
}

sembrar().catch(async (error) => {
  console.error('No se pudo sembrar la base de E2E:', error.message);
  await pool.end();
  process.exit(1);
});
