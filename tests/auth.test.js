// CU-01: iniciar sesión y autenticar usuario.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, entrar, pool } = require('./helpers');

let app;

before(async () => {
  await prepararBase();
  app = await levantarApp();
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

test('el login rechaza una contraseña incorrecta', async () => {
  const cliente = crearCliente(app.base);
  const respuesta = await entrar(cliente, 'admin', 'clave-que-no-es');

  assert.equal(respuesta.estado, 401);
  assert.match(respuesta.texto, /no coinciden/);
});

test('el login no revela si el usuario existe', async () => {
  const cliente = crearCliente(app.base);
  const respuesta = await entrar(cliente, 'nadie-existe', 'loquesea');

  assert.equal(respuesta.estado, 401);
  assert.match(respuesta.texto, /no coinciden/);
});

test('con credenciales correctas entra al panel', async () => {
  const cliente = crearCliente(app.base);
  const entrada = await entrar(cliente, 'admin', 'Admin-2026');

  assert.equal(entrada.estado, 302);
  assert.equal(entrada.ubicacion, '/panel');

  const panel = await cliente.get('/panel');
  assert.equal(panel.estado, 200);
  assert.match(panel.texto, /Panel principal/);
});

test('sin sesión, el panel manda al login recordando el destino', async () => {
  const cliente = crearCliente(app.base);
  const respuesta = await cliente.get('/panel');

  assert.equal(respuesta.estado, 302);
  assert.equal(respuesta.ubicacion, '/login?volver=%2Fpanel');
});

test('una cuenta desactivada no puede entrar', async () => {
  await pool.query(`UPDATE usuario SET activo = FALSE WHERE usuario = 'docente'`);
  const cliente = crearCliente(app.base);
  const respuesta = await entrar(cliente, 'docente', 'Docente-2026');

  assert.equal(respuesta.estado, 403);
  assert.match(respuesta.texto, /desactivada/);

  await pool.query(`UPDATE usuario SET activo = TRUE WHERE usuario = 'docente'`);
});

test('al salir, el panel vuelve a pedir sesión', async () => {
  const cliente = crearCliente(app.base);
  await entrar(cliente, 'admin', 'Admin-2026');

  const salida = await cliente.post('/salir');
  assert.equal(salida.estado, 302);

  const panel = await cliente.get('/panel');
  assert.equal(panel.estado, 302);
  assert.match(panel.ubicacion, /^\/login/);
});

test('el destino "volver" solo acepta rutas internas', async () => {
  const cliente = crearCliente(app.base);
  const respuesta = await cliente.post('/login', {
    usuario: 'admin',
    clave: 'Admin-2026',
    volver: '//sitio-ajeno.example',
  });

  assert.equal(respuesta.estado, 302);
  assert.equal(respuesta.ubicacion, '/panel');
});
