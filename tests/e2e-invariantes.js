// Calibración automatizada de invariantes UX/QA en navegador real.
//
// Uso:
//   BASE_URL=http://192.168.1.112:8097 CHROMIUM_PATH=/ruta/chrome node tests/e2e-invariantes.js
//
// Recorre todas las rutas por rol (público, docente, admin) en escritorio
// (1440×900) y móvil (390×844) y mide los 12 invariantes de la skill
// calibracion-ux-qa. Sale con código 1 si hay cualquier fallo.
//
// La base debe estar sembrada con `node tests/sembrar-e2e.js`: los nombres
// «TALLER OCULTO E2E», «TALLER PAPELERA E2E», «RECETA PAPELERA E2E»,
// «DOC OCULTO E2E», «DOC PAPELERA E2E» y «VIDEO PAPELERA E2E» existen ahí a
// propósito para comprobar privacidad.
const path = require('path');

function cargarPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require(path.join(process.env.PLAYWRIGHT_MODULES || '/opt/data/work/e2e/node_modules', 'playwright'));
  }
}

const { chromium } = cargarPlaywright();

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const CHROMIUM = process.env.CHROMIUM_PATH || undefined;
const VIEWPORTS = [
  { nombre: 'escritorio', width: 1440, height: 900 },
  { nombre: 'movil', width: 390, height: 844 },
];

const RUTAS_PUBLICAS = [
  '/',
  '/talleres',
  '/talleres?tematica=Conservas&estado=finalizado&anio=2026',
  '/talleres/1',
  '/recetas',
  '/recetas/1',
  '/videos',
  '/documentos',
  '/ejecuciones',
  '/buscar?q=pan',
];

const RUTAS_DOCENTE = [
  '/panel',
  '/admin/talleres',
  '/admin/talleres/1',
  '/admin/recetas',
  '/admin/documentos',
  '/admin/videos',
  '/admin/ejecuciones',
  '/mi-clave',
];

const RUTAS_ADMIN = [...RUTAS_DOCENTE, '/admin/usuarios', '/admin/auditoria', '/admin/papelera'];

const CUENTAS = {
  docente: { usuario: 'docente', clave: 'Docente-2026' },
  admin: { usuario: 'admin', clave: 'Admin-2026' },
};

const PROHIBIDOS_EN_PUBLICO = [
  'TALLER OCULTO E2E',
  'TALLER PAPELERA E2E',
  'RECETA SOLO OCULTA E2E',
  'RECETA PAPELERA E2E',
  'DOC OCULTO E2E',
  'DOC PAPELERA E2E',
  'DOC SUELTO PAPELERA E2E',
  'VIDEO OCULTO E2E',
  'VIDEO PAPELERA E2E',
];

const fallos = [];
// Avisos de terceros (embeds de video) que no dependen de la aplicación.
const avisos = [];
function fallo(categoria, ruta, detalle) {
  fallos.push({ categoria, ruta, detalle });
}

// ---------------------------------------------------------------- medición DOM

// Se inyecta en la página: devuelve todas las mediciones de una vista.
function medirPagina() {
  const ancho = document.documentElement.clientWidth;
  const visible = (el) => {
    if (!el || !el.getClientRects().length) return false;
    const estilo = getComputedStyle(el);
    if (estilo.visibility === 'hidden' || estilo.display === 'none' || Number(estilo.opacity) === 0) return false;
    return true;
  };

  const rgb = (texto) => {
    const partes = (texto.match(/[\d.]+/g) || []).map(Number);
    while (partes.length < 4) partes.push(partes.length === 3 ? 1 : 0);
    return partes;
  };

  const compuesto = (color) => {
    // color ya viene compuesto sobre blanco cuando el fondo era transparente.
    return color;
  };

  const luminancia = ([r, g, b]) => {
    const canal = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  };

  const razon = (a, b) => {
    const la = luminancia(a);
    const lb = luminancia(b);
    const claro = Math.max(la, lb);
    const oscuro = Math.min(la, lb);
    return (claro + 0.05) / (oscuro + 0.05);
  };

  const fondoDe = (el) => {
    let actual = el;
    const capas = [];
    while (actual && actual !== document.documentElement) {
      const estilo = getComputedStyle(actual);
      const c = rgb(estilo.backgroundColor);
      if (c[3] > 0) capas.push(c);
      if (c[3] >= 0.999) break;
      actual = actual.parentElement;
    }
    // Se compone de la capa más externa a la más interna sobre blanco.
    let base = [255, 255, 255];
    for (let i = capas.length - 1; i >= 0; i -= 1) {
      const [r, g, b, a] = capas[i];
      base = [
        Math.round(r * a + base[0] * (1 - a)),
        Math.round(g * a + base[1] * (1 - a)),
        Math.round(b * a + base[2] * (1 - a)),
      ];
    }
    return base;
  };

  const colorTexto = (el) => {
    const c = rgb(getComputedStyle(el).color);
    const fondo = fondoDe(el);
    // Texto traslúcido: se compone sobre el fondo real.
    if (c[3] < 0.999) {
      return [
        Math.round(c[0] * c[3] + fondo[0] * (1 - c[3])),
        Math.round(c[1] * c[3] + fondo[1] * (1 - c[3])),
        Math.round(c[2] * c[3] + fondo[2] * (1 - c[3])),
      ];
    }
    return [c[0], c[1], c[2]];
  };

  const textoPropio = (el) => {
    let texto = '';
    el.childNodes.forEach((nodo) => {
      if (nodo.nodeType === 3) texto += nodo.nodeValue.trim();
    });
    return texto;
  };

  const desborde = document.documentElement.scrollWidth - ancho;

  const cabecera = document.querySelector('header');
  const altoCabecera = cabecera && visible(cabecera) ? Math.round(cabecera.getBoundingClientRect().height) : 0;

  const buscadores = document.querySelectorAll('form[role="search"]').length;
  const enlacesInicio = Array.from(document.querySelectorAll('a[href="/"]')).filter(
    (a) => visible(a) && a.textContent.trim().toLowerCase() === 'inicio'
  ).length;

  const imagenesRojas = Array.from(document.querySelectorAll('img')).filter(
    (img) => !img.complete || img.naturalWidth === 0 || !img.hasAttribute('alt')
  ).length;

  const SELECTOR_TEXTO =
    'p, li, td, th, label, .ayuda, .rotulo, .chip, button, .boton, .enlace-suave, .migas a, a, span, small, strong, em, figcaption';
  const contraste = [];
  const vistos = new Set();
  let revisados = 0;
  for (const el of document.querySelectorAll(SELECTOR_TEXTO)) {
    if (revisados > 400) break;
    if (!visible(el) || el.closest('.visualmente-oculto, .salto-contenido')) continue;
    const texto = textoPropio(el);
    if (!texto || texto.length < 2) continue;
    if (vistos.has(el)) continue;
    vistos.add(el);
    revisados += 1;
    const estilo = getComputedStyle(el);
    const tamano = Number.parseFloat(estilo.fontSize);
    const peso = Number(estilo.fontWeight) || 400;
    const grande = tamano >= 24 || (tamano >= 18.66 && peso >= 700);
    const minimo = grande ? 3 : 4.5;
    const proporcion = razon(colorTexto(el), fondoDe(el));
    if (proporcion + 0.05 < minimo) {
      contraste.push({
        texto: texto.slice(0, 48),
        selector: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
        proporcion: Number(proporcion.toFixed(2)),
        minimo,
      });
    }
  }

  // Bordes de controles (WCAG 1.4.11): el borde visible debe distinguirse del fondo.
  const bordes = [];
  for (const el of document.querySelectorAll('input:not([type="hidden"]), select, textarea, button, .boton')) {
    if (!visible(el)) continue;
    const estilo = getComputedStyle(el);
    if (Number.parseFloat(estilo.borderTopWidth) === 0) continue;
    if (estilo.borderTopStyle === 'none') continue;
    const colorBorde = rgb(estilo.borderTopColor);
    if (colorBorde[3] < 0.5) continue;
    const fondo = fondoDe(el.parentElement || el);
    const proporcion = razon([colorBorde[0], colorBorde[1], colorBorde[2]], fondo);
    if (proporcion + 0.05 < 3) {
      bordes.push({
        selector: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
        proporcion: Number(proporcion.toFixed(2)),
      });
    }
  }

  const SELECTOR_TOQUE =
    'button, .boton, .chip, summary, input[type="checkbox"], input[type="radio"], .migas a, .acciones a, .enlace-suave, td a, .fila-acciones a, .paginacion a';
  const toques = [];
  for (const el of document.querySelectorAll(SELECTOR_TOQUE)) {
    if (!visible(el)) continue;
    const caja = el.getBoundingClientRect();
    if (caja.width === 0 || caja.height === 0) continue;
    if (caja.width < 44 || caja.height < 44) {
      toques.push({
        texto: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 32),
        ancho: Math.round(caja.width),
        alto: Math.round(caja.height),
      });
    }
  }

  const SELECTOR_TIPOGRAFIA = 'p, li, td, th, label, .ayuda, .rotulo, .chip, button, .boton, a, small, .migas, .migas a, input, select, textarea';
  const tipografia = [];
  for (const el of document.querySelectorAll(SELECTOR_TIPOGRAFIA)) {
    if (!visible(el)) continue;
    if (el.closest('.visualmente-oculto, .salto-contenido')) continue;
    if (!el.textContent.trim() && !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) continue;
    const tamano = Number.parseFloat(getComputedStyle(el).fontSize);
    if (tamano < 16) {
      tipografia.push({
        texto: (el.textContent || el.value || el.tagName).trim().slice(0, 32),
        tamano,
        selector: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
      });
    }
  }

  // En móvil ninguna tabla debe quedar en modo tabla (se esperan tarjetas).
  const tablasEnTabla = Array.from(document.querySelectorAll('table')).filter(
    (tabla) => visible(tabla) && getComputedStyle(tabla).display === 'table'
  ).length;

  const textoPrincipal = (document.querySelector('main') || document.body).innerText;
  const jsonCrudo = /\{\s*"[a-zA-Z_]+"\s*:/.test(textoPrincipal);

  const focoVisible = Array.from(document.styleSheets).some((hoja) => {
    try {
      return Array.from(hoja.cssRules).some((regla) => String(regla.selectorText || '').includes(':focus-visible'));
    } catch {
      return false;
    }
  });

  return {
    desborde,
    altoCabecera,
    buscadores,
    enlacesInicio,
    imagenesRojas,
    contraste,
    bordes,
    toques,
    tipografia,
    tablasEnTabla,
    jsonCrudo,
    focoVisible,
    alto: window.innerHeight,
  };
}

// ---------------------------------------------------------------- navegación

async function entrar(contexto, cuenta) {
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await pagina.fill('main input[name="usuario"]', cuenta.usuario);
  await pagina.fill('main input[name="clave"]', cuenta.clave);
  await Promise.all([
    pagina.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    pagina.click('main form button[type="submit"]'),
  ]);
  return pagina;
}

async function revisarRuta(pagina, ruta, viewport, rol) {
  const erroresConsola = [];
  const erroresPagina = [];
  const respuestasMalas = [];
  avisos.length = 0;
  // Los reproductores embebidos de YouTube son de terceros: sus 404 y sus
  // errores de CSP no dependen de esta aplicación (y sin red fallan igual). Se
  // registran como aviso para no convertir un embed caído ajeno en regresión.
  const esTercero = (texto) => /youtube|ytimg|googlevideo/i.test(texto);
  const alConsola = (mensaje) => {
    if (mensaje.type() !== 'error') return;
    const texto = mensaje.text().slice(0, 200);
    // El texto del error no siempre trae la URL: se mira el origen del recurso.
    const origen = (mensaje.location && mensaje.location().url) || '';
    if (esTercero(texto) || esTercero(origen)) { avisos.push(`embed: ${texto} (${origen.slice(0, 90)})`); return; }
    erroresConsola.push(texto);
  };
  const alError = (error) => erroresPagina.push(String(error.message || error).slice(0, 200));
  const alRespuesta = (respuesta) => {
    if (respuesta.status() < 400) return;
    const url = respuesta.url();
    if (esTercero(url)) { avisos.push(`embed ${respuesta.status()}: ${url.slice(0, 120)}`); return; }
    respuestasMalas.push(`${respuesta.status()} ${url}`);
  };
  pagina.on('console', alConsola);
  pagina.on('pageerror', alError);
  pagina.on('response', alRespuesta);

  const respuesta = await pagina.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
  if (!respuesta || respuesta.status() >= 400) {
    fallo('red', `${rol} ${viewport.nombre} ${ruta}`, `la navegación devolvió ${respuesta ? respuesta.status() : 'sin respuesta'}`);
  }
  const medidas = await pagina.evaluate(medirPagina);

  erroresConsola.forEach((texto) => fallo('consola', `${rol} ${viewport.nombre} ${ruta}`, texto));
  erroresPagina.forEach((texto) => fallo('pageerror', `${rol} ${viewport.nombre} ${ruta}`, texto));
  respuestasMalas.forEach((texto) => fallo('recurso-4xx', `${rol} ${viewport.nombre} ${ruta}`, texto));

  if (medidas.desborde > 0) fallo('desborde', `${rol} ${viewport.nombre} ${ruta}`, `${medidas.desborde}px de scroll horizontal`);
  if (medidas.buscadores > 1) fallo('buscador-duplicado', `${rol} ${viewport.nombre} ${ruta}`, `${medidas.buscadores} formularios role=search`);
  if (medidas.enlacesInicio > 0) fallo('inicio-redundante', `${rol} ${viewport.nombre} ${ruta}`, `${medidas.enlacesInicio} enlaces «Inicio» con el logo llevando a /`);
  if (medidas.imagenesRojas > 0) fallo('imagen-rota', `${rol} ${viewport.nombre} ${ruta}`, `${medidas.imagenesRojas} imágenes sin cargar o sin alt`);
  if (medidas.contraste.length) {
    medidas.contraste.slice(0, 4).forEach((c) =>
      fallo('contraste-texto', `${rol} ${viewport.nombre} ${ruta}`, `«${c.texto}» ${c.selector} ${c.proporcion}:1 (mínimo ${c.minimo})`));
    if (medidas.contraste.length > 4) fallo('contraste-texto', `${rol} ${viewport.nombre} ${ruta}`, `…y ${medidas.contraste.length - 4} más`);
  }
  if (medidas.bordes.length) {
    medidas.bordes.slice(0, 4).forEach((b) =>
      fallo('contraste-borde', `${rol} ${viewport.nombre} ${ruta}`, `${b.selector} ${b.proporcion}:1 (mínimo 3)`));
    if (medidas.bordes.length > 4) fallo('contraste-borde', `${rol} ${viewport.nombre} ${ruta}`, `…y ${medidas.bordes.length - 4} más`);
  }
  if (medidas.jsonCrudo) fallo('json-crudo', `${rol} ${viewport.nombre} ${ruta}`, 'se ve JSON sin procesar en el contenido');

  if (viewport.nombre === 'movil') {
    if (medidas.altoCabecera > 168) fallo('cabecera-alta', `${rol} movil ${ruta}`, `${medidas.altoCabecera}px (máximo 168)`);
    medidas.toques.slice(0, 5).forEach((t) =>
      fallo('toque-chico', `${rol} movil ${ruta}`, `«${t.texto}» ${t.ancho}×${t.alto}px`));
    if (medidas.toques.length > 5) fallo('toque-chico', `${rol} movil ${ruta}`, `…y ${medidas.toques.length - 5} más`);
    medidas.tipografia.slice(0, 5).forEach((t) =>
      fallo('texto-chico', `${rol} movil ${ruta}`, `«${t.texto}» ${t.selector} ${t.tamano}px`));
    if (medidas.tipografia.length > 5) fallo('texto-chico', `${rol} movil ${ruta}`, `…y ${medidas.tipografia.length - 5} más`);
    if (medidas.tablasEnTabla > 0) fallo('tabla-no-tarjeta', `${rol} movil ${ruta}`, `${medidas.tablasEnTabla} tablas siguen en modo tabla`);
  }

  pagina.off('console', alConsola);
  pagina.off('pageerror', alError);
  pagina.off('response', alRespuesta);
  return medidas;
}

// ---------------------------------------------------------------- interacción

async function probarFiltros(pagina) {
  const ruta = '/talleres?tematica=Conservas&estado=finalizado&anio=2026';
  await pagina.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
  const chips = await pagina.$$eval('a.chip[href^="/talleres"], .chips-removibles a', (enlaces) =>
    enlaces.map((a) => ({ texto: a.textContent.trim(), href: a.getAttribute('href') }))
  );
  if (chips.length === 0) return fallo('filtros', 'movil /talleres', 'no hay chips de filtro');

  const activos = new URLSearchParams('tematica=Conservas&estado=finalizado&anio=2026');
  for (const chip of chips) {
    const destino = new URL(chip.href, BASE);
    const params = destino.searchParams;
    if (chip.texto.includes('Limpiar')) continue;
    // Cada chip puede cambiar UNA faceta; las otras dos deben sobrevivir.
    let conservadas = 0;
    for (const clave of ['tematica', 'estado', 'anio']) {
      if (params.get(clave) === activos.get(clave)) conservadas += 1;
    }
    if (conservadas < 2) {
      fallo('filtros', 'movil /talleres', `el chip «${chip.texto}» pierde facets activas: ${chip.href}`);
    }
  }

  const removibles = await pagina.$$eval('.chips-removibles a', (enlaces) => enlaces.length).catch(() => 0);
  if (removibles < 3) fallo('filtros', 'movil /talleres', `faltan chips removibles de filtros activos (${removibles})`);
}

async function probarEscape(pagina, viewport) {
  const objetivo = viewport.nombre === 'movil' ? 'details.menu' : 'details.mas';
  const existe = await pagina.$(`${objetivo} > summary`);
  if (!existe) return fallo('escape', `${viewport.nombre}`, `no existe ${objetivo}`);
  await pagina.click(`${objetivo} > summary`);
  const abierto = await pagina.$eval(objetivo, (d) => d.open);
  if (!abierto) {
    // En escritorio el menú puede estar siempre desplegado por diseño.
    const forzado = await pagina.$eval(objetivo, (d) => d.hasAttribute('data-plegable'));
    if (!forzado) return;
  }
  await pagina.keyboard.press('Escape');
  const cerrado = await pagina.$eval(objetivo, (d) => !d.open);
  if (!cerrado) fallo('escape', viewport.nombre, `${objetivo} sigue abierto después de Escape`);
  const foco = await pagina.evaluate(() => document.activeElement && document.activeElement.tagName);
  if (foco !== 'SUMMARY') fallo('escape', viewport.nombre, `el foco no volvió al disparador (${foco})`);
}

async function probarCancelarBorrado(pagina) {
  await pagina.goto(`${BASE}/admin/talleres`, { waitUntil: 'networkidle' });
  const formulario = await pagina.$('form[action$="/eliminar"] button[type="submit"], form[action*="/eliminar"] button[type="submit"]');
  if (!formulario) return fallo('cancelar', '/admin/talleres', 'no hay formulario de borrado para probar');

  let dialogos = 0;
  const alDialogo = async (dialogo) => {
    dialogos += 1;
    await dialogo.dismiss();
  };
  pagina.on('dialog', alDialogo);
  await formulario.click();
  await pagina.waitForTimeout(400);

  // Si hay modal propio, se cancela desde él.
  const cancelar = await pagina.$('[data-cancelar], .dialogo button:has-text("Cancelar"), .confirmacion button:has-text("Cancelar")');
  if (cancelar) {
    await cancelar.click();
    await pagina.waitForTimeout(200);
  }
  pagina.off('dialog', alDialogo);

  const cargando = await pagina.$$eval('.boton-cargando', (botones) => botones.length);
  if (cargando > 0) fallo('cancelar', '/admin/talleres', 'el botón quedó en estado de carga tras cancelar');
  const sigueEnLista = pagina.url().includes('/admin/talleres');
  if (!sigueEnLista) fallo('cancelar', '/admin/talleres', 'la cancelación navegó igual');
  if (dialogos === 0 && !cancelar) fallo('cancelar', '/admin/talleres', 'no apareció ninguna confirmación (ni nativa ni modal)');
}

async function probarPrivacidad(pagina) {
  for (const ruta of ['/', '/talleres', '/recetas', '/videos', '/documentos', '/buscar?q=E2E']) {
    await pagina.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
    const texto = await pagina.evaluate(() => document.body.innerText);
    for (const nombre of PROHIBIDOS_EN_PUBLICO) {
      if (texto.includes(nombre)) fallo('privacidad', ruta, `aparece «${nombre}» en el sitio público`);
    }
  }
  // Documento en papelera: no descargable.
  const respuesta = await pagina.goto(`${BASE}/documentos/6/ver`, { waitUntil: 'domcontentloaded' });
  if (respuesta && respuesta.status() !== 404) {
    fallo('privacidad', '/documentos/6/ver', `devolvió ${respuesta.status()} en vez de 404`);
  }
}

async function probarAuditoria(pagina) {
  await pagina.goto(`${BASE}/admin/auditoria`, { waitUntil: 'networkidle' });
  const filas = await pagina.$$eval('main table tbody tr', (trs) =>
    trs.map((tr) => ({
      texto: tr.innerText.replace(/\s+/g, ' ').trim(),
      enlaces: tr.querySelectorAll('a[href]').length,
    }))
  );
  if (filas.length === 0) return fallo('auditoria', '/admin/auditoria', 'no hay filas de auditoría');
  filas.forEach((fila) => {
    const tieneEstado = /\[EN PAPELERA\]|\[ELIMINADO\]/.test(fila.texto);
    if (fila.enlaces === 0 && !tieneEstado) {
      fallo('auditoria', '/admin/auditoria', `fila sin enlace ni estado explícito: ${fila.texto.slice(0, 80)}`);
    }
    if (/\{|\}|":"/.test(fila.texto)) fallo('auditoria', '/admin/auditoria', `fila con JSON crudo: ${fila.texto.slice(0, 80)}`);
  });
}

// ---------------------------------------------------------------- principal

async function main() {
  const navegador = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  for (const viewport of VIEWPORTS) {
    // Público
    const contextoPublico = await navegador.newContext({ viewport });
    const paginaPublica = await contextoPublico.newPage();
    for (const ruta of RUTAS_PUBLICAS) {
      await revisarRuta(paginaPublica, ruta, viewport, 'publico');
    }
    if (viewport.nombre === 'movil') {
      await probarFiltros(paginaPublica);
      await probarEscape(paginaPublica, viewport);
    }
    await probarPrivacidad(paginaPublica);
    await contextoPublico.close();

    // Docente
    const contextoDocente = await navegador.newContext({ viewport });
    const paginaDocente = await entrar(contextoDocente, CUENTAS.docente);
    for (const ruta of RUTAS_DOCENTE) {
      await revisarRuta(paginaDocente, ruta, viewport, 'docente');
    }
    await contextoDocente.close();

    // Admin
    const contextoAdmin = await navegador.newContext({ viewport });
    const paginaAdmin = await entrar(contextoAdmin, CUENTAS.admin);
    for (const ruta of RUTAS_ADMIN) {
      await revisarRuta(paginaAdmin, ruta, viewport, 'admin');
    }
    await probarEscape(paginaAdmin, viewport);
    await probarCancelarBorrado(paginaAdmin);
    await probarAuditoria(paginaAdmin);
    await contextoAdmin.close();
  }

  await navegador.close();

  if (avisos.length > 0) {
    console.log(`\nAvisos de terceros (embeds de video, fuera del alcance): ${avisos.length}`);
  }

  if (fallos.length === 0) {
    console.log('\nCalibración en verde: 0 fallos en escritorio y móvil, 3 roles.');
    return 0;
  }

  const porCategoria = new Map();
  for (const f of fallos) {
    if (!porCategoria.has(f.categoria)) porCategoria.set(f.categoria, []);
    porCategoria.get(f.categoria).push(f);
  }
  console.log(`\nCalibración con ${fallos.length} fallos en ${porCategoria.size} categorías:\n`);
  for (const [categoria, lista] of porCategoria) {
    console.log(`## ${categoria} (${lista.length})`);
    lista.slice(0, 6).forEach((f) => console.log(`   - ${f.ruta}: ${f.detalle}`));
    if (lista.length > 6) console.log(`   - …y ${lista.length - 6} más`);
  }
  return 1;
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((error) => {
    console.error('La calibración no pudo ejecutarse:', error);
    process.exit(2);
  });
