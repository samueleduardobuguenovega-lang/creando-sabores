// Validaciones compartidas por todos los módulos.
// Cada función devuelve { ok, valor } o { ok: false, error }.

const ESTADOS = ['planificado', 'en_ejecucion', 'finalizado'];

const ETIQUETA_ESTADO = {
  planificado: 'Planificado',
  en_ejecucion: 'En ejecución',
  finalizado: 'Finalizado',
};

function texto(valor, { campo, max = 200, requerido = true, min = 0 } = {}) {
  const limpio = (valor ?? '').toString().trim();
  if (requerido && limpio.length === 0) {
    return { ok: false, error: `El campo ${campo} es obligatorio.` };
  }
  if (limpio.length > max) {
    return { ok: false, error: `El campo ${campo} admite hasta ${max} caracteres.` };
  }
  if (limpio.length > 0 && limpio.length < min) {
    return { ok: false, error: `El campo ${campo} necesita al menos ${min} caracteres.` };
  }
  return { ok: true, valor: limpio };
}

function fecha(valor, { campo, requerido = false } = {}) {
  const limpio = (valor ?? '').toString().trim();
  if (!limpio) {
    return requerido ? { ok: false, error: `La ${campo} es obligatoria.` } : { ok: true, valor: null };
  }
  // Acepta exactamente el formato que manda <input type="date">.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio) || Number.isNaN(Date.parse(limpio))) {
    return { ok: false, error: `La ${campo} no tiene un formato válido (aaaa-mm-dd).` };
  }
  return { ok: true, valor: limpio };
}

function entero(valor, { campo, min = 0, max = 100000 } = {}) {
  const numero = Number.parseInt((valor ?? '').toString().trim(), 10);
  if (!Number.isInteger(numero)) {
    return { ok: false, error: `El campo ${campo} debe ser un número entero.` };
  }
  if (numero < min || numero > max) {
    return { ok: false, error: `El campo ${campo} debe estar entre ${min} y ${max}.` };
  }
  return { ok: true, valor: numero };
}

function estado(valor) {
  const limpio = (valor ?? '').toString().trim();
  if (!ESTADOS.includes(limpio)) {
    return { ok: false, error: 'El estado del taller no es válido.' };
  }
  return { ok: true, valor: limpio };
}

// Reconoce los formatos habituales de YouTube y Vimeo y devuelve el proveedor.
function enlaceVideo(valor) {
  const limpio = (valor ?? '').toString().trim();
  let url;
  try {
    url = new URL(limpio);
  } catch {
    return { ok: false, error: 'El enlace del video no es una URL válida.' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, error: 'El enlace del video debe empezar con http:// o https://.' };
  }
  if (url.username || url.password || url.port) {
    return { ok: false, error: 'El enlace del video no es válido.' };
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    const partes = url.pathname.split('/').filter(Boolean);
    const id = host === 'youtu.be'
      ? partes[0]
      : url.searchParams.get('v') || (['embed', 'shorts', 'live'].includes(partes[0]) ? partes[1] : null);
    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
      return { ok: false, error: 'El enlace de YouTube no contiene un identificador de video válido.' };
    }
    return {
      ok: true,
      valor: limpio,
      proveedor: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const partes = url.pathname.split('/').filter(Boolean);
    const id = host === 'player.vimeo.com'
      ? (partes[0] === 'video' ? partes[1] : null)
      : partes[0];
    if (!id || !/^\d+$/.test(id)) {
      return { ok: false, error: 'El enlace de Vimeo no contiene un identificador de video válido.' };
    }
    return {
      ok: true,
      valor: limpio,
      proveedor: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${id}`,
    };
  }
  return { ok: false, error: 'Solo se aceptan enlaces de YouTube o Vimeo.' };
}

function correoNoUsado() {
  // El SRS no pide correo: los usuarios se identifican por nombre de usuario.
  return { ok: true };
}

module.exports = {
  ESTADOS,
  ETIQUETA_ESTADO,
  texto,
  fecha,
  entero,
  estado,
  enlaceVideo,
  correoNoUsado,
};
