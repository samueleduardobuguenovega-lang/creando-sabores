// RF-08: cada persona puede rotar su propia clave sin depender de la administración.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, entrar, pool } = require('./helpers');

let app;
let cliente;

before(async () => {
  await prepararBase();
  app = await levantarApp();
  cliente = crearCliente(app.base);
  await entrar(cliente, 'docente', 'Docente-2026');
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

test('rechaza el cambio si la clave actual no coincide', async () => {
  const respuesta = await cliente.post('/mi-clave', {
    actual: 'NoEsLaClave',
    nueva: 'Clave-Nueva-1',
    repetir: 'Clave-Nueva-1',
  });

  assert.equal(respuesta.estado, 400);
  assert.match(respuesta.texto, /clave actual no coincide/i);
});

test('exige una clave nueva de al menos 8 caracteres', async () => {
  const respuesta = await cliente.post('/mi-clave', {
    actual: 'Docente-2026',
    nueva: 'corta',
    repetir: 'corta',
  });

  assert.equal(respuesta.estado, 400);
  assert.match(respuesta.texto, /al menos 8 caracteres/i);
});

test('cambia la clave y la nueva sirve para entrar', async () => {
  const cambio = await cliente.post('/mi-clave', {
    actual: 'Docente-2026',
    nueva: 'Docente-2027',
    repetir: 'Docente-2027',
  });
  assert.equal(cambio.estado, 302);

  const conLaVieja = crearCliente(app.base);
  const vieja = await conLaVieja.post('/login', { usuario: 'docente', clave: 'Docente-2026' });
  assert.equal(vieja.estado, 401);

  const conLaNueva = crearCliente(app.base);
  const nueva = await conLaNueva.post('/login', { usuario: 'docente', clave: 'Docente-2027' });
  assert.equal(nueva.estado, 302);

  const { rows } = await pool.query(
    `SELECT accion FROM auditoria WHERE accion = 'cambiar_clave' ORDER BY id DESC LIMIT 1`
  );
  assert.equal(rows.length, 1, 'el cambio queda auditado');
});
