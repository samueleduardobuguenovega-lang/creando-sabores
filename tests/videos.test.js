// T8: registro, validación y asociación de enlaces de video.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, entrar, pool } = require('./helpers');

let app;
let docente;
let idTaller;

before(async () => {
  await prepararBase();
  app = await levantarApp();
  docente = crearCliente(app.base);
  await entrar(docente, 'docente', 'Docente-2026');

  const { rows } = await pool.query(
    `INSERT INTO taller (nombre, tematica, id_usuario)
     VALUES ('Taller de videos', 'Prueba', (SELECT id FROM usuario WHERE usuario = 'docente'))
     RETURNING id`
  );
  idTaller = rows[0].id;
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

test('el apartado de videos exige sesión y muestra el formulario', async () => {
  const anonimo = crearCliente(app.base);
  const protegido = await anonimo.get('/admin/videos');
  assert.equal(protegido.estado, 302);
  assert.match(protegido.ubicacion, /^\/login/);

  const respuesta = await docente.get('/admin/videos');
  assert.equal(respuesta.estado, 200);
  assert.match(respuesta.texto, /Registrar video/);
  assert.match(respuesta.texto, /Enlace de YouTube/);
});

test('registra enlaces de YouTube asociados a un taller', async () => {
  for (const [nombre, enlace, proveedor] of [
    ['Video YouTube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['Video YouTube corto', 'https://youtu.be/dQw4w9WgXcQ', 'youtube'],
  ]) {
    const respuesta = await docente.post('/admin/videos', {
      nombre,
      descripcion: 'Descripción de prueba',
      enlace,
      destino: `taller:${idTaller}`,
    });
    assert.equal(respuesta.estado, 302);

    const { rows } = await pool.query(
      'SELECT nombre, descripcion, enlace, proveedor, id_taller, id_receta FROM video WHERE nombre = $1',
      [nombre]
    );
    assert.equal(rows[0].enlace, enlace);
    assert.equal(rows[0].proveedor, proveedor);
    assert.equal(rows[0].descripcion, 'Descripción de prueba');
    assert.equal(rows[0].id_taller, idTaller);
    assert.equal(rows[0].id_receta, null);
  }
});

test('rechaza proveedores no admitidos y enlaces sin identificador válido', async () => {
  for (const enlace of [
    'https://example.com/video',
    'https://vimeo.com/123456789',
    'https://youtube.com/watch?v=no-valido',
  ]) {
    const respuesta = await docente.post('/admin/videos', {
      nombre: 'Video inválido',
      descripcion: '',
      enlace,
      destino: `taller:${idTaller}`,
    });
    assert.equal(respuesta.estado, 400);
    assert.match(respuesta.texto, /YouTube|identificador de video válido/);
  }

  const { rows } = await pool.query("SELECT COUNT(*)::int AS total FROM video WHERE nombre = 'Video inválido'");
  assert.equal(rows[0].total, 0);
});

test('asocia un video a una receta sin asociarlo también a un taller', async () => {
  const { rows: recetas } = await pool.query(
    `INSERT INTO receta (codigo, nombre, id_usuario)
     VALUES ('REC-VIDEO', 'Receta con video', (SELECT id FROM usuario WHERE usuario = 'docente'))
     RETURNING id`
  );
  const respuesta = await docente.post('/admin/videos', {
    nombre: 'Video de receta',
    descripcion: '',
    enlace: 'https://youtu.be/dQw4w9WgXcQ',
    destino: `receta:${recetas[0].id}`,
  });
  assert.equal(respuesta.estado, 302);

  const { rows } = await pool.query(
    "SELECT id_taller, id_receta FROM video WHERE nombre = 'Video de receta'"
  );
  assert.equal(rows[0].id_taller, null);
  assert.equal(rows[0].id_receta, recetas[0].id);

  const listado = await docente.get('/admin/videos');
  assert.match(listado.texto, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
});

test('el detalle del taller muestra el reproductor embebido', async () => {
  const respuesta = await docente.get(`/admin/talleres/${idTaller}`);

  assert.equal(respuesta.estado, 200);
  assert.match(respuesta.texto, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.match(respuesta.texto, /iframe/);
});
