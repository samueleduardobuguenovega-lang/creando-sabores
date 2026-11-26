// Vista previa de PDF sin plugins: el navegador de un teléfono no muestra PDF
// dentro de una página (Chrome Android lo descarga), así que el servidor
// convierte cada página en una imagen con poppler y la sirve como PNG.
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const ejecutar = promisify(execFile);

// Las páginas ya convertidas se guardan en memoria: el recetario se relee
// muchas veces y no tiene sentido volver a rasterizar lo mismo.
const CACHE = new Map();
const CACHE_MAXIMO = 120;

function guardarEnCache(clave, valor) {
  if (CACHE.size >= CACHE_MAXIMO) {
    const primera = CACHE.keys().next().value;
    CACHE.delete(primera);
  }
  CACHE.set(clave, valor);
}

async function conArchivoTemporal(contenido, tarea) {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-'));
  const archivo = path.join(carpeta, 'documento.pdf');
  await fs.writeFile(archivo, contenido);
  try {
    return await tarea(archivo, carpeta);
  } finally {
    await fs.rm(carpeta, { recursive: true, force: true });
  }
}

async function contarPaginas(contenido) {
  try {
    return await conArchivoTemporal(contenido, async (archivo) => {
      const { stdout } = await ejecutar('pdfinfo', [archivo]);
      const linea = stdout.split('\n').find((texto) => texto.startsWith('Pages:'));
      const total = Number((linea || '').replace('Pages:', '').trim());
      return Number.isFinite(total) && total > 0 ? total : 0;
    });
  } catch {
    return 0;
  }
}

async function rasterizarPagina(contenido, pagina, resolucion = 110) {
  return conArchivoTemporal(contenido, async (archivo, carpeta) => {
    const salida = path.join(carpeta, 'pagina');
    await ejecutar('pdftoppm', [
      '-png',
      '-r',
      String(resolucion),
      '-f',
      String(pagina),
      '-l',
      String(pagina),
      '-singlefile',
      archivo,
      salida,
    ]);
    return fs.readFile(`${salida}.png`);
  });
}

async function vistaDePagina(idDocumento, contenido, pagina) {
  const clave = `${idDocumento}:${pagina}`;
  if (CACHE.has(clave)) return CACHE.get(clave);
  const imagen = await rasterizarPagina(contenido, pagina);
  guardarEnCache(clave, imagen);
  return imagen;
}

function olvidarDocumento(idDocumento) {
  for (const clave of CACHE.keys()) {
    if (clave.startsWith(`${idDocumento}:`)) CACHE.delete(clave);
  }
}

module.exports = { contarPaginas, vistaDePagina, olvidarDocumento };
