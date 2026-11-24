// RF-09: eliminar manda a la papelera; restaurar devuelve; purgar borra de verdad.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, entrar, pool } = require('./helpers');

let app;
let docente;
let admin;
let anonimo;
let idAdmin;

before(async () => {
  await prepararBase();
  app = await levantarApp();

  docente = crearCliente(app.base);
  await entrar(docente, 'docente', 'Docente-2026');

  admin = crearCliente(app.base);
  await entrar(admin, 'admin', 'Admin-2026');

  anonimo = crearCliente(app.base);

  const { rows } = await pool.query("SELECT id FROM usuario WHERE usuario = 'admin'");
  idAdmin = rows[0].id;
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

const TALLER = {
  nombre: 'Taller que se elimina',
  tematica: 'Panadería',
  descripcion: 'Pan amasado.',
  fecha_planificada: '2026-12-01',
  estado: 'finalizado',
};

async function crearTaller(nombre) {
  const respuesta = await admin.post('/admin/talleres', { ...TALLER, nombre });
  assert.equal(respuesta.estado, 302);
  return Number(/^\/admin\/talleres\/(\d+)/.exec(respuesta.ubicacion)[1]);
}

test('eliminar un taller lo manda a la papelera y lo saca de todas partes', async () => {
  const id = await crearTaller('Taller a la papelera');

  const borrado = await admin.post(`/admin/talleres/${id}/eliminar`);
  assert.equal(borrado.estado, 302);

  const listado = await admin.get('/admin/talleres');
  assert.doesNotMatch(listado.texto, /Taller a la papelera/);

  const sitio = await anonimo.get('/talleres');
  assert.doesNotMatch(sitio.texto, /Taller a la papelera/);

  const papelera = await admin.get('/admin/papelera');
  assert.equal(papelera.estado, 200);
  assert.match(papelera.texto, /Taller a la papelera/);

  const fila = await pool.query('SELECT eliminado_en FROM taller WHERE id = $1', [id]);
  assert.ok(fila.rows[0].eliminado_en, 'la fila sigue existiendo, marcada como eliminada');
});

test('restaurar devuelve el taller a los listados', async () => {
  const id = await crearTaller('Taller que vuelve');
  await admin.post(`/admin/talleres/${id}/eliminar`);

  const restaurado = await admin.post(`/admin/papelera/taller/${id}/restaurar`);
  assert.equal(restaurado.estado, 302);

  const listado = await admin.get('/admin/talleres');
  assert.match(listado.texto, /Taller que vuelve/);

  const papelera = await admin.get('/admin/papelera');
  assert.doesNotMatch(papelera.texto, /Taller que vuelve/);
});

test('borrar definitivamente elimina la fila y lo asociado', async () => {
  const id = await crearTaller('Taller que se purga');
  await pool.query(
    `INSERT INTO ejecucion (id_taller, fecha_ejecucion, cantidad_participantes, id_usuario)
     VALUES ($1, '2026-12-02', 12, $2)`,
    [id, idAdmin]
  );
  await admin.post(`/admin/talleres/${id}/eliminar`);

  const purgado = await admin.post(`/admin/papelera/taller/${id}/purgar`);
  assert.equal(purgado.estado, 302);

  const taller = await pool.query('SELECT id FROM taller WHERE id = $1', [id]);
  assert.equal(taller.rows.length, 0);
  const ejecucion = await pool.query('SELECT id FROM ejecucion WHERE id_taller = $1', [id]);
  assert.equal(ejecucion.rows.length, 0, 'la cascada se lleva sus ejecuciones');
});

test('una ejecución se puede eliminar sin tocar el taller', async () => {
  const id = await crearTaller('Taller con ejecución suelta');
  const { rows } = await pool.query(
    `INSERT INTO ejecucion (id_taller, fecha_ejecucion, cantidad_participantes, id_usuario)
     VALUES ($1, '2026-12-03', 20, $2) RETURNING id`,
    [id, idAdmin]
  );

  const borrado = await admin.post(`/admin/ejecuciones/${rows[0].id}/eliminar`);
  assert.equal(borrado.estado, 302);

  const ejecuciones = await pool.query(
    'SELECT id FROM ejecucion WHERE id_taller = $1 AND eliminado_en IS NULL',
    [id]
  );
  assert.equal(ejecuciones.rows.length, 0);

  const taller = await pool.query('SELECT eliminado_en FROM taller WHERE id = $1', [id]);
  assert.equal(taller.rows[0].eliminado_en, null, 'el taller sigue vivo');
});

test('un docente no puede eliminar ni ver la papelera', async () => {
  const id = await crearTaller('Taller protegido');

  const borrado = await docente.post(`/admin/talleres/${id}/eliminar`);
  assert.equal(borrado.estado, 403);

  const papelera = await docente.get('/admin/papelera');
  assert.equal(papelera.estado, 403);

  const fila = await pool.query('SELECT eliminado_en FROM taller WHERE id = $1', [id]);
  assert.equal(fila.rows[0].eliminado_en, null);
});
