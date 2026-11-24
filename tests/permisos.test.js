// RF-02: la propiedad del contenido separa al docente de la administración.
// Un docente documenta sus talleres; no puede editar ni cargar datos en los ajenos.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, entrar, pool } = require('./helpers');

let app;
let docente;
let otra;
let admin;

before(async () => {
  await prepararBase();
  const { hashear } = require('../src/auth');
  await pool.query(
    `INSERT INTO usuario (nombre, usuario, clave_hash, rol)
     VALUES ('Otra docente', 'otra', $1, 'docente')`,
    [await hashear('Otra-2026')]
  );
  app = await levantarApp();

  docente = crearCliente(app.base);
  await entrar(docente, 'docente', 'Docente-2026');

  otra = crearCliente(app.base);
  await entrar(otra, 'otra', 'Otra-2026');

  admin = crearCliente(app.base);
  await entrar(admin, 'admin', 'Admin-2026');
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

const TALLER = {
  nombre: 'Taller de prueba',
  tematica: 'Cocina básica',
  descripcion: 'Una sesión de dos horas.',
  fecha_planificada: '2026-11-20',
  estado: 'planificado',
};

async function crearTaller(cliente, nombre) {
  const respuesta = await cliente.post('/admin/talleres', { ...TALLER, nombre });
  assert.equal(respuesta.estado, 302);
  const coincidencia = /^\/admin\/talleres\/(\d+)/.exec(respuesta.ubicacion || '');
  assert.ok(coincidencia, `ubicación inesperada: ${respuesta.ubicacion}`);
  return Number(coincidencia[1]);
}

test('otra docente no puede abrir el formulario de un taller ajeno', async () => {
  const id = await crearTaller(docente, 'Taller propio para abrir');

  const respuesta = await otra.get(`/admin/talleres/${id}/editar`);

  assert.equal(respuesta.estado, 403);
  assert.match(respuesta.texto, /otra persona/i);
});

test('otra docente no puede guardar cambios en un taller ajeno', async () => {
  const id = await crearTaller(docente, 'Taller propio para guardar');

  const respuesta = await otra.post(`/admin/talleres/${id}`, {
    ...TALLER,
    nombre: 'Nombre secuestrado',
  });

  assert.equal(respuesta.estado, 403);
  const { rows } = await pool.query('SELECT nombre FROM taller WHERE id = $1', [id]);
  assert.equal(rows[0].nombre, 'Taller propio para guardar');
});

test('la dueña edita su propio taller', async () => {
  const id = await crearTaller(docente, 'Taller propio editable');

  const respuesta = await docente.post(`/admin/talleres/${id}`, {
    ...TALLER,
    nombre: 'Taller propio corregido',
  });

  assert.equal(respuesta.estado, 302);
  const { rows } = await pool.query('SELECT nombre FROM taller WHERE id = $1', [id]);
  assert.equal(rows[0].nombre, 'Taller propio corregido');
});

test('la administración edita el taller de cualquiera', async () => {
  const id = await crearTaller(docente, 'Taller ajeno que administra');

  const respuesta = await admin.post(`/admin/talleres/${id}`, {
    ...TALLER,
    nombre: 'Taller revisado por administración',
  });

  assert.equal(respuesta.estado, 302);
  const { rows } = await pool.query('SELECT nombre FROM taller WHERE id = $1', [id]);
  assert.equal(rows[0].nombre, 'Taller revisado por administración');
});

test('no se registra una ejecución en el taller de otra persona', async () => {
  const id = await crearTaller(docente, 'Taller propio sin ejecución ajena');

  const respuesta = await otra.post('/admin/ejecuciones', {
    id_taller: String(id),
    fecha_ejecucion: '2026-11-21',
    cantidad_participantes: '15',
    observaciones: 'Intento ajeno',
  });

  assert.equal(respuesta.estado, 403);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM ejecucion WHERE id_taller = $1', [id]);
  assert.equal(rows[0].total, 0);
});

test('la última administradora no puede dejar de serlo', async () => {
  const { rows } = await pool.query("SELECT id FROM usuario WHERE usuario = 'admin'");

  const respuesta = await admin.post(`/admin/usuarios/${rows[0].id}`, {
    nombre: 'Administración',
    usuario: 'admin',
    rol: 'docente',
    activo: 'on',
  });

  assert.equal(respuesta.estado, 400);
  assert.match(respuesta.texto, /última cuenta administradora/i);

  const despues = await pool.query("SELECT rol FROM usuario WHERE usuario = 'admin'");
  assert.equal(despues.rows[0].rol, 'admin');
});
