// Compresión de los archivos que se suben.
//
// Un PDF de 300 dpi con fotos pesa varios MB; la ficha de una receta no necesita
// más que 150 dpi. Ghostscript lo reescribe con las imágenes a resolución de
// pantalla (/ebook) y mantiene el texto seleccionable. Las fotos de celular se
// reescalan a 1600 px y se guardan en JPEG de calidad 82.
//
// Si la herramienta no está o el resultado pesa más que el original, se devuelve
// el archivo tal como llegó: la compresión nunca puede romper una subida.
const { execFile } = require('child_process');

const TIEMPO_MAXIMO_MS = 25000;

const TIPOS = {
  'application/pdf': { familia: 'pdf', extension: '.pdf' },
  'image/jpeg': { familia: 'imagen', extension: '.jpg' },
  'image/png': { familia: 'imagen', extension: '.png' },
  'image/webp': { familia: 'imagen', extension: '.webp' },
};

// Comandos por familia. Se escriben una sola vez para poder cambiarlos en un
// servidor donde ghostscript o ImageMagick vivan en otra ruta.
const COMANDOS = {
  pdf: {
    binario: process.env.GS_BIN || 'gs',
    argumentos: [
      '-q',
      '-dNOPAUSE',
      '-dBATCH',
      '-dSAFER',
      '-sDEVICE=pdfwrite',
      // Sin PassThrough el JPEG incrustado se vuelve a muestrear: un PDF de
      // fotos de 4,9 MB baja a 205 KB. Con PassThrough, ghostscript copia la
      // imagen tal cual y el archivo queda igual de pesado.
      '-dPassThroughJPEGImages=false',
      '-dCompatibilityLevel=1.5',
      '-dDetectDuplicateImages=true',
      '-dCompressFonts=true',
      '-dSubsetFonts=true',
      '-dDownsampleColorImages=true',
      '-dColorImageResolution=110',
      '-dColorImageDownsampleThreshold=1.0',
      '-dAutoFilterColorImages=false',
      '-dColorImageFilter=/DCTEncode',
      '-dJPEGQ=70',
      '-dDownsampleGrayImages=true',
      '-dGrayImageResolution=110',
      '-dGrayImageDownsampleThreshold=1.0',
      '-sOutputFile=-',
      '-',
    ],
  },
  imagen: {
    binario: process.env.MAGICK_BIN || 'magick',
    argumentos: ['-', '-auto-orient', '-resize', '1600x1600>', '-strip', '-quality', '82', 'jpg:-'],
  },
};

function ejecutar(binario, argumentos, entrada) {
  return new Promise((resolver, rechazar) => {
    const proceso = execFile(
      binario,
      argumentos,
      { encoding: 'buffer', maxBuffer: 40 * 1024 * 1024, timeout: TIEMPO_MAXIMO_MS },
      (error, salida) => {
        if (error) return rechazar(error);
        return resolver(salida);
      }
    );
    proceso.on('error', rechazar);
    proceso.stdin.on('error', () => {});
    proceso.stdin.end(entrada);
  });
}

function tipoDe(tipoMime, nombreArchivo) {
  const limpio = String(tipoMime || '').split(';')[0].trim().toLowerCase();
  if (TIPOS[limpio]) return { tipoMime: limpio, ...TIPOS[limpio] };

  const extension = String(nombreArchivo || '').toLowerCase().match(/\.(pdf|jpe?g|png|webp)$/);
  if (!extension) return null;
  const equivalente = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  return { tipoMime: equivalente[extension[1]], ...TIPOS[equivalente[extension[1]]] };
}

// Revisa que los bytes correspondan al tipo declarado: la extensión no basta.
function contenidoValido(buffer, tipoMime) {
  if (!buffer || buffer.length < 12) return false;
  if (tipoMime === 'application/pdf') return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  if (tipoMime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8;
  if (tipoMime === 'image/png') return buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  if (tipoMime === 'image/webp') {
    return buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP';
  }
  return false;
}

/**
 * Devuelve el archivo listo para guardar.
 * @returns {Promise<{buffer: Buffer, tipoMime: string, extension: string,
 *                    original: number, comprimido: boolean, motor: string}>}
 */
async function optimizar(buffer, tipoMime, nombreArchivo) {
  const tipo = tipoDe(tipoMime, nombreArchivo);
  if (!tipo) throw new Error('Tipo de archivo no admitido.');

  const base = {
    buffer,
    tipoMime: tipo.tipoMime,
    extension: tipo.extension,
    original: buffer.length,
    comprimido: false,
    motor: 'sin compresión',
  };

  const comando = COMANDOS[tipo.familia];
  try {
    const salida = await ejecutar(comando.binario, comando.argumentos, buffer);
    if (!salida || salida.length === 0) return base;

    // Un PDF comprimido debe seguir siendo un PDF; una foto, seguir siendo JPEG.
    const salidaValida = tipo.familia === 'pdf'
      ? salida.subarray(0, 5).toString('latin1') === '%PDF-'
      : salida[0] === 0xff && salida[1] === 0xd8;
    if (!salidaValida) return base;

    // Compresión inútil si el archivo ya venía optimizado.
    if (salida.length >= buffer.length) return base;

    return {
      buffer: salida,
      tipoMime: tipo.familia === 'pdf' ? 'application/pdf' : 'image/jpeg',
      extension: tipo.familia === 'pdf' ? '.pdf' : '.jpg',
      original: buffer.length,
      comprimido: true,
      motor: tipo.familia === 'pdf' ? 'ghostscript' : 'imagemagick',
    };
  } catch (error) {
    // Sin ghostscript o sin ImageMagick: se guarda el original y se sigue.
    return { ...base, motor: 'no disponible' };
  }
}

function porcentajeAhorro(resultado) {
  if (!resultado.comprimido || !resultado.original) return 0;
  return Math.round((1 - resultado.buffer.length / resultado.original) * 100);
}

function describirTamano(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = {
  TIPOS,
  contenidoValido,
  describirTamano,
  optimizar,
  porcentajeAhorro,
  tipoDe,
};
