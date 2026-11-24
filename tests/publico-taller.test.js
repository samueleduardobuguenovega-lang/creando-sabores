// Sitio público: cualquier visitante abre la ficha de un taller y sus adjuntos.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, pool } = require('./helpers');

let app;
let anonimo;
let tallerId;
let documentoId;
let recetaId;
let documentoRecetaId;

before(async () => {
  await prepararBase();
  app = await levantarApp();
  anonimo = crearCliente(app.base);

  const { rows: usuarios } = await pool.query("SELECT id FROM usuario WHERE usuario = 'docente'");
  const idUsuario = usuarios[0].id;

  const { rows: taller } = await pool.query(
    `INSERT INTO taller (nombre, tematica, descripcion, fecha_planificada, estado, id_usuario)
     VALUES ('Taller de conservas', 'Conservas', 'Mermeladas y encurtidos.', '2026-10-15', 'finalizado', $1)
     RETURNING id`,
    [idUsuario]
  );
  tallerId = taller[0].id;

  const { rows: receta } = await pool.query(
    `INSERT INTO receta (codigo, nombre, descripcion, id_usuario)
     VALUES ('REC-900', 'Mermelada de ciruela', 'Receta base del taller.', $1)
     RETURNING id`,
    [idUsuario]
  );
  await pool.query('INSERT INTO receta_taller (id_receta, id_taller) VALUES ($1, $2)', [receta[0].id, tallerId]);
  recetaId = receta[0].id;

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'latin1');
  const { rows: documento } = await pool.query(
    `INSERT INTO documento (nombre, archivo, tipo_mime, tamano, contenido, id_taller, id_usuario)
     VALUES ('Pauta del taller', 'pauta.pdf', 'application/pdf', $1, $2, $3, $4)
     RETURNING id`,
    [pdf.length, pdf, tallerId, idUsuario]
  );
  documentoId = documento[0].id;

  const { rows: documentoReceta } = await pool.query(
    `INSERT INTO documento (nombre, archivo, tipo_mime, tamano, contenido, id_receta, id_usuario)
     VALUES ('Ficha de la receta', 'ficha-receta.pdf', 'application/pdf', $1, $2, $3, $4)
     RETURNING id`,
    [pdf.length, pdf, recetaId, idUsuario]
  );
  documentoRecetaId = documentoReceta[0].id;

  await pool.query(
    `INSERT INTO video (nombre, descripcion, enlace, proveedor, id_taller, id_usuario)
     VALUES ('Cierre del taller', 'Resumen en video.', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', $1, $2)`,
    [tallerId, idUsuario]
  );

  await pool.query(
    `INSERT INTO ejecucion (fecha_ejecucion, id_taller, cantidad_participantes, observaciones, id_usuario)
     VALUES ('2026-10-15', $1, 18, 'Grupo completo.', $2)`,
    [tallerId, idUsuario]
  );
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

test('un visitante sin cuenta abre la ficha de un taller', async () => {
  const respuesta = await anonimo.get(`/talleres/${tallerId}`);

  assert.equal(respuesta.estado, 200);
  assert.match(respuesta.texto, /Taller de conservas/);
  assert.match(respuesta.texto, /Conservas/);
  assert.match(respuesta.texto, /Mermelada de ciruela/);
  assert.match(respuesta.texto, /Pauta del taller/);
  assert.match(respuesta.texto, /Cierre del taller/);
  assert.match(respuesta.texto, /18/);
});

test('la ficha enlaza el PDF y el reproductor del video', async () => {
  const respuesta = await anonimo.get(`/talleres/${tallerId}`);

  assert.match(respuesta.texto, new RegExp(`/documentos/${documentoId}/ver`));
  assert.match(respuesta.texto, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
});

test('el listado público enlaza cada ficha a su taller', async () => {
  const respuesta = await anonimo.get('/talleres');

  assert.equal(respuesta.estado, 200);
  assert.match(respuesta.texto, new RegExp(`href="/talleres/${tallerId}"`));
});

test('un taller inexistente responde 404', async () => {
  const respuesta = await anonimo.get('/talleres/999999');

  assert.equal(respuesta.estado, 404);
});

test('el PDF del taller se sirve al visitante sin cuenta', async () => {
  const respuesta = await anonimo.get(`/documentos/${documentoId}/ver`);

  assert.equal(respuesta.estado, 200);
  assert.match(respuesta.tipo, /application\/pdf/);
});

test('la ficha pública de una receta muestra quién la subió y su PDF', async () => {
  const respuesta = await anonimo.get(`/recetas/${recetaId}`);

  assert.equal(respuesta.estado, 200);
  assert.match(respuesta.texto, /Mermelada de ciruela/);
  assert.match(respuesta.texto, /Docente de prueba/);
  assert.match(respuesta.texto, /Ficha de la receta/);
  assert.match(respuesta.texto, new RegExp(`/documentos/${documentoRecetaId}/ver`));
});
