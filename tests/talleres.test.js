// CU-03: crear, consultar y modificar talleres.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, entrar, pool } = require('./helpers');

let app;
let docente;
let admin;

before(async () => {
  await prepararBase();
  app = await levantarApp();

  docente = crearCliente(app.base);
  await entrar(docente, 'docente', 'Docente-2026');

  admin = crearCliente(app.base);
  await entrar(admin, 'admin', 'Admin-2026');
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

const TALLER = {
  nombre: 'Pan amasado para la venta',
  tematica: 'Panadería básica',
  descripcion: 'Dos sesiones: amasado y horneado.',
  fecha_planificada: '2026-11-20',
  estado: 'planificado',
};

test('el listado de talleres exige sesión', async () => {
  const anonimo = crearCliente(app.base);
  const respuesta = await anonimo.get('/admin/talleres');

  assert.equal(respuesta.estado, 302);
  assert.match(respuesta.ubicacion, /^\/login/);
});

test('un docente crea un taller y queda en el listado', async () => {
  const creacion = await docente.post('/admin/talleres', TALLER);

  assert.equal(creacion.estado, 302);
  assert.match(creacion.ubicacion, /^\/admin\/talleres\/\d+/);

  const listado = await docente.get('/admin/talleres');
  assert.equal(listado.estado, 200);
  assert.match(listado.texto, /Pan amasado para la venta/);
});

test('el taller guarda la fecha y el estado enviados', async () => {
  const { rows } = await pool.query(
    `SELECT nombre, estado, fecha_planificada::text AS fecha FROM taller WHERE nombre = $1`,
    [TALLER.nombre]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].estado, 'planificado');
  assert.equal(rows[0].fecha, '2026-11-20');
});

test('sin nombre el taller no se guarda', async () => {
  const respuesta = await docente.post('/admin/talleres', { ...TALLER, nombre: '' });

  assert.equal(respuesta.estado, 400);
  assert.match(respuesta.texto, /obligatorio/);

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS total FROM taller WHERE nombre = ''`);
  assert.equal(rows[0].total, 0);
});

test('un estado inventado se rechaza', async () => {
  const respuesta = await docente.post('/admin/talleres', {
    ...TALLER,
    nombre: 'Taller con estado raro',
    estado: 'archivado',
  });

  assert.equal(respuesta.estado, 400);
  assert.match(respuesta.texto, /estado del taller no es válido/);

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS total FROM taller WHERE nombre = 'Taller con estado raro'`);
  assert.equal(rows[0].total, 0);
});

test('editar un taller cambia el nombre y el estado', async () => {
  const { rows } = await pool.query(`SELECT id FROM taller WHERE nombre = $1`, [TALLER.nombre]);
  const id = rows[0].id;

  const edicion = await docente.post(`/admin/talleres/${id}`, {
    ...TALLER,
    nombre: 'Pan amasado (segunda versión)',
    estado: 'finalizado',
  });

  assert.equal(edicion.estado, 302);

  const detalle = await docente.get(`/admin/talleres/${id}`);
  assert.equal(detalle.estado, 200);
  assert.match(detalle.texto, /Pan amasado \(segunda versión\)/);
  assert.match(detalle.texto, /Finalizado/);
});

test('un taller inexistente responde 404', async () => {
  const respuesta = await docente.get('/admin/talleres/999999');

  assert.equal(respuesta.estado, 404);
  assert.match(respuesta.texto, /no existe/);
});

test('un docente no puede eliminar talleres; un administrador los manda a la papelera', async () => {
  const { rows } = await pool.query(`SELECT id FROM taller ORDER BY id LIMIT 1`);
  const id = rows[0].id;

  const intentoDocente = await docente.post(`/admin/talleres/${id}/eliminar`);
  assert.equal(intentoDocente.estado, 403);

  const intentoAdmin = await admin.post(`/admin/talleres/${id}/eliminar`);
  assert.equal(intentoAdmin.estado, 302);

  const { rows: quedan } = await pool.query('SELECT eliminado_en FROM taller WHERE id = $1', [id]);
  assert.equal(quedan.length, 1, 'el taller sigue existiendo');
  assert.ok(quedan[0].eliminado_en, 'quedó marcado en la papelera');
});

test('cada cambio queda registrado en la auditoría con su responsable', async () => {
  await docente.post('/admin/talleres', { ...TALLER, nombre: 'Taller auditado' });

  const { rows } = await pool.query(
    `SELECT a.accion, a.entidad, u.usuario
       FROM auditoria a
       JOIN usuario u ON u.id = a.id_usuario
      WHERE a.entidad = 'taller'
      ORDER BY a.id DESC
      LIMIT 1`
  );

  assert.equal(rows[0].accion, 'crear');
  assert.equal(rows[0].usuario, 'docente');
});
