// CU-04: crear, consultar y modificar recetas reutilizables en talleres.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, entrar, pool } = require('./helpers');

let app;
let docente;
let admin;
let talleres;

before(async () => {
  await prepararBase();
  app = await levantarApp();

  docente = crearCliente(app.base);
  await entrar(docente, 'docente', 'Docente-2026');

  admin = crearCliente(app.base);
  await entrar(admin, 'admin', 'Admin-2026');

  const { rows: usuarios } = await pool.query(`SELECT id FROM usuario WHERE usuario = 'docente'`);
  const { rows } = await pool.query(
    `INSERT INTO taller (nombre, tematica, descripcion, id_usuario)
     VALUES ('Taller de mermeladas', 'Conservas', '', $1),
            ('Taller de panadería', 'Panadería', '', $1)
     RETURNING id`,
    [usuarios[0].id]
  );
  talleres = rows.map((fila) => fila.id);
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

const RECETA = {
  codigo: 'REC-T5-001',
  nombre: 'Mermelada de frutilla',
  descripcion: 'Preparación de temporada.',
  enlace_pdf: 'https://ejemplo.cl/recetas/mermelada.pdf',
};

test('el listado administrativo de recetas exige sesión', async () => {
  const anonimo = crearCliente(app.base);
  const respuesta = await anonimo.get('/admin/recetas');

  assert.equal(respuesta.estado, 302);
  assert.match(respuesta.ubicacion, /^\/login/);
});

test('un docente crea una receta vinculada a varios talleres', async () => {
  const creacion = await docente.post('/admin/recetas', {
    ...RECETA,
    talleres,
  });

  assert.equal(creacion.estado, 302);
  assert.match(creacion.ubicacion, /^\/admin\/recetas\?ok=/);

  const { rows: recetas } = await pool.query(
    'SELECT id FROM receta WHERE codigo = $1',
    [RECETA.codigo]
  );
  assert.equal(recetas.length, 1);
  const { rows: asociaciones } = await pool.query(
    'SELECT id_taller FROM receta_taller WHERE id_receta = $1 ORDER BY id_taller',
    [recetas[0].id]
  );
  assert.deepEqual(asociaciones.map((fila) => fila.id_taller), [...talleres].sort((a, b) => a - b));

  const { rows: auditoria } = await pool.query(
    `SELECT accion, entidad
       FROM auditoria
      WHERE entidad = 'receta' AND entidad_id = $1
      ORDER BY id DESC LIMIT 1`,
    [recetas[0].id]
  );
  assert.deepEqual(auditoria[0], { accion: 'crear', entidad: 'receta' });
});

test('el listado busca por código o nombre', async () => {
  const porCodigo = await docente.get('/admin/recetas?q=REC-T5-001');
  const porNombre = await docente.get('/admin/recetas?q=mermelada');

  assert.equal(porCodigo.estado, 200);
  assert.match(porCodigo.texto, /Mermelada de frutilla/);
  assert.equal(porNombre.estado, 200);
  assert.match(porNombre.texto, /REC-T5-001/);
});

test('un código repetido o un enlace que no use HTTP/S se rechaza con 400', async () => {
  const duplicada = await docente.post('/admin/recetas', {
    ...RECETA,
    nombre: 'Otra receta',
  });
  assert.equal(duplicada.estado, 400);
  assert.match(duplicada.texto, /Ya existe una receta con ese código/);

  const enlaceInvalido = await docente.post('/admin/recetas', {
    ...RECETA,
    codigo: 'REC-T5-002',
    enlace_pdf: 'javascript:alert(1)',
  });
  assert.equal(enlaceInvalido.estado, 400);
  assert.match(enlaceInvalido.texto, /http:\/\/ o https:\/\//);
});

test('editar receta y reemplazar sus asociaciones actualiza las filas relacionadas', async () => {
  const { rows } = await pool.query('SELECT id FROM receta WHERE codigo = $1', [RECETA.codigo]);
  const id = rows[0].id;

  const edicion = await docente.post(`/admin/recetas/${id}`, {
    ...RECETA,
    codigo: 'REC-T5-001-EDIT',
    nombre: 'Mermelada revisada',
    talleres: [talleres[1]],
  });
  assert.equal(edicion.estado, 302);

  const { rows: asociaciones } = await pool.query(
    'SELECT id_taller FROM receta_taller WHERE id_receta = $1',
    [id]
  );
  assert.deepEqual(asociaciones.map((fila) => fila.id_taller), [talleres[1]]);

  const { rows: auditoria } = await pool.query(
    `SELECT accion, entidad
       FROM auditoria
      WHERE entidad = 'receta' AND entidad_id = $1
      ORDER BY id DESC LIMIT 1`,
    [id]
  );
  assert.deepEqual(auditoria[0], { accion: 'actualizar', entidad: 'receta' });
});

test('solo administración puede eliminar una receta y la baja queda auditada', async () => {
  const creacion = await docente.post('/admin/recetas', {
    ...RECETA,
    codigo: 'REC-T5-DELETE',
    nombre: 'Receta para eliminar',
    talleres: [talleres[0]],
  });
  assert.equal(creacion.estado, 302);

  const { rows } = await pool.query('SELECT id FROM receta WHERE codigo = $1', ['REC-T5-DELETE']);
  const id = rows[0].id;
  assert.equal((await docente.post(`/admin/recetas/${id}/eliminar`)).estado, 403);
  assert.equal((await admin.post(`/admin/recetas/${id}/eliminar`)).estado, 302);

  const { rows: eliminada } = await pool.query('SELECT id FROM receta WHERE id = $1', [id]);
  const { rows: asociaciones } = await pool.query('SELECT id_receta FROM receta_taller WHERE id_receta = $1', [id]);
  const { rows: auditoria } = await pool.query(
    `SELECT accion, entidad FROM auditoria
      WHERE entidad = 'receta' AND entidad_id = $1 ORDER BY id DESC LIMIT 1`,
    [id]
  );
  assert.equal(eliminada.length, 0);
  assert.equal(asociaciones.length, 0);
  assert.deepEqual(auditoria[0], { accion: 'eliminar', entidad: 'receta' });
});
