// RF-07: el sitio público muestra solo lo que la administración publica.
// El docente documenta en el archivo interno; nada suyo se asoma sin permiso.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, entrar, pool } = require('./helpers');

let app;
let docente;
let admin;
let anonimo;

before(async () => {
  await prepararBase();
  app = await levantarApp();

  docente = crearCliente(app.base);
  await entrar(docente, 'docente', 'Docente-2026');

  admin = crearCliente(app.base);
  await entrar(admin, 'admin', 'Admin-2026');

  anonimo = crearCliente(app.base);
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

const TALLER = {
  nombre: 'Conservas de otoño',
  tematica: 'Conservas',
  descripcion: 'Mermeladas y encurtidos.',
  fecha_planificada: '2026-11-25',
  estado: 'planificado',
};

async function crear(cliente, nombre) {
  const respuesta = await cliente.post('/admin/talleres', { ...TALLER, nombre });
  assert.equal(respuesta.estado, 302);
  return Number(/^\/admin\/talleres\/(\d+)/.exec(respuesta.ubicacion)[1]);
}

test('un taller creado por un docente nace sin publicar', async () => {
  const id = await crear(docente, 'Borrador de conservas');

  const fila = await pool.query('SELECT publicado FROM taller WHERE id = $1', [id]);
  assert.equal(fila.rows[0].publicado, false);

  const listado = await anonimo.get('/talleres');
  assert.equal(listado.estado, 200);
  assert.doesNotMatch(listado.texto, /Borrador de conservas/);

  const ficha = await anonimo.get(`/talleres/${id}`);
  assert.equal(ficha.estado, 404);
});

test('la administración publica el taller y aparece en el sitio', async () => {
  const id = await crear(docente, 'Taller por publicar');

  const publicacion = await admin.post(`/admin/talleres/${id}/publicacion`, { publicar: '1' });
  assert.equal(publicacion.estado, 302);

  const listado = await anonimo.get('/talleres');
  assert.match(listado.texto, /Taller por publicar/);

  const ficha = await anonimo.get(`/talleres/${id}`);
  assert.equal(ficha.estado, 200);
});

test('ocultar un taller lo saca del sitio sin borrarlo', async () => {
  const id = await crear(docente, 'Taller que se oculta');
  await admin.post(`/admin/talleres/${id}/publicacion`, { publicar: '1' });

  const ocultar = await admin.post(`/admin/talleres/${id}/publicacion`, { publicar: '0' });
  assert.equal(ocultar.estado, 302);

  const listado = await anonimo.get('/talleres');
  assert.doesNotMatch(listado.texto, /Taller que se oculta/);

  const fila = await pool.query('SELECT publicado FROM taller WHERE id = $1', [id]);
  assert.equal(fila.rows[0].publicado, false);
  assert.ok(fila.rows[0] !== undefined, 'el taller sigue existiendo en el archivo');
});

test('un docente no puede publicar su propio taller', async () => {
  const id = await crear(docente, 'Taller que quiere publicar');

  const respuesta = await docente.post(`/admin/talleres/${id}/publicacion`, { publicar: '1' });

  assert.equal(respuesta.estado, 403);
  const fila = await pool.query('SELECT publicado FROM taller WHERE id = $1', [id]);
  assert.equal(fila.rows[0].publicado, false);
});

test('un taller creado por la administración nace publicado', async () => {
  const id = await crear(admin, 'Taller de la administración');

  const fila = await pool.query('SELECT publicado FROM taller WHERE id = $1', [id]);
  assert.equal(fila.rows[0].publicado, true);

  const listado = await anonimo.get('/talleres');
  assert.match(listado.texto, /Taller de la administración/);
});
