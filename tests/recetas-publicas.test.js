// CU-14: buscar recetas en lenguaje natural y leer sus archivos en la misma
// página. Antes había tres controles (código, taller, tipo de archivo): no
// escalaba a cien recetas y el archivo se abría en otra pestaña.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararBase, levantarApp, crearCliente, pool } = require('./helpers');


// PDF mínimo válido (una página con una línea de texto) para probar la vista
// previa: pdfinfo tiene que poder leerlo.
function pdfDeUnaPagina(texto = 'Receta de prueba') {
  const contenido = `BT /F1 18 Tf 20 100 Td (${texto}) Tj ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R ' +
      '/Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const posiciones = [];
  objetos.forEach((cuerpo, indice) => {
    posiciones.push(pdf.length);
    pdf += `${indice + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });
  const inicioXref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  posiciones.forEach((posicion) => {
    pdf += `${String(posicion).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

let app;
let idReceta;
let idDocumento;

before(async () => {
  await prepararBase();
  app = await levantarApp();

  const { rows: usuarios } = await pool.query(`SELECT id FROM usuario WHERE usuario = 'docente'`);
  const idUsuario = usuarios[0].id;

  const { rows: talleres } = await pool.query(
    `INSERT INTO taller (nombre, tematica, descripcion, fecha_planificada, estado, id_usuario)
     VALUES ('Panadería de la abuela', 'Panadería', 'Pan amasado y hallullas.', '2026-09-10', 'finalizado', $1),
            ('Conservas de invierno', 'Conservas', 'Mermeladas y encurtidos.', '2026-08-20', 'finalizado', $1)
     RETURNING id`,
    [idUsuario]
  );

  const { rows: recetas } = await pool.query(
    `INSERT INTO receta (codigo, nombre, descripcion, id_usuario)
     VALUES ('REC-QA-1', 'Pan amasado tradicional', 'Con masa madre y horno de barro.', $1),
            ('REC-QA-2', 'Mermelada de ciruela', 'Temporada de ciruelas.', $1)
     RETURNING id`,
    [idUsuario]
  );
  idReceta = recetas[0].id;

  await pool.query(
    `INSERT INTO receta_taller (id_receta, id_taller)
     VALUES ($1, $2), ($3, $4)`,
    [recetas[0].id, talleres[0].id, recetas[1].id, talleres[1].id]
  );

  const { rows: documentos } = await pool.query(
    `INSERT INTO documento (nombre, archivo, tipo_mime, tamano, contenido, id_receta, id_usuario)
     VALUES ('Ficha técnica del pan amasado', 'ficha-pan.pdf', 'application/pdf', 4,
             $1, $2, $3)
     RETURNING id`,
    [pdfDeUnaPagina(), recetas[0].id, idUsuario]
  );
  idDocumento = documentos[0].id;
});

after(async () => {
  await app.cerrar();
  await pool.end();
});

test('el buscador de recetas es uno solo y no hay listas fijas de talleres ni de archivos', async () => {
  const cliente = crearCliente(app.base);
  const pagina = await cliente.get('/recetas');

  assert.equal(pagina.estado, 200);
  assert.match(pagina.texto, /Buscar una receta/);
  assert.doesNotMatch(pagina.texto, /<select/, 'no quedan desplegables de opciones fijas');
  assert.doesNotMatch(pagina.texto, /Buscar por código/);
});

test('buscar por el nombre del taller encuentra sus recetas', async () => {
  const cliente = crearCliente(app.base);
  const pagina = await cliente.get('/recetas?q=panaderia');

  assert.equal(pagina.estado, 200);
  assert.match(pagina.texto, /Pan amasado tradicional/);
  assert.doesNotMatch(pagina.texto, /Mermelada de ciruela/);
});

test('buscar por el nombre del archivo encuentra la receta que lo contiene', async () => {
  const cliente = crearCliente(app.base);
  const pagina = await cliente.get('/recetas?q=ficha%20tecnica');

  assert.equal(pagina.estado, 200);
  assert.match(pagina.texto, /Pan amasado tradicional/);
  assert.doesNotMatch(pagina.texto, /Mermelada de ciruela/);
});

test('una búsqueda sin coincidencias avisa y no inventa resultados', async () => {
  const cliente = crearCliente(app.base);
  const pagina = await cliente.get('/recetas?q=ceviche');

  assert.equal(pagina.estado, 200);
  assert.doesNotMatch(pagina.texto, /Pan amasado tradicional/);
});

test('la receta muestra el archivo dentro de la página y no abre otra pestaña', async () => {
  const cliente = crearCliente(app.base);
  const pagina = await cliente.get(`/recetas/${idReceta}`);

  assert.equal(pagina.estado, 200);
  assert.match(pagina.texto, /class="visor-pagina"/);
  assert.match(pagina.texto, new RegExp(`/documentos/${idDocumento}/vista.png\\?p=1`));
  assert.match(pagina.texto, new RegExp(`/documentos/${idDocumento}/descargar`));
  assert.doesNotMatch(pagina.texto, /target="_blank"/);
});

test('la descarga llega como adjunto y la vista como contenido en línea', async () => {
  const cliente = crearCliente(app.base);
  const descarga = await fetch(`${app.base}/documentos/${idDocumento}/descargar`);
  const vista = await fetch(`${app.base}/documentos/${idDocumento}/ver`);

  assert.equal(descarga.status, 200);
  assert.match(descarga.headers.get('content-disposition'), /^attachment;/);
  assert.equal(vista.status, 200);
  assert.match(vista.headers.get('content-disposition'), /^inline;/);
});

test('la página del PDF se sirve como imagen para leerla dentro de la receta', async () => {
  const respuesta = await fetch(`${app.base}/documentos/${idDocumento}/vista.png?p=1`);

  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('content-type'), 'image/png');
  const imagen = Buffer.from(await respuesta.arrayBuffer());
  assert.equal(imagen.subarray(1, 4).toString(), 'PNG');
});

test('el sello de versión cambia con cada hoja de estilos propia', async () => {
  // Si una hoja queda fuera del sello, el navegador sigue usando la vieja
  // después de cada cambio y el CSS nuevo parece no aplicarse.
  const cliente = crearCliente(app.base);
  const pagina = await cliente.get('/recetas');
  const version = (pagina.texto.match(/cartel\.css\?v=([a-z0-9-]+)/) || [])[1];

  assert.ok(version, 'la hoja propia lleva sello de versión');
  assert.equal(version.split('-').length, 4, 'estilos, cartel, app y formularios');
});

// La cinta de la portada no elige una receta: muestra todas las que tienen
// foto y cada una es su propio enlace. Una sola receta no necesita cinta.
test('la cinta de la portada enlaza cada receta con foto', async () => {
  const cliente = crearCliente(app.base);

  const { rows: talleres } = await pool.query(
    `INSERT INTO taller (nombre, tematica, descripcion, fecha_planificada, estado, publicado, id_usuario)
     SELECT 'Taller del turno', 'Conservas', 'Para la portada.', '2026-10-01', 'finalizado', true, id
       FROM usuario WHERE usuario = 'docente' RETURNING id`
  );
  const { rows: recetas } = await pool.query(
    `INSERT INTO receta (codigo, nombre, descripcion, id_usuario)
     SELECT 'REC-QA-TURNO', 'Chutney de ciruela', 'Para la portada.', id
       FROM usuario WHERE usuario = 'docente' RETURNING id`
  );
  await pool.query(
    `INSERT INTO receta (codigo, nombre, descripcion, id_usuario)
     SELECT 'REC-QA-TURNO-2', 'Mermelada de ciruela', 'Para la portada.', id
       FROM usuario WHERE usuario = 'docente'`
  );
  const { rows: segunda } = await pool.query(
    `SELECT id FROM receta WHERE codigo = 'REC-QA-TURNO-2'`
  );
  await pool.query('INSERT INTO receta_taller (id_receta, id_taller) VALUES ($1, $2)', [
    recetas[0].id,
    talleres[0].id,
  ]);
  await pool.query('INSERT INTO receta_taller (id_receta, id_taller) VALUES ($1, $2)', [
    segunda[0].id,
    talleres[0].id,
  ]);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64'
  );
  for (const [receta, nombre] of [
    [recetas[0].id, 'chutney.png'],
    [segunda[0].id, 'mermelada.png'],
  ]) {
    await pool.query(
      `INSERT INTO documento (nombre, archivo, tipo_mime, tamano, contenido, id_receta, id_usuario)
       SELECT $4, $5, 'image/png', $2, $3, $1, id
         FROM usuario WHERE usuario = 'docente'`,
      [receta, png.length, png, nombre, nombre]
    );
  }

  const { estado, texto: html } = await cliente.get('/');
  assert.equal(estado, 200);
  // Sin foto propia del taller la portada no lleva etiqueta; lo que sí tiene
  // que estar es la cinta con cada receta con foto enlazada.
  assert.match(
    html,
    new RegExp(`<a class="cinta-item" href="/recetas/${recetas[0].id}"[^>]*>`)
  );
  assert.match(
    html,
    new RegExp(`<a class="cinta-item" href="/recetas/${segunda[0].id}"[^>]*>`)
  );
});
