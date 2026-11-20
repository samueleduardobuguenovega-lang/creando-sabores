// Sitio público: solo lectura, sin necesidad de cuenta.
const express = require('express');
const { query } = require('../src/db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows: resumen } = await query(
      `SELECT COUNT(*)::int AS talleres,
              COUNT(*) FILTER (WHERE estado = 'planificado')::int AS planificados,
              COUNT(*) FILTER (WHERE estado = 'en_ejecucion')::int AS en_ejecucion,
              COUNT(*) FILTER (WHERE estado = 'finalizado')::int AS finalizados
         FROM taller`
    );
    const { rows: recetas } = await query('SELECT COUNT(*)::int AS total FROM receta');
    const { rows: ejecuciones } = await query('SELECT COUNT(*)::int AS total FROM ejecucion');

    // Para el fichero: cada taller con sus dos contadores, agrupable por temática.
    const { rows: talleres } = await query(
      `SELECT t.id, t.nombre, t.tematica, t.descripcion, t.estado, t.fecha_planificada,
              COUNT(DISTINCT e.id)::int AS ejecuciones,
              COUNT(DISTINCT r.id_receta)::int AS recetas,
              (SELECT COALESCE(SUM(e2.cantidad_participantes), 0)::int
                 FROM ejecucion e2 WHERE e2.id_taller = t.id) AS participantes
         FROM taller t
         LEFT JOIN ejecucion e ON e.id_taller = t.id
         LEFT JOIN receta_taller r ON r.id_taller = t.id
        GROUP BY t.id
        ORDER BY t.fecha_planificada DESC NULLS LAST, t.id DESC
        LIMIT 30`
    );

    res.render('publico/inicio', {
      titulo: 'Inicio',
      resumen: resumen[0],
      totalRecetas: recetas[0].total,
      totalEjecuciones: ejecuciones[0].total,
      talleres,
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
              COUNT(DISTINCT r.id_receta)::int AS recetas,
              COUNT(DISTINCT e.id)::int AS ejecuciones,
              (SELECT COALESCE(SUM(e2.cantidad_participantes), 0)::int
                 FROM ejecucion e2 WHERE e2.id_taller = t.id) AS participantes
         FROM taller t
         LEFT JOIN receta_taller r ON r.id_taller = t.id
         LEFT JOIN ejecucion e ON e.id_taller = t.id
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

// El listado público de recetas lo construye Francisco en su tarea (T5).
router.get('/recetas', (req, res) => {
  res.render('pendiente', {
    titulo: 'Recetas',
    responsable: 'Francisco Puelles',
    tarea: 'T5',
    descripcion: 'Buscador y fichas de recetas en PDF para el público.',
  });
});

module.exports = router;
