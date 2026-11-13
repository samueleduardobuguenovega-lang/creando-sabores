// Utilidades para las pruebas de integración: base limpia, app en un puerto
// libre y un cliente que mantiene la cookie de sesión como un navegador.
const fs = require('fs');
const path = require('path');
const { once } = require('events');
const { pool } = require('../src/db');

const RUTA_ESQUEMA = path.join(__dirname, '..', 'src', 'schema.sql');

async function prepararBase() {
  // Se parte de cero en cada archivo de pruebas: esquema limpio y cuentas fijas.
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.query(fs.readFileSync(RUTA_ESQUEMA, 'utf8'));

  const { hashear } = require('../src/auth');
  const admin = await hashear('Admin-2026');
  const docente = await hashear('Docente-2026');

  await pool.query(
    `INSERT INTO usuario (nombre, usuario, clave_hash, rol)
     VALUES ('Administración', 'admin', $1, 'admin'),
            ('Docente de prueba', 'docente', $2, 'docente')`,
    [admin, docente]
  );
}

async function levantarApp() {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'secreto-de-pruebas';
  const { crearApp } = require('../src/app');
  const servidor = crearApp().listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const base = `http://127.0.0.1:${servidor.address().port}`;
  return {
    base,
    cerrar: async () => {
      await new Promise((ok) => servidor.close(ok));
    },
  };
}

function crearCliente(base) {
  let galleta = '';

  async function pedir(metodo, ruta, datos) {
    const opciones = { method: metodo, redirect: 'manual', headers: {} };
    if (galleta) opciones.headers.cookie = galleta;
    if (datos) {
      opciones.headers['content-type'] = 'application/x-www-form-urlencoded';
      opciones.body = new URLSearchParams(datos).toString();
    }

    const respuesta = await fetch(base + ruta, opciones);
    const nuevas = respuesta.headers.getSetCookie ? respuesta.headers.getSetCookie() : [];
    for (const linea of nuevas) galleta = linea.split(';')[0];

    return {
      estado: respuesta.status,
      ubicacion: respuesta.headers.get('location'),
      tipo: respuesta.headers.get('content-type') || '',
      texto: await respuesta.text(),
    };
  }

  return {
    get: (ruta) => pedir('GET', ruta),
    post: (ruta, datos) => pedir('POST', ruta, datos || {}),
    get galleta() {
      return galleta;
    },
  };
}

async function entrar(cliente, usuario, clave) {
  return cliente.post('/login', { usuario, clave });
}

module.exports = { prepararBase, levantarApp, crearCliente, entrar, pool };
