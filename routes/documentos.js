// Gestión privada de documentos PDF (RF-05 / CU-05).
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { pool, query } = require('../src/db');
const { requiereSesion, requiereRol } = require('../src/auth');
const { registrar } = require('../src/auditoria');
const v = require('../src/validaciones');
const { puedeTocar } = require('../src/permisos');
const archivos = require('../src/archivos');
const { creadorDeUrls, chip } = require('../src/facetas');
const { vistaDePagina } = require('../src/pdf');

const router = express.Router();
const TAMANO_MAXIMO = 10 * 1024 * 1024;
const MIME_PDF = 'application/pdf';
const MAXIMO_ARCHIVOS = 8;
const carga = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO, files: MAXIMO_ARCHIVOS },
  fileFilter: (req, archivo, callback) => {
    // Se acepta por tipo declarado o por extensión: hay teléfonos que mandan
    // "application/octet-stream" al subir desde la cámara.
    const tipo = archivos.tipoDe(archivo.mimetype, archivo.originalname);
    if (!tipo) {
      return callback(new Error('Solo se permiten PDF, JPG, PNG o WebP.'));
    }
    archivo.tipoArchivo = tipo;
    callback(null, true);
  },
});

async function cargarDatos(filtros = {}) {
  const busqueda = (filtros.q ?? '').toString().trim();
  const tipo = ['pdf', 'imagen'].includes(filtros.tipo) ? filtros.tipo : '';
  const origen = ['taller', 'receta'].includes(filtros.origen) ? filtros.origen : '';
  const [documentos, talleres, recetas] = await Promise.all([
    query(
      `SELECT d.id, d.nombre, d.archivo, d.tamano, d.tipo_mime, d.creado_en,
              COALESCE(t.nombre, r.nombre) AS asociado_a,
              CASE WHEN d.id_taller IS NOT NULL THEN 'Taller' ELSE 'Receta' END AS tipo_asociacion
         FROM documento d
         LEFT JOIN taller t ON t.id = d.id_taller
         LEFT JOIN receta r ON r.id = d.id_receta
        WHERE d.eliminado_en IS NULL
          AND ($1 = '' OR d.nombre ILIKE '%' || $1 || '%')
          AND ($2 = '' OR ($2 = 'pdf' AND d.tipo_mime = 'application/pdf')
                        OR ($2 = 'imagen' AND d.tipo_mime LIKE 'image/%'))
          AND ($3 = '' OR ($3 = 'taller' AND d.id_taller IS NOT NULL)
                        OR ($3 = 'receta' AND d.id_receta IS NOT NULL))
        ORDER BY d.creado_en DESC, d.id DESC`,
      [busqueda.length >= 2 ? busqueda.replace(/[\\%_]/g, '\\$&') : '', tipo, origen]
    ),
    query('SELECT id, nombre FROM taller WHERE eliminado_en IS NULL ORDER BY nombre'),
    query('SELECT id, codigo, nombre FROM receta WHERE eliminado_en IS NULL ORDER BY nombre'),
  ]);

  const urlFiltro = creadorDeUrls('/admin/documentos', { q: busqueda, tipo, origen });
  const chips = [];
  if (busqueda) chips.push(chip(`Búsqueda: ${busqueda}`, urlFiltro({ q: '' })));
  if (tipo) chips.push(chip(tipo === 'pdf' ? 'Tipo: PDF' : 'Tipo: Imagen', urlFiltro({ tipo: '' })));
  if (origen) chips.push(chip(origen === 'taller' ? 'Origen: Taller' : 'Origen: Receta', urlFiltro({ origen: '' })));

  return {
    documentos: documentos.rows,
    talleres: talleres.rows,
    recetas: recetas.rows,
    busqueda,
    tipo,
    origen,
    urlFiltro,
    chips,
    total: documentos.rows.length,
  };
}

async function renderListado(req, res, next, { estado = 200, errores = [], valores = {} } = {}) {
  try {
    const datos = await cargarDatos(req.query || {});
    return res.status(estado).render('admin/documentos', {
      titulo: 'Documentos PDF',
      ...datos,
      errores,
      valores,
    });
  } catch (error) {
    return next(error);
  }
}

router.get('/admin/documentos', requiereSesion, (req, res, next) => {
  // ?destino=taller:3 o receta:5 precarga la asociación y ahorra dos toques.
  const destino = typeof req.query.destino === 'string' ? req.query.destino : '';
  return renderListado(req, res, next, {
    valores: /^(taller|receta):\d+$/.test(destino) ? { destino } : {},
  });
});

router.post('/admin/documentos', requiereSesion, (req, res, next) => {
  // `archivos` es el campo múltiple; `archivo` se mantiene por compatibilidad.
  const recibir = carga.fields([
    { name: 'archivos', maxCount: MAXIMO_ARCHIVOS },
    { name: 'archivo', maxCount: 1 },
  ]);

  recibir(req, res, async (errorCarga) => {
    if (errorCarga) {
      const mensaje = errorCarga instanceof multer.MulterError && errorCarga.code === 'LIMIT_FILE_SIZE'
        ? 'Algún archivo supera el tamaño máximo de 10 MB.'
        : errorCarga.message === 'Solo se permiten PDF, JPG, PNG o WebP.'
          ? errorCarga.message
          : 'No se pudo procesar el archivo. Selecciona PDF o fotos de hasta 10 MB.';
      return renderListado(req, res, next, {
        estado: 400,
        errores: [mensaje],
        valores: req.body || {},
      });
    }

    try {
      const cuerpo = req.body || {};
      const subidos = [
        ...((req.files && req.files.archivos) || []),
        ...((req.files && req.files.archivo) || []),
      ];
      const nombre = v.texto(cuerpo.nombre, {
        campo: 'nombre del documento',
        max: 160,
        requerido: subidos.length <= 1,
      });
      const errores = [];
      if (!nombre.ok) errores.push(nombre.error);

      const destino = /^(taller|receta):([1-9]\d*)$/.exec((cuerpo.destino || '').toString());
      if (!destino) {
        errores.push('Selecciona el taller o la receta a la que pertenece el documento.');
      }
      if (subidos.length === 0) {
        errores.push('Selecciona al menos un archivo PDF o una foto.');
      }
      subidos.forEach((archivo) => {
        if (!archivos.contenidoValido(archivo.buffer, archivo.tipoArchivo.tipoMime)) {
          errores.push(
            archivo.tipoArchivo.tipoMime === 'application/pdf'
              ? `«${archivo.originalname}» no corresponde a un PDF válido.`
              : `«${archivo.originalname}» no corresponde a una imagen válida.`
          );
        }
      });
      if (errores.length > 0) {
        return renderListado(req, res, next, { estado: 400, errores, valores: cuerpo });
      }

      const tabla = destino[1] === 'taller' ? 'taller' : 'receta';
      const idDestino = Number(destino[2]);
      if (!Number.isSafeInteger(idDestino) || idDestino > 2147483647) {
        return renderListado(req, res, next, {
          estado: 400,
          errores: ['El taller o la receta seleccionados no son válidos.'],
          valores: cuerpo,
        });
      }
      const asociado = await query(`SELECT id, id_usuario FROM ${tabla} WHERE id = $1`, [idDestino]);
      if (!asociado.rows[0]) {
        return renderListado(req, res, next, {
          estado: 400,
          errores: ['El taller o la receta seleccionados ya no existen.'],
          valores: cuerpo,
        });
      }
      if (!puedeTocar(req.session.usuario, asociado.rows[0])) {
        return renderListado(req, res, next, {
          estado: 403,
          errores: [
            'Ese taller o receta lo documenta otra persona: solo su autor o la administración pueden sumarle archivos.',
          ],
          valores: cuerpo,
        });
      }

      // Se comprime cada archivo antes de guardarlo y todo se inserta junto:
      // si uno falla, no queda media subida en la ficha.
      const optimizados = [];
      for (const archivo of subidos) {
        const optimizado = await archivos.optimizar(
          archivo.buffer,
          archivo.tipoArchivo.tipoMime,
          archivo.originalname
        );
        // Se suelta el original: con 8 archivos de 10 MB el pico baja a la mitad.
        archivo.buffer = null;
        const nombreBase = nombre.valor
          ? subidos.length === 1
            ? nombre.valor
            : `${nombre.valor} (${optimizados.length + 1})`
          : archivo.originalname.replace(/\.[^.]+$/, '').slice(0, 120);
        // La galería pública usa una copia de 480 px en WebP; la foto completa
        // queda para la ficha y la descarga.
        const liviana = await archivos.miniatura(
          optimizado.buffer,
          optimizado.tipoMime,
          optimizado.archivo
        );
        optimizados.push({
          ...optimizado,
          nombre: nombreBase,
          archivo: `${crypto.randomUUID()}${optimizado.extension}`,
          miniatura: liviana,
        });
      }

      const idTaller = destino[1] === 'taller' ? idDestino : null;
      const idReceta = destino[1] === 'receta' ? idDestino : null;
      const cliente = await pool.connect();
      let totalOriginal = 0;
      let totalGuardado = 0;
      try {
        await cliente.query('BEGIN');
        for (const optimizado of optimizados) {
          const { rows } = await cliente.query(
            `INSERT INTO documento (nombre, archivo, tipo_mime, tamano, contenido, miniatura, id_taller, id_receta, id_usuario)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [
              optimizado.nombre,
              optimizado.archivo,
              optimizado.tipoMime,
              optimizado.buffer.length,
              optimizado.buffer,
              optimizado.miniatura,
              idTaller,
              idReceta,
              req.session.usuario.id,
            ]
          );
          await registrar(req.session.usuario.id, 'crear', 'documento', rows[0].id, {
            nombre: optimizado.nombre,
            archivo: optimizado.archivo,
            original_bytes: optimizado.original,
            guardado_bytes: optimizado.buffer.length,
            compresor: optimizado.motor,
          });
          totalOriginal += optimizado.original;
          totalGuardado += optimizado.buffer.length;
        }
        await cliente.query('COMMIT');
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
      } finally {
        cliente.release();
      }

      const ahorro = totalOriginal > 0
        ? Math.round((1 - totalGuardado / totalOriginal) * 100)
        : 0;
      const cuantos = optimizados.length === 1 ? 'Documento subido' : `${optimizados.length} documentos subidos`;
      const mensaje = ahorro > 0
        ? `${cuantos}: ${archivos.describirTamano(totalOriginal)} → ` +
          `${archivos.describirTamano(totalGuardado)} (${ahorro} % menos).`
        : `${cuantos} correctamente.`;
      // Si la subida salió desde la ficha del taller o de la receta, se vuelve
      // ahí mismo: el usuario no pierde el contexto. Sin `volver`, el destino
      // histórico es el listado (lo que esperan las pruebas de integración).
      const volver = v.destinoSeguro(req.body.volver, '');
      return res.redirect(
        volver ? `${volver}?ok=${encodeURIComponent(mensaje)}` : `/admin/documentos?ok=${encodeURIComponent(mensaje)}`
      );
    } catch (error) {
      return next(error);
    }
  });
});

async function enviarPdf(req, res, next, { publico = false, descarga = false } = {}) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return next();

    // Un documento en papelera no se entrega nunca. Sin sesión, además, su
    // taller o receta tiene que estar publicado: el archivo de un borrador no
    // se descarga aunque alguien adivine el id.
    const { rows } = await query(
      `SELECT d.nombre, d.archivo, d.tipo_mime, d.contenido,
              CASE WHEN d.id_taller IS NOT NULL THEN
                     EXISTS (SELECT 1 FROM taller t
                              WHERE t.id = d.id_taller AND t.publicado AND t.eliminado_en IS NULL)
                   ELSE
                     EXISTS (SELECT 1 FROM receta r
                              WHERE r.id = d.id_receta AND r.eliminado_en IS NULL)
                     AND (NOT EXISTS (SELECT 1 FROM receta_taller rt WHERE rt.id_receta = d.id_receta)
                          OR EXISTS (SELECT 1 FROM receta_taller rt
                                       JOIN taller t2 ON t2.id = rt.id_taller
                                      WHERE rt.id_receta = d.id_receta
                                        AND t2.publicado AND t2.eliminado_en IS NULL))
              END AS visible
         FROM documento d
        WHERE d.id = $1 AND d.eliminado_en IS NULL`,
      [id]
    );
    if (!rows[0] || !rows[0].contenido || (publico && !rows[0].visible)) {
      return res.status(404).render('error', {
        titulo: 'Documento no encontrado',
        mensaje: 'Ese documento no existe o fue eliminado.',
        detalle: 'Vuelve al apartado de documentos.',
      });
    }

    // El nombre que ve el visitante al guardar el PDF: el del documento, no el UUID.
    const nombreArchivo = (rows[0].nombre || 'documento')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'documento';

    const tipoMime = rows[0].tipo_mime || MIME_PDF;
    const extension = tipoMime === 'application/pdf' ? '.pdf' : '.jpg';

    res.set({
      'Content-Type': tipoMime,
      // `inline` para verlo en la misma pestaña; `attachment` para el botón de
      // descarga. Es el mismo archivo: cambia solo la cabecera.
      'Content-Disposition':
        `${descarga ? 'attachment' : 'inline'}; filename="${nombreArchivo.replace(/[^\x20-\x7E]/g, '')}${extension}"; ` +
        `filename*=UTF-8''${encodeURIComponent(nombreArchivo + extension)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return res.send(rows[0].contenido);
  } catch (error) {
    return next(error);
  }
}

router.get('/admin/documentos/:id/ver', requiereSesion, enviarPdf);

// Visor público: la ficha del taller ofrece sus PDF a cualquier visitante, así
// que el mismo envío se expone sin sesión. El documento se busca por id; no se
// listan documentos sueltos ni se exponen los de recetas sin taller.
router.get('/documentos/:id/ver', (req, res, next) => enviarPdf(req, res, next, { publico: true }));

// Descarga del mismo archivo, en la misma pestaña y sin abrir nada nuevo.
router.get('/documentos/:id/descargar', (req, res, next) =>
  enviarPdf(req, res, next, { publico: true, descarga: true })
);

// Miniatura liviana para la galería pública: WebP de 480 px generado al subir.
// Si la foto es anterior a esa columna, se responde con el archivo completo para
// que la tarjeta nunca quede rota. Se cachea una semana: el contenido de un
// documento no cambia (se reemplaza por otro documento).
router.get('/documentos/:id/miniatura', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return next();

    const { rows } = await query(
      `SELECT d.tipo_mime, d.contenido, d.miniatura,
              EXISTS (SELECT 1 FROM taller t
                       WHERE t.id = d.id_taller AND t.publicado AND t.eliminado_en IS NULL)
              OR (d.id_receta IS NOT NULL
                  AND EXISTS (SELECT 1 FROM receta r
                               WHERE r.id = d.id_receta AND r.eliminado_en IS NULL)
                  AND (NOT EXISTS (SELECT 1 FROM receta_taller rt WHERE rt.id_receta = d.id_receta)
                       OR EXISTS (SELECT 1 FROM receta_taller rt
                                    JOIN taller t2 ON t2.id = rt.id_taller
                                   WHERE rt.id_receta = d.id_receta
                                     AND t2.publicado AND t2.eliminado_en IS NULL))) AS visible
         FROM documento d
        WHERE d.id = $1 AND d.eliminado_en IS NULL`,
      [id]
    );

    const fila = rows[0];
    if (!fila || !fila.visible) return next();

    if (fila.miniatura) {
      res.set({
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=604800, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.send(fila.miniatura);
    }

    if (!fila.contenido || !/^image\//.test(fila.tipo_mime || '')) return next();
    res.set({
      'Content-Type': fila.tipo_mime,
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(fila.contenido);
  } catch (error) {
    return next(error);
  }
});

// Una página del PDF convertida en imagen: es lo que permite leer el archivo
// dentro de la receta, porque Chrome en Android no muestra PDF incrustado.
router.get('/documentos/:id/vista.png', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pagina = Math.max(1, Number(req.query.p) || 1);
    if (!Number.isInteger(id) || id < 1) return next();

    const { rows } = await query(
      `SELECT d.tipo_mime, d.contenido,
              EXISTS (SELECT 1 FROM taller t
                       WHERE t.id = d.id_taller AND t.publicado AND t.eliminado_en IS NULL)
              OR (d.id_receta IS NOT NULL
                  AND EXISTS (SELECT 1 FROM receta r
                               WHERE r.id = d.id_receta AND r.eliminado_en IS NULL)
                  AND (NOT EXISTS (SELECT 1 FROM receta_taller rt WHERE rt.id_receta = d.id_receta)
                       OR EXISTS (SELECT 1 FROM receta_taller rt
                                    JOIN taller t2 ON t2.id = rt.id_taller
                                   WHERE rt.id_receta = d.id_receta
                                     AND t2.publicado AND t2.eliminado_en IS NULL))) AS visible
         FROM documento d
        WHERE d.id = $1 AND d.eliminado_en IS NULL`,
      [id]
    );

    if (!rows[0] || !rows[0].contenido || !rows[0].visible) return next();
    if (rows[0].tipo_mime !== 'application/pdf') return next();

    const imagen = await vistaDePagina(id, rows[0].contenido, pagina);
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(imagen);
  } catch (error) {
    return next(error);
  }
});

// Borrar un documento suelto (RF-09): no hay que borrar el taller para quitarlo.
router.post('/admin/documentos/:id/eliminar', requiereRol('admin'), async (req, res, next) => {
  const id = Number(req.params.id) || 0;
  try {
    const { rows } = await query(
      'UPDATE documento SET eliminado_en = now() WHERE id = $1 AND eliminado_en IS NULL RETURNING nombre',
      [id]
    );
    if (!rows[0]) return next();

    await registrar(req.session.usuario.id, 'eliminar', 'documento', id, { nombre: rows[0].nombre });
    const volver = v.destinoSeguro(req.body && req.body.volver, '');
    if (volver) return res.redirect(`${volver}?ok=${encodeURIComponent('Documento enviado a la papelera.')}`);
    res.redirect(`/admin/documentos?ok=${encodeURIComponent('Documento enviado a la papelera.')}`);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
