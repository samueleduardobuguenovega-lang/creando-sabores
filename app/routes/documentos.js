// Gestión privada de documentos PDF (RF-05 / CU-05).
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { query } = require('../src/db');
const { requiereSesion } = require('../src/auth');
const { registrar } = require('../src/auditoria');
const v = require('../src/validaciones');

const router = express.Router();
const TAMANO_MAXIMO = 10 * 1024 * 1024;
const MIME_PDF = 'application/pdf';
const carga = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO, files: 1 },
  fileFilter: (req, archivo, callback) => {
    if (!/\.pdf$/i.test(archivo.originalname)) {
      return callback(new Error('Solo se permiten archivos PDF.'));
    }
    callback(null, true);
  },
});

async function cargarDatos() {
  const [documentos, talleres, recetas] = await Promise.all([
    query(
      `SELECT d.id, d.nombre, d.archivo, d.tamano, d.creado_en,
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

router.get('/admin/documentos', requiereSesion, (req, res, next) => renderListado(req, res, next));

router.post('/admin/documentos', requiereSesion, (req, res, next) => {
  carga.single('archivo')(req, res, async (errorCarga) => {
    if (errorCarga) {
      const mensaje = errorCarga instanceof multer.MulterError && errorCarga.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el tamaño máximo de 10 MB.'
        : errorCarga.message === 'Solo se permiten archivos PDF.'
          ? errorCarga.message
          : 'No se pudo procesar el archivo. Selecciona un PDF de hasta 10 MB.';
      return renderListado(req, res, next, {
        estado: 400,
        errores: [mensaje],
        valores: req.body || {},
      });
    }

    try {
      const cuerpo = req.body || {};
      const nombre = v.texto(cuerpo.nombre, { campo: 'nombre del documento', max: 160 });
      const errores = [];
      if (!nombre.ok) errores.push(nombre.error);

      const destino = /^(taller|receta):([1-9]\d*)$/.exec((cuerpo.destino || '').toString());
      if (!destino) {
        errores.push('Selecciona el taller o la receta a la que pertenece el documento.');
      }
      if (!req.file) {
        errores.push('Selecciona un archivo PDF.');
      } else if (req.file.buffer.length < 5 || req.file.buffer.subarray(0, 5).toString() !== '%PDF-') {
        errores.push('El contenido del archivo no corresponde a un PDF válido.');
      }
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

      const archivo = `${crypto.randomUUID()}.pdf`;
      const idTaller = destino[1] === 'taller' ? idDestino : null;
      const idReceta = destino[1] === 'receta' ? idDestino : null;
      const { rows } = await query(
        `INSERT INTO documento (nombre, archivo, tipo_mime, tamano, contenido, id_taller, id_receta, id_usuario)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          nombre.valor,
          archivo,
          MIME_PDF,
          req.file.size,
          req.file.buffer,
          idTaller,
          idReceta,
          req.session.usuario.id,
        ]
      );
      await registrar(req.session.usuario.id, 'crear', 'documento', rows[0].id, {
        nombre: nombre.valor,
        archivo,
      });
      return res.redirect(`/admin/documentos?ok=${encodeURIComponent('Documento PDF subido correctamente.')}`);
    } catch (error) {
      return next(error);
    }
  });
});

router.get('/admin/documentos/:id/ver', requiereSesion, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return next();

    const { rows } = await query(
      'SELECT archivo, contenido FROM documento WHERE id = $1',
      [id]
    );
    if (!rows[0] || !rows[0].contenido) {
      return res.status(404).render('error', {
        titulo: 'Documento no encontrado',
        mensaje: 'Ese documento no existe o fue eliminado.',
        detalle: 'Vuelve al apartado de documentos.',
      });
    }

    res.set({
      'Content-Type': MIME_PDF,
      'Content-Disposition': `inline; filename="${rows[0].archivo}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return res.send(rows[0].contenido);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
