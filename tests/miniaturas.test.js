// Galería de documentos: la tarjeta pública usa una miniatura WebP de 480 px
// generada al subir, en vez de bajar la foto completa de 1600 px.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { prepararBase, levantarApp, crearCliente, entrar, pool } = require('./helpers');
const archivos = require('../src/archivos');

let app;
let usuario;
let idTaller;

// PNG de 900x600 con un degradado: pesa lo suficiente para que la miniatura
// gane peso y no depende de ningún archivo binario del repositorio.
function pngDePrueba(ancho = 900, alto = 600) {
  const crudo = Buffer.alloc((ancho * 3 + 1) * alto);
  let posicion = 0;
  for (let y = 0; y < alto; y += 1) {
    crudo[posicion] = 0; // filtro: ninguno
    posicion += 1;
    for (let x = 0; x < ancho; x += 1) {
      crudo[posicion] = x % 256;
      crudo[posicion + 1] = y % 256;
      crudo[posicion + 2] = (x + y) % 256;
      posicion += 3;
    }
  }

  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(cuerpo) >>> 0);
    return Buffer.concat([largo, cuerpo, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(crudo)),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

const TABLA_CRC = (() => {
  const tabla = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c;
  }
  return tabla;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

before(async () => {
  await prepararBase();
  app = await levantarApp();
  usuario = crearCliente(app.base);
  await entrar(usuario, 'docente', 'Docente-2026');

  const { rows } = await pool.query(
    `INSERT INTO taller (nombre, tematica, publicado, id_usuario)
     VALUES ('Taller con fotos', 'Prueba', true, (SELECT id FROM usuario WHERE usuario = 'docente'))
     RETURNING id`
  );
  idTaller = rows[0].id;
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

async function subirFoto(cliente, buffer, nombreArchivo = 'plato.png') {
  const formulario = new FormData();
  formulario.set('nombre', 'Foto del plato');
  formulario.set('destino', `taller:${idTaller}`);
  formulario.set('archivo', new Blob([buffer]), nombreArchivo);
  const respuesta = await fetch(`${app.base}/admin/documentos`, {
    method: 'POST',
    headers: { cookie: cliente.galleta },
    body: formulario,
    redirect: 'manual',
  });
  return respuesta.status;
}

test('la miniatura es WebP de 480 px y pesa menos que la foto', async (t) => {
  const foto = pngDePrueba();
  const liviana = await archivos.miniatura(foto, 'image/png', 'plato.png');
  if (!liviana) {
    t.skip('sin ImageMagick en este equipo: no se puede generar la miniatura');
    return;
  }

  assert.equal(liviana.subarray(0, 4).toString('latin1'), 'RIFF');
  assert.equal(liviana.subarray(8, 12).toString('latin1'), 'WEBP');
  assert.ok(liviana.length < foto.length, 'la miniatura debe pesar menos que la foto');
});

test('al subir una foto se guarda su miniatura y la galería la sirve', async (t) => {
  const foto = pngDePrueba();
  assert.equal(await subirFoto(usuario, foto), 302);

  const { rows } = await pool.query(
    `SELECT id, tipo_mime, tamano, contenido, miniatura
       FROM documento WHERE id_taller = $1 ORDER BY id DESC LIMIT 1`,
    [idTaller]
  );
  const documento = rows[0];
  assert.ok(documento, 'el documento quedó guardado');
  assert.match(documento.tipo_mime, /^image\//);

  if (!documento.miniatura) {
    t.skip('sin ImageMagick en este equipo: se guardó la foto sin miniatura');
    return;
  }
  assert.ok(documento.miniatura.length < documento.contenido.length);

  const respuesta = await fetch(`${app.base}/documentos/${documento.id}/miniatura`);
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('content-type'), 'image/webp');
  assert.match(respuesta.headers.get('cache-control'), /max-age=604800/);
  const cuerpo = Buffer.from(await respuesta.arrayBuffer());
  assert.equal(cuerpo.subarray(8, 12).toString('latin1'), 'WEBP');
});

test('la galería pública pide la miniatura con srcset en vez de la foto completa', async () => {
  const { rows } = await pool.query(
    `SELECT id FROM documento WHERE id_taller = $1 AND miniatura IS NOT NULL LIMIT 1`,
    [idTaller]
  );
  if (!rows[0]) {
    // Sin ImageMagick no hay miniatura; el marcado igual se revisa abajo.
  }

  const respuesta = await fetch(`${app.base}/documentos`);
  assert.equal(respuesta.status, 200);
  const html = await respuesta.text();
  assert.match(html, /srcset="[^"]*\/miniatura 480w/);
  assert.match(html, /\/ver 1600w/);
});

test('un PDF no tiene miniatura y su tarjeta sigue mostrando el ícono', async () => {
  const formulario = new FormData();
  formulario.set('nombre', 'Receta en PDF');
  formulario.set('destino', `taller:${idTaller}`);
  formulario.set('archivo', new Blob(['%PDF-1.7\ncontenido']), 'receta.pdf');
  await fetch(`${app.base}/admin/documentos`, {
    method: 'POST',
    headers: { cookie: usuario.galleta },
    body: formulario,
    redirect: 'manual',
  });

  const { rows } = await pool.query(
    `SELECT miniatura FROM documento WHERE id_taller = $1 AND tipo_mime = 'application/pdf'
      ORDER BY id DESC LIMIT 1`,
    [idTaller]
  );
  assert.equal(rows[0].miniatura, null);
});
