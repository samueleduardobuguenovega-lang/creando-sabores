// Despliegue: la cookie de sesión solo puede viajar por HTTP cuando la
// instalación lo permite. En producción Express marca la cookie "secure" y,
// servida por HTTP (una demo en la red local sin TLS), el navegador no la
// devuelve: el login acepta la clave y la sesión no persiste. COOKIE_SEGURA
// permite apagar ese requisito de forma explícita, sin tocar NODE_ENV.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, entrar, pool } = require('./helpers');

const entornoOriginal = {
  NODE_ENV: process.env.NODE_ENV,
  COOKIE_SEGURA: process.env.COOKIE_SEGURA,
};

before(async () => {
  await prepararBase();
});

after(async () => {
  process.env.NODE_ENV = entornoOriginal.NODE_ENV;
  process.env.COOKIE_SEGURA = entornoOriginal.COOKIE_SEGURA;
  await pool.end();
});

// Hace el login como un navegador y devuelve las cabeceras Set-Cookie tal como
// llegan (una por línea). `protocolo` permite simular el proxy HTTPS.
async function cookiesDelLogin(base, protocolo) {
  const cabeceras = { 'content-type': 'application/x-www-form-urlencoded' };
  if (protocolo) cabeceras['x-forwarded-proto'] = protocolo;

  const respuesta = await fetch(base + '/login', {
    method: 'POST',
    redirect: 'manual',
    headers: cabeceras,
    body: new URLSearchParams({ usuario: 'admin', clave: 'Admin-2026' }).toString(),
  });

  assert.equal(respuesta.status, 302);
  const lineas = respuesta.headers.getSetCookie ? respuesta.headers.getSetCookie() : [];
  return lineas.join('\n');
}

test('en producción detrás de HTTPS la cookie de sesión es secure', async () => {
  process.env.NODE_ENV = 'production';
  process.env.COOKIE_SEGURA = '1';
  const app = await levantarApp();

  try {
    const cookies = await cookiesDelLogin(app.base, 'https');
    assert.match(cookies, /connect\.sid/);
    assert.match(cookies, /;\s*Secure/i);
  } finally {
    await app.cerrar();
  }
});

test('en producción con COOKIE_SEGURA=1 servido por HTTP no se emite sesión: ese es el síntoma que se corrige', async () => {
  process.env.NODE_ENV = 'production';
  process.env.COOKIE_SEGURA = '1';
  const app = await levantarApp();

  try {
    const cookies = await cookiesDelLogin(app.base);
    assert.equal(cookies, '', 'sin HTTPS el navegador no recibiría ninguna cookie de sesión');
  } finally {
    await app.cerrar();
  }
});

test('en producción con COOKIE_SEGURA=0 la demo por HTTP entrega la cookie y el login persiste', async () => {
  process.env.NODE_ENV = 'production';
  process.env.COOKIE_SEGURA = '0';
  const app = await levantarApp();

  try {
    const cookies = await cookiesDelLogin(app.base);
    assert.match(cookies, /connect\.sid/);
    assert.doesNotMatch(cookies, /;\s*Secure/i);

    const cliente = crearCliente(app.base);
    const entrada = await entrar(cliente, 'admin', 'Admin-2026');
    assert.equal(entrada.estado, 302);
    const panel = await cliente.get('/panel');
    assert.equal(panel.estado, 200);
  } finally {
    await app.cerrar();
  }
});

test('sin COOKIE_SEGURA, fuera de producción la cookie sigue sin exigir HTTPS', async () => {
  process.env.NODE_ENV = 'development';
  delete process.env.COOKIE_SEGURA;
  const app = await levantarApp();

  try {
    const cookies = await cookiesDelLogin(app.base);
    assert.match(cookies, /connect\.sid/);
    assert.doesNotMatch(cookies, /;\s*Secure/i);
  } finally {
    await app.cerrar();
  }
});
