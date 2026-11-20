// Los módulos pendientes están anunciados dentro de la app, no rotos.
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

const PENDIENTES = [
  ['/admin/documentos', 'Goran Almendra', 'T7'],
  ['/admin/videos', 'Goran Almendra', 'T8'],
  ['/admin/ejecuciones', 'Francisco Puelles', 'T6'],
];

for (const [ruta, responsable, tarea] of PENDIENTES) {
  test(`${ruta} avisa quién lo está construyendo`, async () => {
    const respuesta = await cliente.get(ruta);

    assert.equal(respuesta.estado, 200);
    assert.match(respuesta.texto, /Módulo en construcción/);
    assert.ok(respuesta.texto.includes(responsable));
    assert.ok(respuesta.texto.includes(tarea));
  });
}

test('las páginas de módulos pendientes también exigen sesión', async () => {
  const anonimo = crearCliente(app.base);
  const respuesta = await anonimo.get('/admin/documentos');

  assert.equal(respuesta.estado, 302);
  assert.match(respuesta.ubicacion, /^\/login/);
});

test('el público consulta recetas sin iniciar sesión', async () => {
  const anonimo = crearCliente(app.base);
  const respuesta = await anonimo.get('/recetas');

  assert.equal(respuesta.estado, 200);
  assert.match(respuesta.texto, /Recetas/);
  assert.doesNotMatch(respuesta.texto, /Módulo en construcción/);
});
