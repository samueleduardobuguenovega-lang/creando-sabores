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

// Ya no quedan módulos anunciados como pendientes: ejecuciones se entregó y estas
// pruebas dejaron de tener sujeto. Se conserva la comprobación de que la página
// existe de verdad, para que nadie la vuelva a poner en construcción sin notarlo.
test('/admin/ejecuciones es un módulo real, no un aviso de construcción', async () => {
  const respuesta = await cliente.get('/admin/ejecuciones');

  assert.equal(respuesta.estado, 200);
  assert.doesNotMatch(respuesta.texto, /Módulo en construcción/);
  assert.match(respuesta.texto, /<form/);
});

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
