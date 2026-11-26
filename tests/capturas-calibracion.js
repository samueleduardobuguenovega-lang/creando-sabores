// Capturas de calibración: 1440x900 y 390x844 para público, docente y admin.
const { chromium } = require('/opt/data/work/e2e/node_modules/playwright');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://192.168.1.112:8097';
const CHROME = process.env.CHROMIUM_PATH || '/opt/hermes/tools/chromium-1248/chrome-linux64/chrome';
const SALIDA = process.env.OUT_DIR || '/opt/hermes-data/profiles/bot2/cache/scratch/capturas';

const CREDENCIALES = {
  docente: { usuario: 'docente', clave: 'Docente-2026' },
  admin: { usuario: 'admin', clave: 'Admin-2026' },
};

async function entrar(pagina, rol) {
  const datos = CREDENCIALES[rol];
  if (!datos) return;
  await pagina.goto(`${BASE}/login`);
  await pagina.fill('main input[name="usuario"]', datos.usuario);
  await pagina.fill('main input[name="clave"]', datos.clave);
  await pagina.click('main form button[type="submit"]');
  await pagina.waitForLoadState('networkidle');
}

const VISTAS = [
  { nombre: 'inicio', ruta: '/', roles: [null] },
  { nombre: 'talleres-filtros', ruta: '/talleres?tematica=&estado=finalizado&anio=', roles: [null] },
  { nombre: 'videos', ruta: '/videos', roles: [null] },
  { nombre: 'panel-docente', ruta: '/panel', roles: ['docente'] },
  { nombre: 'panel-admin', ruta: '/panel', roles: ['admin'] },
  { nombre: 'admin-talleres', ruta: '/admin/talleres', roles: ['admin'] },
  { nombre: 'admin-taller-detalle', ruta: '/admin/talleres/1', roles: ['admin'] },
  { nombre: 'admin-auditoria', ruta: '/admin/auditoria', roles: ['admin'] },
];

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const navegador = await chromium.launch({ executablePath: CHROME });
  const capturas = [];
  for (const viewport of [{ nombre: 'escritorio', width: 1440, height: 900 }, { nombre: 'movil', width: 390, height: 844 }]) {
    for (const vista of VISTAS) {
      for (const rol of vista.roles) {
        const contexto = await navegador.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 2 });
        const pagina = await contexto.newPage();
        if (rol) await entrar(pagina, rol);
        await pagina.goto(`${BASE}${vista.ruta}`, { waitUntil: 'networkidle' });
        await pagina.waitForTimeout(350);
        const archivo = `${SALIDA}/${vista.nombre}-${rol || 'publico'}-${viewport.nombre}.png`;
        await pagina.screenshot({ path: archivo, fullPage: viewport.nombre === 'movil' });
        capturas.push(archivo);
        await contexto.close();
      }
    }
  }
  await navegador.close();
  console.log(capturas.join('\n'));
  console.log(`\n${capturas.length} capturas en ${SALIDA}`);
})();
