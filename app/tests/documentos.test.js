// RF-05 / CU-05: carga, validación y visor privado de documentos PDF.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, entrar, pool } = require('./helpers');

let app;
let usuario;
let idTaller;

before(async () => {
  await prepararBase();
  app = await levantarApp();
  usuario = crearCliente(app.base);
  await entrar(usuario, 'docente', 'Docente-2026');

  const { rows } = await pool.query(
    `INSERT INTO taller (nombre, tematica, id_usuario)
     VALUES ('Taller de documentos', 'Prueba', (SELECT id FROM usuario WHERE usuario = 'docente'))
     RETURNING id`
  );
  idTaller = rows[0].id;
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

async function subirDocumento(cliente, { nombre = 'Ficha de prueba', destino = `taller:${idTaller}`, archivo, nombreArchivo = 'ficha.pdf' } = {}) {
  const formulario = new FormData();
  formulario.set('nombre', nombre);
  formulario.set('destino', destino);
  if (archivo) formulario.set('archivo', new Blob([archivo]), nombreArchivo);

  const respuesta = await fetch(`${app.base}/admin/documentos`, {
    method: 'POST',
    headers: { cookie: cliente.galleta },
    body: formulario,
    redirect: 'manual',
  });
  return { estado: respuesta.status, ubicacion: respuesta.headers.get('location'), texto: await respuesta.text() };
}

test('el listado de documentos exige sesión', async () => {
  const anonimo = crearCliente(app.base);
  const respuesta = await anonimo.get('/admin/documentos');

  assert.equal(respuesta.estado, 302);
  assert.match(respuesta.ubicacion, /^\/login/);
});

test('sube un PDF válido y lo visualiza en línea con sesión', async () => {
  const subida = await subirDocumento(usuario, { archivo: '%PDF-1.7\ncontenido de prueba' });
  assert.equal(subida.estado, 302);
  assert.match(subida.ubicacion, /^\/admin\/documentos\?ok=/);

  const { rows } = await pool.query(
    `SELECT id, nombre, archivo, tipo_mime, tamano, id_taller, contenido
       FROM documento WHERE id_taller = $1`,
    [idTaller]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nombre, 'Ficha de prueba');
  assert.match(rows[0].archivo, /^[0-9a-f-]+\.pdf$/);
  assert.equal(rows[0].tipo_mime, 'application/pdf');
  assert.equal(rows[0].id_taller, idTaller);
  assert.equal(rows[0].contenido.toString(), '%PDF-1.7\ncontenido de prueba');

  const anonimo = crearCliente(app.base);
  const intentoAnonimo = await anonimo.get(`/admin/documentos/${rows[0].id}/ver`);
  assert.equal(intentoAnonimo.estado, 302);
  assert.match(intentoAnonimo.ubicacion, /^\/login/);

  const visor = await fetch(`${app.base}/admin/documentos/${rows[0].id}/ver`, {
    headers: { cookie: usuario.galleta },
  });
  assert.equal(visor.status, 200);
  assert.equal(visor.headers.get('content-type'), 'application/pdf');
  assert.match(visor.headers.get('content-disposition'), /^inline;/);
  assert.equal(Buffer.from(await visor.arrayBuffer()).toString(), '%PDF-1.7\ncontenido de prueba');

  const listado = await usuario.get('/admin/documentos');
  assert.equal(listado.estado, 200);
  assert.match(listado.texto, /Ficha de prueba/);
  assert.match(listado.texto, /Subir documento/);
  assert.match(listado.texto, /10 MB/);
});

test('asocia el documento a una receta sin vincularlo también a un taller', async () => {
  const { rows } = await pool.query(
    `INSERT INTO receta (codigo, nombre, id_usuario)
     VALUES ('REC-DOC', 'Receta con documento', (SELECT id FROM usuario WHERE usuario = 'docente'))
     RETURNING id`
  );
  const idReceta = rows[0].id;
  const subida = await subirDocumento(usuario, {
    nombre: 'Documento de receta',
    destino: `receta:${idReceta}`,
    archivo: '%PDF-1.7\nreceta',
  });

  assert.equal(subida.estado, 302);
  const documento = await pool.query(
    'SELECT id_taller, id_receta FROM documento WHERE nombre = $1',
    ['Documento de receta']
  );
  assert.equal(documento.rows[0].id_taller, null);
  assert.equal(documento.rows[0].id_receta, idReceta);
});

test('rechaza archivos con extensión PDF pero contenido que no es PDF', async () => {
  const { rows: anteriores } = await pool.query('SELECT COUNT(*)::int AS total FROM documento');
  const respuesta = await subirDocumento(usuario, { archivo: 'esto no es un PDF' });

  assert.equal(respuesta.estado, 400);
  assert.match(respuesta.texto, /no corresponde a un PDF válido/);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM documento');
  assert.equal(rows[0].total, anteriores[0].total);
});

test('rechaza archivos que superan 10 MB', async () => {
  const { rows: anteriores } = await pool.query('SELECT COUNT(*)::int AS total FROM documento');
  const contenido = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(10 * 1024 * 1024)]);
  const respuesta = await subirDocumento(usuario, { archivo: contenido });

  assert.equal(respuesta.estado, 400);
  assert.match(respuesta.texto, /máximo de 10 MB/);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM documento');
  assert.equal(rows[0].total, anteriores[0].total);
});
