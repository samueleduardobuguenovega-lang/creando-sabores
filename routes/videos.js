// Registro de videos de YouTube y Vimeo (RF-05 / CU-05).
const express = require('express');
const { query } = require('../src/db');
const { requiereSesion } = require('../src/auth');
const { registrar } = require('../src/auditoria');
const v = require('../src/validaciones');

const router = express.Router();

async function cargarDatos() {
  const [videos, talleres, recetas] = await Promise.all([
    query(
      `SELECT v.id, v.nombre, v.descripcion, v.enlace, v.proveedor,
              COALESCE(t.nombre, r.nombre) AS asociado_a,
              CASE WHEN v.id_taller IS NOT NULL THEN 'Taller' ELSE 'Receta' END AS tipo_asociacion
         FROM video v
         LEFT JOIN taller t ON t.id = v.id_taller
         LEFT JOIN receta r ON r.id = v.id_receta
        ORDER BY v.creado_en DESC, v.id DESC`
    ),
    query('SELECT id, nombre FROM taller ORDER BY nombre'),
    query('SELECT id, codigo, nombre FROM receta ORDER BY nombre'),
  ]);
  return {
    videos: videos.rows.map((video) => {
      const resultado = v.enlaceVideo(video.enlace);
      return {
        ...video,
        embedUrl: resultado.ok ? resultado.embedUrl : null,
        enlaceValidado: resultado.ok ? resultado.valor : null,
      };
    }),
    talleres: talleres.rows,
    recetas: recetas.rows,
  };
}

async function renderListado(req, res, next, { estado = 200, errores = [], valores = {} } = {}) {
  try {
    const datos = await cargarDatos();
    return res.status(estado).render('admin/videos', {
      titulo: 'Videos',
      ...datos,
      errores,
      valores,
    });
  } catch (error) {
    return next(error);
  }
}

router.get('/admin/videos', requiereSesion, (req, res, next) => {
  const destino = typeof req.query.destino === 'string' ? req.query.destino : '';
  return renderListado(req, res, next, {
    valores: /^(taller|receta):\d+$/.test(destino) ? { destino } : {},
  });
});

router.post('/admin/videos', requiereSesion, async (req, res, next) => {
  const cuerpo = req.body || {};
  const nombre = v.texto(cuerpo.nombre, { campo: 'nombre del video', max: 160 });
  const descripcion = v.texto(cuerpo.descripcion, {
    campo: 'descripción',
    max: 2000,
    requerido: false,
  });
  const enlace = v.enlaceVideo(cuerpo.enlace);
  const errores = [];

  if (!nombre.ok) errores.push(nombre.error);
  if (!descripcion.ok) errores.push(descripcion.error);
  if (!enlace.ok) errores.push(enlace.error);

  const destino = /^(taller|receta):([1-9]\d*)$/.exec((cuerpo.destino || '').toString());
  if (!destino) {
    errores.push('Selecciona el taller o la receta a la que pertenece el video.');
  } else {
    const idDestino = Number(destino[2]);
    if (!Number.isSafeInteger(idDestino) || idDestino > 2147483647) {
      errores.push('El taller o la receta seleccionados no son válidos.');
    }
  }

  if (errores.length > 0) {
    return renderListado(req, res, next, { estado: 400, errores, valores: cuerpo });
  }

  try {
    const tabla = destino[1] === 'taller' ? 'taller' : 'receta';
    const idDestino = Number(destino[2]);
    const asociado = await query(`SELECT id FROM ${tabla} WHERE id = $1`, [idDestino]);
    if (!asociado.rows[0]) {
      return renderListado(req, res, next, {
        estado: 400,
        errores: ['El taller o la receta seleccionados ya no existen.'],
        valores: cuerpo,
      });
    }

    const idTaller = destino[1] === 'taller' ? idDestino : null;
    const idReceta = destino[1] === 'receta' ? idDestino : null;
    const { rows } = await query(
      `INSERT INTO video (nombre, descripcion, enlace, proveedor, id_taller, id_receta, id_usuario)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        nombre.valor,
        descripcion.valor,
        enlace.valor,
        enlace.proveedor,
        idTaller,
        idReceta,
        req.session.usuario.id,
      ]
    );
    await registrar(req.session.usuario.id, 'crear', 'video', rows[0].id, {
      nombre: nombre.valor,
      proveedor: enlace.proveedor,
    });
    return res.redirect(`/admin/videos?ok=${encodeURIComponent('Video registrado correctamente.')}`);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
