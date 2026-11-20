// Sitio público: solo lectura, sin necesidad de cuenta.
const express = require('express');
const { query } = require('../src/db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows: resumen } = await query(
      `SELECT COUNT(*)::int AS talleres,
              COUNT(*) FILTER (WHERE estado = 'finalizado')::int AS finalizados
         FROM taller`
    );
    const { rows: recetas } = await query('SELECT COUNT(*)::int AS total FROM receta');
    const { rows: ultimos } = await query(
      `SELECT t.id, t.nombre, t.tematica, t.estado, t.fecha_planificada,
              COUNT(e.id)::int AS ejecuciones
         FROM taller t
         LEFT JOIN ejecucion e ON e.id_taller = t.id
        GROUP BY t.id
        ORDER BY t.creado_en DESC
        LIMIT 3`
    );

    res.render('publico/inicio', {
      titulo: 'Inicio',
      resumen: resumen[0],
      totalRecetas: recetas[0].total,
      ultimos,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/talleres', async (req, res, next) => {
  try {
    const anio = /^\d{4}$/.test((req.query.anio ?? '').toString()) ? req.query.anio : null;

    const { rows: anios } = await query(
      `SELECT DISTINCT EXTRACT(YEAR FROM fecha_planificada)::int AS anio
         FROM taller WHERE fecha_planificada IS NOT NULL
        ORDER BY anio DESC`
    );

    const { rows: talleres } = await query(
      `SELECT t.id, t.nombre, t.tematica, t.descripcion, t.estado, t.fecha_planificada,
              COUNT(DISTINCT r.id_receta)::int AS recetas
         FROM taller t
         LEFT JOIN receta_taller r ON r.id_taller = t.id
        WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM t.fecha_planificada) = $1)
        GROUP BY t.id
        ORDER BY t.fecha_planificada DESC NULLS LAST, t.id DESC`,
      [anio ? Number(anio) : null]
    );

    res.render('publico/talleres', { titulo: 'Talleres', talleres, anios, anio });
  } catch (error) {
    next(error);
  }
});

router.get('/ejecuciones', async (req, res, next) => {
  try {
    const { rows: ejecuciones } = await query(
      `SELECT e.id, e.fecha_ejecucion, e.cantidad_participantes, e.observaciones,
              t.nombre AS taller, t.tematica
         FROM ejecucion e
         JOIN taller t ON t.id = e.id_taller
        ORDER BY e.fecha_ejecucion DESC, e.id DESC
        LIMIT 50`
    );
    res.render('publico/ejecuciones', { titulo: 'Ejecuciones', ejecuciones });
  } catch (error) {
    next(error);
  }
});

router.get('/recetas', async (req, res, next) => {
  try {
    const busqueda = (req.query.q ?? '').toString().trim();
    const { rows: recetas } = await query(
      `SELECT r.id, r.codigo, r.nombre, r.descripcion, r.enlace_pdf,
              COUNT(DISTINCT rt.id_taller)::int AS talleres
         FROM receta r
         LEFT JOIN receta_taller rt ON rt.id_receta = r.id
        WHERE ($1 = '' OR r.codigo ILIKE '%' || $1 || '%' OR r.nombre ILIKE '%' || $1 || '%')
        GROUP BY r.id
        ORDER BY r.nombre, r.codigo`,
      [busqueda]
    );

    res.render('publico/recetas', { titulo: 'Recetas', recetas, busqueda });
  } catch (error) {
    next(error);
  }
});

router.get('/recetas/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return next();

    const { rows: recetas } = await query(
      `SELECT id, codigo, nombre, descripcion, enlace_pdf
         FROM receta
        WHERE id = $1`,
      [id]
    );
    const receta = recetas[0];
    if (!receta) return next();

    const { rows: talleres } = await query(
      `SELECT t.id, t.nombre, t.tematica, t.descripcion, t.fecha_planificada, t.estado
         FROM taller t
         JOIN receta_taller rt ON rt.id_taller = t.id
        WHERE rt.id_receta = $1
        ORDER BY t.fecha_planificada DESC NULLS LAST, t.nombre`,
      [id]
    );

    res.render('publico/receta-detalle', {
      titulo: receta.nombre,
      receta,
      talleres,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
