// Gestión privada de documentos PDF (RF-05 / CU-05).
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { pool, query } = require('../src/db');
const { requiereSesion } = require('../src/auth');
const { registrar } = require('../src/auditoria');
const v = require('../src/validaciones');
const archivos = require('../src/archivos');

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

async function cargarDatos() {
  const [documentos, talleres, recetas] = await Promise.all([
    query(
      `SELECT d.id, d.nombre, d.archivo, d.tamano, d.tipo_mime, d.creado_en,
              COALESCE(t.nombre, r.nombre) AS asociado_a,
              CASE WHEN d.id_taller IS NOT NULL THEN 'Taller' ELSE 'Receta' END AS tipo_asociacion
         FROM documento d
         LEFT JOIN taller t ON t.id = d.id_taller
         LEFT JOIN receta r ON r.id = d.id_receta
        ORDER BY d.creado_en DESC, d.id DESC`
    ),
    query('SELECT id, nombre FROM taller ORDER BY nombre'),
    query('SELECT id, codigo, nombre FROM receta ORDER BY nombre'),
  ]);
  return { documentos: documentos.rows, talleres: talleres.rows, recetas: recetas.rows };
}

async function renderListado(req, res, next, { estado = 200, errores = [], valores = {} } = {}) {
  try {
    const datos = await cargarDatos();
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
              ? `«${archivo.originalname}» no es un PDF válido.`
              : `«${archivo.originalname}» no es una imagen válida.`
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
      const asociado = await query(`SELECT id FROM ${tabla} WHERE id = $1`, [idDestino]);
      if (!asociado.rows[0]) {
        return renderListado(req, res, next, {
          estado: 400,
          errores: ['El taller o la receta seleccionados ya no existen.'],
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
        optimizados.push({
          ...optimizado,
          nombre: nombreBase,
          archivo: `${crypto.randomUUID()}${optimizado.extension}`,
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
            `INSERT INTO documento (nombre, archivo, tipo_mime, tamano, contenido, id_taller, id_receta, id_usuario)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
              optimizado.nombre,
              optimizado.archivo,
              optimizado.tipoMime,
              optimizado.buffer.length,
              optimizado.buffer,
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
      return res.redirect(`/admin/documentos?ok=${encodeURIComponent(mensaje)}`);
    } catch (error) {
      return next(error);
    }
  });
});

async function enviarPdf(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return next();

    const { rows } = await query(
      'SELECT nombre, archivo, tipo_mime, contenido FROM documento WHERE id = $1',
      [id]
    );
    if (!rows[0] || !rows[0].contenido) {
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
      'Content-Disposition':
        `inline; filename="${nombreArchivo.replace(/[^\x20-\x7E]/g, '')}${extension}"; ` +
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
router.get('/documentos/:id/ver', enviarPdf);

module.exports = router;
