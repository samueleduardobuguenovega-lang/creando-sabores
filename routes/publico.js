// Sitio público: solo lectura, sin necesidad de cuenta.
const express = require('express');
const { query } = require('../src/db');
const { enlaceVideo } = require('../src/validaciones');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows: resumen } = await query(
      `SELECT COUNT(*)::int AS talleres,
              COUNT(DISTINCT tematica)::int AS tematicas,
              COUNT(*) FILTER (WHERE estado = 'planificado')::int AS planificados,
              COUNT(*) FILTER (WHERE estado = 'en_ejecucion')::int AS en_ejecucion,
              COUNT(*) FILTER (WHERE estado = 'finalizado')::int AS finalizados
         FROM taller
        WHERE publicado AND eliminado_en IS NULL`
    );
    const { rows: recetas } = await query('SELECT COUNT(*)::int AS total FROM receta WHERE eliminado_en IS NULL');
    const { rows: ejecuciones } = await query(
      `SELECT COUNT(*)::int AS total
         FROM ejecucion e
         JOIN taller t ON t.id = e.id_taller
        WHERE t.publicado AND t.eliminado_en IS NULL AND e.eliminado_en IS NULL`
    );

    // Para el fichero: cada taller con sus dos contadores, agrupable por temática.
    const { rows: talleres } = await query(
      `SELECT t.id, t.nombre, t.tematica, t.descripcion, t.estado, t.fecha_planificada,
              COUNT(DISTINCT e.id)::int AS ejecuciones,
              COUNT(DISTINCT r.id_receta)::int AS recetas,
              (SELECT COALESCE(SUM(e2.cantidad_participantes), 0)::int
                 FROM ejecucion e2 WHERE e2.id_taller = t.id) AS participantes,
              (SELECT d.id FROM documento d
                WHERE d.id_taller = t.id AND d.tipo_mime LIKE 'image/%'
                ORDER BY d.id LIMIT 1) AS id_imagen
         FROM taller t
         LEFT JOIN ejecucion e ON e.id_taller = t.id AND e.eliminado_en IS NULL
         LEFT JOIN receta_taller r ON r.id_taller = t.id
        WHERE t.publicado AND t.eliminado_en IS NULL
        GROUP BY t.id
        ORDER BY t.tematica, t.fecha_planificada DESC NULLS LAST, t.id DESC`
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
    const tematica = (req.query.tematica ?? '').toString().trim() || null;
    const estado = ['planificado', 'en_ejecucion', 'finalizado'].includes(req.query.estado)
      ? req.query.estado
      : null;
    // Filtro por año escolar: es la forma en que el colegio busca ("lo de 2026").
    const anio = /^\d{4}$/.test(req.query.anio || '') ? Number(req.query.anio) : null;

    const { rows: tematicas } = await query(
      `SELECT t.tematica, COUNT(*)::int AS total
         FROM taller t
        WHERE t.publicado AND t.eliminado_en IS NULL
        GROUP BY t.tematica
        ORDER BY t.tematica`
    );

    const { rows: talleres } = await query(
      `SELECT t.id, t.nombre, t.tematica, t.descripcion, t.estado, t.fecha_planificada,
              COUNT(DISTINCT r.id_receta)::int AS recetas,
              COUNT(DISTINCT e.id)::int AS ejecuciones,
              (SELECT COALESCE(SUM(e2.cantidad_participantes), 0)::int
                 FROM ejecucion e2 WHERE e2.id_taller = t.id) AS participantes,
              (SELECT d.id FROM documento d
                WHERE d.id_taller = t.id AND d.tipo_mime LIKE 'image/%'
                ORDER BY d.id LIMIT 1) AS id_imagen
         FROM taller t
         LEFT JOIN receta_taller r ON r.id_taller = t.id
         LEFT JOIN ejecucion e ON e.id_taller = t.id
        WHERE t.publicado AND t.eliminado_en IS NULL
          AND ($1::text IS NULL OR t.tematica = $1)
          AND ($2::text IS NULL OR t.estado = $2)
          AND ($3::int IS NULL OR EXTRACT(YEAR FROM t.fecha_planificada) = $3)
        GROUP BY t.id
        ORDER BY t.tematica, t.fecha_planificada DESC NULLS LAST, t.id DESC`,
      [tematica, estado, anio]
    );

    const { rows: anios } = await query(
      `SELECT DISTINCT EXTRACT(YEAR FROM t.fecha_planificada)::int AS anio
         FROM taller t
        WHERE t.publicado AND t.eliminado_en IS NULL AND t.fecha_planificada IS NOT NULL
        ORDER BY anio DESC`
    );

    res.render('publico/talleres', {
      titulo: 'Talleres',
      talleres,
      tematicas,
      tematica,
      estado,
      anio,
      anios: anios.map((fila) => fila.anio),
      total: talleres.length,
    });
  } catch (error) {
    next(error);
  }
});

// Ficha pública de un taller: lo que un visitante ve al abrir una carpeta del
// fichero. Muestra el resumen, las recetas asociadas, los PDF y videos, y las
// ejecuciones registradas. Todo en solo lectura y sin pedir cuenta.
router.get('/talleres/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return next();

    const { rows: talleres } = await query(
      `SELECT t.id, t.nombre, t.tematica, t.descripcion, t.estado, t.fecha_planificada,
              u.nombre AS responsable
         FROM taller t
         JOIN usuario u ON u.id = t.id_usuario
        WHERE t.id = $1 AND t.publicado AND t.eliminado_en IS NULL`,
      [id]
    );
    const taller = talleres[0];
    if (!taller) return next();

    const [recetas, documentos, videos, ejecuciones] = await Promise.all([
      query(
        `SELECT r.id, r.codigo, r.nombre, r.descripcion, r.enlace_pdf
           FROM receta r
           JOIN receta_taller rt ON rt.id_receta = r.id
          WHERE rt.id_taller = $1
          ORDER BY r.nombre, r.codigo`,
        [id]
      ),
      query(
        `SELECT id, nombre, archivo, tamano, tipo_mime
           FROM documento
          WHERE id_taller = $1
          ORDER BY creado_en, id`,
        [id]
      ),
      query(
        `SELECT id, nombre, descripcion, enlace
           FROM video
          WHERE id_taller = $1
          ORDER BY creado_en, id`,
        [id]
      ),
      query(
        `SELECT id, fecha_ejecucion, cantidad_participantes, observaciones
           FROM ejecucion
          WHERE id_taller = $1
          ORDER BY fecha_ejecucion DESC, id DESC`,
        [id]
      ),
    ]);

    const videosConReproductor = videos.rows.map((video) => {
      const resultado = enlaceVideo(video.enlace);
      return {
        ...video,
        embedUrl: resultado.ok ? resultado.embedUrl : null,
      };
    });

    const participantes = ejecuciones.rows.reduce(
      (total, ejecucion) => total + ejecucion.cantidad_participantes,
      0
    );

    res.render('publico/taller-detalle', {
      titulo: taller.nombre,
      taller,
      participantes,
      recetas: recetas.rows,
      documentos: documentos.rows,
      videos: videosConReproductor,
      ejecuciones: ejecuciones.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/ejecuciones', async (req, res, next) => {
  try {
    const { rows: ejecuciones } = await query(
      `SELECT e.id, e.id_taller, e.fecha_ejecucion, e.cantidad_participantes, e.observaciones,
              t.nombre AS taller, t.tematica
         FROM ejecucion e
         JOIN taller t ON t.id = e.id_taller
        WHERE t.publicado AND t.eliminado_en IS NULL AND e.eliminado_en IS NULL
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
              COUNT(DISTINCT rt.id_taller)::int AS talleres,
              STRING_AGG(DISTINCT t.nombre, ' · ') AS talleres_nombres,
              (SELECT d.id FROM documento d
                WHERE d.id_receta = r.id AND d.tipo_mime LIKE 'image/%'
                ORDER BY d.id LIMIT 1) AS id_imagen
         FROM receta r
         LEFT JOIN receta_taller rt ON rt.id_receta = r.id
         LEFT JOIN taller t ON t.id = rt.id_taller
        WHERE ($1 = '' OR r.codigo ILIKE '%' || $1 || '%' OR r.nombre ILIKE '%' || $1 || '%'
               OR r.descripcion ILIKE '%' || $1 || '%')
          AND (NOT EXISTS (SELECT 1 FROM receta_taller rt2 WHERE rt2.id_receta = r.id)
               OR EXISTS (SELECT 1 FROM receta_taller rt3
                            JOIN taller t3 ON t3.id = rt3.id_taller
                           WHERE rt3.id_receta = r.id AND t3.publicado AND t3.eliminado_en IS NULL))
        GROUP BY r.id
        ORDER BY r.nombre, r.codigo`,
      [busqueda.length >= 2 ? busqueda.replace(/[\\%_]/g, '\\$&') : '']
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
      `SELECT r.id, r.codigo, r.nombre, r.descripcion, r.enlace_pdf,
              r.creado_en::date AS creado_en, u.nombre AS autor
         FROM receta r
         JOIN usuario u ON u.id = r.id_usuario
        WHERE r.id = $1`,
      [id]
    );
    const receta = recetas[0];
    if (!receta) return next();

    // Una receta sin talleres es del catálogo y se muestra; si está vinculada,
    // sigue la suerte de sus talleres y se oculta cuando ninguno está publicado.
    const { rows: visibles } = await query(
      `SELECT COUNT(*)::int AS publicados
         FROM receta_taller rt
         JOIN taller t ON t.id = rt.id_taller
        WHERE rt.id_receta = $1 AND t.publicado AND t.eliminado_en IS NULL`,
      [id]
    );
    const { rows: vinculos } = await query('SELECT COUNT(*)::int AS total FROM receta_taller WHERE id_receta = $1', [id]);
    if (vinculos[0].total > 0 && visibles[0].publicados === 0) return next();

    const { rows: documentos } = await query(
      `SELECT id, nombre, archivo, tamano, tipo_mime
         FROM documento
        WHERE id_receta = $1
        ORDER BY creado_en, id`,
      [id]
    );

    const { rows: talleres } = await query(
      `SELECT t.id, t.nombre, t.tematica, t.descripcion, t.fecha_planificada, t.estado
         FROM taller t
         JOIN receta_taller rt ON rt.id_taller = t.id
        WHERE rt.id_receta = $1 AND t.publicado AND t.eliminado_en IS NULL
        ORDER BY t.fecha_planificada DESC NULLS LAST, t.nombre`,
      [id]
    );

    res.render('publico/receta-detalle', {
      titulo: receta.nombre,
      receta,
      documentos,
      talleres,
    });
  } catch (error) {
    next(error);
  }
});

// Buscador del sitio: una sola caja que cubre talleres, recetas, documentos y
// videos. Devuelve grupos con enlace directo; el término se escapa en la vista.
router.get('/buscar', async (req, res, next) => {
  try {
    const termino = (req.query.q ?? '').toString().trim().slice(0, 80);
    // Sin esto, buscar "%" o "_" devuelve el archivo completo: son comodines de LIKE.
    const literal = termino.replace(/[\\%_]/g, '\\$&');
    const patron = termino ? `%${literal}%` : null;

    const [talleres, recetas, documentos, videos] = await Promise.all([
      query(
        `SELECT id, nombre, tematica, estado
           FROM taller
          WHERE $1::text IS NOT NULL
            AND (nombre ILIKE $1 OR tematica ILIKE $1 OR descripcion ILIKE $1)
          ORDER BY tematica, nombre
          LIMIT 20`,
        [patron]
      ),
      query(
        `SELECT id, codigo, nombre, descripcion
           FROM receta
          WHERE $1::text IS NOT NULL
            AND (codigo ILIKE $1 OR nombre ILIKE $1 OR descripcion ILIKE $1)
          ORDER BY nombre
          LIMIT 20`,
        [patron]
      ),
      query(
        `SELECT d.id, d.nombre, d.tipo_mime, COALESCE(t.nombre, r.nombre) AS asociado_a,
                CASE WHEN d.id_taller IS NOT NULL THEN '/talleres/' || d.id_taller
                     ELSE '/recetas/' || d.id_receta END AS destino
           FROM documento d
           LEFT JOIN taller t ON t.id = d.id_taller
           LEFT JOIN receta r ON r.id = d.id_receta
          WHERE $1::text IS NOT NULL AND d.nombre ILIKE $1
          ORDER BY d.nombre
          LIMIT 20`,
        [patron]
      ),
      query(
        `SELECT v.id, v.nombre, v.descripcion, COALESCE(t.nombre, r.nombre) AS asociado_a,
                CASE WHEN v.id_taller IS NOT NULL THEN '/talleres/' || v.id_taller
                     ELSE '/recetas/' || v.id_receta END AS destino
           FROM video v
           LEFT JOIN taller t ON t.id = v.id_taller
           LEFT JOIN receta r ON r.id = v.id_receta
          WHERE $1::text IS NOT NULL
            AND (v.nombre ILIKE $1 OR v.descripcion ILIKE $1)
          ORDER BY v.nombre
          LIMIT 20`,
        [patron]
      ),
    ]);

    const total = talleres.rows.length + recetas.rows.length + documentos.rows.length + videos.rows.length;

    res.render('publico/buscar', {
      titulo: 'Buscar',
      termino,
      total,
      talleres: talleres.rows,
      recetas: recetas.rows,
      documentos: documentos.rows,
      videos: videos.rows,
    });
  } catch (error) {
    next(error);
  }
});

// Índice público de videos: una entrada para revisar todo lo grabado.
router.get('/videos', async (req, res, next) => {
  try {
    const { rows: videos } = await query(
      `SELECT v.id, v.nombre, v.descripcion, v.enlace, v.id_taller, v.id_receta,
              t.nombre AS taller, t.tematica, r.nombre AS receta
         FROM video v
         LEFT JOIN taller t ON t.id = v.id_taller
         LEFT JOIN receta r ON r.id = v.id_receta
        ORDER BY v.creado_en DESC, v.id DESC`
    );

    res.render('publico/videos', {
      titulo: 'Videos',
      videos: videos.map((video) => {
        const resultado = enlaceVideo(video.enlace);
        return {
          ...video,
          embedUrl: resultado.ok ? resultado.embedUrl : null,
          destino: video.id_taller ? `/talleres/${video.id_taller}` : `/recetas/${video.id_receta}`,
          asociado: video.taller || video.receta,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

// Índice público de documentos PDF, con su taller o receta de origen.
router.get('/documentos', async (req, res, next) => {
  try {
    const { rows: documentos } = await query(
      `SELECT d.id, d.nombre, d.tamano, d.tipo_mime, d.id_taller, d.id_receta,
              t.nombre AS taller, t.tematica, r.nombre AS receta, r.codigo
         FROM documento d
         LEFT JOIN taller t ON t.id = d.id_taller
         LEFT JOIN receta r ON r.id = d.id_receta
        ORDER BY d.creado_en DESC, d.id DESC`
    );

    res.render('publico/documentos', {
      titulo: 'Documentos',
      documentos: documentos.map((documento) => ({
        ...documento,
        destino: documento.id_taller ? `/talleres/${documento.id_taller}` : `/recetas/${documento.id_receta}`,
        asociado: documento.taller || documento.receta,
      })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
