// RF-01 / CU-02: panel principal y sitio público.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, entrar, pool } = require('./helpers');

let app;
let cliente;

before(async () => {
  await prepararBase();
  app = await levantarApp();
  cliente = crearCliente(app.base);
  await entrar(cliente, 'admin', 'Admin-2026');
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

test('el panel parte en cero', async () => {
  const respuesta = await cliente.get('/panel');

  assert.equal(respuesta.estado, 200);
  assert.match(respuesta.texto, /Talleres registrados/);
  assert.match(respuesta.texto, /Todavía no hay ejecuciones registradas/);
});

test('el panel cuenta talleres por estado', async () => {
  const { rows: usuario } = await pool.query(`SELECT id FROM usuario WHERE usuario = 'admin'`);

  await pool.query(
    `INSERT INTO taller (nombre, tematica, estado, fecha_planificada, id_usuario) VALUES
      ('Uno planificado', 'Panadería', 'planificado', '2026-11-20', $1),
      ('Dos en ejecución', 'Conservas', 'en_ejecucion', '2026-11-27', $1),
      ('Tres finalizado', 'Repostería', 'finalizado', '2026-10-30', $1)`,
    [usuario[0].id]
  );

  const respuesta = await cliente.get('/panel');

  assert.equal(respuesta.estado, 200);
  // Los contadores se leen como "número + etiqueta" en el HTML.
  assert.match(respuesta.texto, /1<\/span>\s*<span class="indicador-texto">Planificados/);
  assert.match(respuesta.texto, /1<\/span>\s*<span class="indicador-texto">En ejecución/);
  assert.match(respuesta.texto, /1<\/span>\s*<span class="indicador-texto">Finalizados/);
});

test('el panel muestra los últimos talleres ejecutados', async () => {
  const { rows: taller } = await pool.query(`SELECT id FROM taller WHERE nombre = 'Tres finalizado'`);
  const { rows: usuario } = await pool.query(`SELECT id FROM usuario WHERE usuario = 'docente'`);

  await pool.query(
    `INSERT INTO ejecucion (fecha_ejecucion, id_taller, cantidad_participantes, observaciones, id_usuario)
     VALUES ('2026-10-30', $1, 14, 'Se alcanzó a etiquetar todo.', $2)`,
    [taller[0].id, usuario[0].id]
  );

  const respuesta = await cliente.get('/panel');

  assert.equal(respuesta.estado, 200);
  assert.match(respuesta.texto, /Tres finalizado/);
  assert.match(respuesta.texto, /14/);
});

test('el sitio público se ve sin sesión y no muestra datos personales', async () => {
  const anonimo = crearCliente(app.base);
  const inicio = await anonimo.get('/');

  assert.equal(inicio.estado, 200);
  assert.match(inicio.texto, /Creando Sabores/);
  assert.match(inicio.texto, /clases registradas/);
  assert.match(inicio.texto, /recetas/);

  const talleres = await anonimo.get('/talleres');
  assert.equal(talleres.estado, 200);
  assert.match(talleres.texto, /Uno planificado/);
  assert.doesNotMatch(talleres.texto, /Docente de prueba/);

  const ejecuciones = await anonimo.get('/ejecuciones');
  assert.equal(ejecuciones.estado, 200);
  assert.match(ejecuciones.texto, /Se alcanzó a etiquetar todo/);
});

test('el listado público filtra por año', async () => {
  const anonimo = crearCliente(app.base);
  const conFecha = await anonimo.get('/talleres?anio=2026');
  const sinFecha = await anonimo.get('/talleres?anio=2024');

  assert.equal(conFecha.estado, 200);
  assert.match(conFecha.texto, /Uno planificado/);

  assert.equal(sinFecha.estado, 200);
  assert.doesNotMatch(sinFecha.texto, /Uno planificado/);
});

test('una dirección desconocida responde 404 con la página del sitio', async () => {
  const respuesta = await cliente.get('/no-existe');

  assert.equal(respuesta.estado, 404);
  assert.match(respuesta.texto, /no existe en la plataforma/);
});
