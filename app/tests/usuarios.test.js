// RF-02: gestión de usuarios y roles (solo administración).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, entrar, pool } = require('./helpers');

let app;
let admin;

const NUEVO = {
  nombre: 'Profesora de Repostería',
  usuario: 'profe.reposteria',
  rol: 'docente',
  clave: 'Reposteria-2026',
  activo: 'on',
};

before(async () => {
  await prepararBase();
  app = await levantarApp();
  admin = crearCliente(app.base);
  await entrar(admin, 'admin', 'Admin-2026');
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

test('un docente no entra a la gestión de usuarios', async () => {
  const docente = crearCliente(app.base);
  await entrar(docente, 'docente', 'Docente-2026');

  const respuesta = await docente.get('/admin/usuarios');
  assert.equal(respuesta.estado, 403);
  assert.match(respuesta.texto, /no tiene permisos/);
});

test('la administración crea una cuenta y esa cuenta puede entrar', async () => {
  const creacion = await admin.post('/admin/usuarios', NUEVO);
  assert.equal(creacion.estado, 302);

  const nueva = crearCliente(app.base);
  const entrada = await entrar(nueva, NUEVO.usuario, NUEVO.clave);
  assert.equal(entrada.estado, 302);
  assert.equal(entrada.ubicacion, '/panel');
});

test('la contraseña nunca se guarda en texto plano', async () => {
  const { rows } = await pool.query('SELECT clave_hash FROM usuario WHERE usuario = $1', [NUEVO.usuario]);

  assert.notEqual(rows[0].clave_hash, NUEVO.clave);
  assert.match(rows[0].clave_hash, /^\$2[aby]\$/);
});

test('no se puede repetir el nombre de usuario', async () => {
  const respuesta = await admin.post('/admin/usuarios', { ...NUEVO, nombre: 'Otra persona' });

  assert.equal(respuesta.estado, 400);
  assert.match(respuesta.texto, /Ya existe un usuario/);
});

test('una contraseña de menos de 8 caracteres se rechaza', async () => {
  const respuesta = await admin.post('/admin/usuarios', {
    ...NUEVO,
    usuario: 'otro.usuario',
    clave: 'corta',
  });

  assert.equal(respuesta.estado, 400);
  assert.match(respuesta.texto, /al menos 8 caracteres/);
});

test('los caracteres raros en el nombre de usuario se rechazan', async () => {
  const respuesta = await admin.post('/admin/usuarios', {
    ...NUEVO,
    usuario: 'con espacio',
    clave: 'Otraclave-2026',
  });

  assert.equal(respuesta.estado, 400);
  assert.match(respuesta.texto, /solo admite letras/);
});

test('la administración no puede desactivar su propia cuenta', async () => {
  const { rows } = await pool.query(`SELECT id FROM usuario WHERE usuario = 'admin'`);
  const respuesta = await admin.post(`/admin/usuarios/${rows[0].id}`, {
    nombre: 'Administración',
    usuario: 'admin',
    rol: 'admin',
    clave: '',
  });

  assert.equal(respuesta.estado, 400);
  assert.match(respuesta.texto, /tu propia cuenta/);

  const { rows: sigue } = await pool.query(`SELECT activo FROM usuario WHERE usuario = 'admin'`);
  assert.equal(sigue[0].activo, true);
});

test('cambiar la contraseña invalida la anterior', async () => {
  const { rows } = await pool.query('SELECT id FROM usuario WHERE usuario = $1', [NUEVO.usuario]);
  const id = rows[0].id;

  const cambio = await admin.post(`/admin/usuarios/${id}`, {
    nombre: NUEVO.nombre,
    usuario: NUEVO.usuario,
    rol: 'docente',
    clave: 'NuevaClave-2026',
    activo: 'on',
  });
  assert.equal(cambio.estado, 302);

  const conVieja = crearCliente(app.base);
  assert.equal((await entrar(conVieja, NUEVO.usuario, NUEVO.clave)).estado, 401);

  const conNueva = crearCliente(app.base);
  assert.equal((await entrar(conNueva, NUEVO.usuario, 'NuevaClave-2026')).estado, 302);
});

test('la auditoría registra quién creó la cuenta', async () => {
  const { rows } = await pool.query(
    `SELECT a.accion, u.usuario
       FROM auditoria a JOIN usuario u ON u.id = a.id_usuario
      WHERE a.entidad = 'usuario' AND a.accion = 'crear'
      ORDER BY a.id DESC LIMIT 1`
  );

  assert.equal(rows[0].accion, 'crear');
  assert.equal(rows[0].usuario, 'admin');
});
