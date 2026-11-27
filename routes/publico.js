// Sitio público: solo lectura, sin necesidad de cuenta.
//
// Regla que cruza todo este archivo: lo que está en la papelera (eliminado_en)
// o sin publicar no existe para el visitante. Se filtra en cada consulta, no
// solo en las listas: un documento de un taller oculto tampoco se descarga.
const express = require('express');
const { query } = require('../src/db');
const { contarPaginas } = require('../src/pdf');
const { enlaceVideo } = require('../src/validaciones');
const { creadorDeUrls, chip } = require('../src/facetas');

const router = express.Router();

// Un video o documento cuelga de un taller o de una receta. Es visible cuando su
// padre está vivo y, además, publicado y visible como el resto del sitio: la
// receta cuenta como visible si no cuelga de ningún taller o si al menos uno de
// sus talleres está publicado.
const PADRE_VISIBLE = `
  ((d.id_taller IS NOT NULL AND EXISTS (
      SELECT 1 FROM taller t WHERE t.id = d.id_taller AND t.publicado AND t.eliminado_en IS NULL))
   OR (d.id_receta IS NOT NULL AND EXISTS (
      SELECT 1 FROM receta r WHERE r.id = d.id_receta AND r.eliminado_en IS NULL)
      AND (NOT EXISTS (SELECT 1 FROM receta_taller rt WHERE rt.id_receta = d.id_receta)
           OR EXISTS (SELECT 1 FROM receta_taller rt
                        JOIN taller t2 ON t2.id = rt.id_taller
                       WHERE rt.id_receta = d.id_receta AND t2.publicado AND t2.eliminado_en IS NULL))))`;

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
              (SELECT COUNT(*)::int
                 FROM receta_taller rt
                 JOIN receta r ON r.id = rt.id_receta
                WHERE rt.id_taller = t.id AND r.eliminado_en IS NULL) AS recetas,
              (SELECT COALESCE(SUM(e2.cantidad_participantes), 0)::int
                 FROM ejecucion e2
                WHERE e2.id_taller = t.id AND e2.eliminado_en IS NULL) AS participantes,
              (SELECT d.id FROM documento d
                WHERE d.id_taller = t.id AND d.tipo_mime LIKE 'image/%' AND d.eliminado_en IS NULL
                ORDER BY d.id LIMIT 1) AS id_imagen
         FROM taller t
         LEFT JOIN ejecucion e ON e.id_taller = t.id AND e.eliminado_en IS NULL
        WHERE t.publicado AND t.eliminado_en IS NULL
        GROUP BY t.id
        ORDER BY t.tematica, t.fecha_planificada DESC NULLS LAST, t.id DESC`
    );

    // El plato que gira en la portada: recetas con foto propia, las últimas
    // primero, para que la etiqueta «En el fuego» no se quede siempre en la
    // misma y cada visita lleve a una receta distinta. Solo entran las que el
    // visitante puede abrir: sin papelera y con al menos un taller publicado
    // si está vinculada a alguno.
    const { rows: enElFuego } = await query(
      `SELECT r.id, r.nombre,
              (SELECT d.id FROM documento d
                WHERE d.id_receta = r.id
                  AND d.eliminado_en IS NULL
                  AND d.tipo_mime LIKE 'image/%'
                ORDER BY d.id
                LIMIT 1) AS id_imagen
         FROM receta r
        WHERE r.eliminado_en IS NULL
          AND EXISTS (SELECT 1 FROM documento d
                       WHERE d.id_receta = r.id
                         AND d.eliminado_en IS NULL
                         AND d.tipo_mime LIKE 'image/%')
          AND (NOT EXISTS (SELECT 1 FROM receta_taller rt WHERE rt.id_receta = r.id)
               OR EXISTS (SELECT 1 FROM receta_taller rt2
                            JOIN taller t ON t.id = rt2.id_taller
                           WHERE rt2.id_receta = r.id AND t.publicado AND t.eliminado_en IS NULL))
        ORDER BY r.id DESC
        LIMIT 12`
    );

    res.render('publico/inicio', {
      titulo: 'Inicio',
      resumen: resumen[0],
      totalRecetas: recetas[0].total,
      totalEjecuciones: ejecuciones[0].total,
      talleres,
      enElFuego,
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
              (SELECT COUNT(*)::int
                 FROM receta_taller rt
                 JOIN receta r ON r.id = rt.id_receta
                WHERE rt.id_taller = t.id AND r.eliminado_en IS NULL) AS recetas,
              COUNT(DISTINCT e.id)::int AS ejecuciones,
              (SELECT COALESCE(SUM(e2.cantidad_participantes), 0)::int
                 FROM ejecucion e2
                WHERE e2.id_taller = t.id AND e2.eliminado_en IS NULL) AS participantes,
              (SELECT d.id FROM documento d
                WHERE d.id_taller = t.id AND d.tipo_mime LIKE 'image/%' AND d.eliminado_en IS NULL
                ORDER BY d.id LIMIT 1) AS id_imagen
         FROM taller t
         LEFT JOIN ejecucion e ON e.id_taller = t.id AND e.eliminado_en IS NULL
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
        `SELECT r.id, r.codigo, r.nombre, r.descripcion, r.enlace_pdf,
                foto.id AS foto_id, foto.es_imagen AS foto_es_imagen
           FROM receta r
           JOIN receta_taller rt ON rt.id_receta = r.id
           LEFT JOIN LATERAL (
                SELECT d.id, (d.tipo_mime LIKE 'image/%') AS es_imagen
                  FROM documento d
                 WHERE d.id_receta = r.id
                   AND d.eliminado_en IS NULL
                   AND d.tipo_mime LIKE 'image/%'
                 ORDER BY d.creado_en, d.id
                 LIMIT 1
           ) foto ON true
          WHERE rt.id_taller = $1 AND r.eliminado_en IS NULL
          ORDER BY r.nombre, r.codigo`,
        [id]
      ),
      query(
        `SELECT id, nombre, archivo, tamano, tipo_mime
           FROM documento
          WHERE id_taller = $1 AND eliminado_en IS NULL
          ORDER BY creado_en, id`,
        [id]
      ),
      query(
        `SELECT id, nombre, descripcion, enlace
           FROM video
          WHERE id_taller = $1 AND eliminado_en IS NULL
          ORDER BY creado_en, id`,
        [id]
      ),
      query(
        `SELECT e.id, e.fecha_ejecucion, e.cantidad_participantes, e.observaciones,
                v.nombre AS video
           FROM ejecucion e
           LEFT JOIN video v ON v.id = e.id_video AND v.eliminado_en IS NULL
          WHERE e.id_taller = $1 AND e.eliminado_en IS NULL
          ORDER BY e.fecha_ejecucion DESC, e.id DESC`,
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

    // La foto del taller es la que aparece al compartir su enlace.
    const fotoTaller = documentos.rows.find((documento) => documento.tipo_mime.startsWith('image/'));
    res.locals.ogTitulo = `${taller.nombre} · taller de Creando Sabores`;
    res.locals.ogDescripcion = (
      taller.descripcion || 'Un taller del archivo de cocina del Colegio Urbano Yungay.'
    ).slice(0, 180);
    if (fotoTaller) {
      res.locals.ogImagen = `/documentos/${fotoTaller.id}/ver`;
      res.locals.ogImagenAlt = `Foto del taller ${taller.nombre}`;
    }

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
    const idTaller = /^\d+$/.test(req.query.taller || '') ? Number(req.query.taller) : null;
    const anio = /^\d{4}$/.test(req.query.anio || '') ? Number(req.query.anio) : null;

    const { rows: ejecuciones } = await query(
      `SELECT e.id, e.id_taller, e.fecha_ejecucion, e.cantidad_participantes, e.observaciones,
              t.nombre AS taller, t.tematica
         FROM ejecucion e
         JOIN taller t ON t.id = e.id_taller
        WHERE t.publicado AND t.eliminado_en IS NULL AND e.eliminado_en IS NULL
          AND ($1::int IS NULL OR e.id_taller = $1)
          AND ($2::int IS NULL OR EXTRACT(YEAR FROM e.fecha_ejecucion)::int = $2)
        ORDER BY e.fecha_ejecucion DESC, e.id DESC
        LIMIT 50`,
      [idTaller, anio]
    );

    const { rows: talleres } = await query(
      `SELECT id, nombre FROM taller WHERE publicado AND eliminado_en IS NULL ORDER BY nombre`
    );
    const { rows: anios } = await query(
      `SELECT DISTINCT EXTRACT(YEAR FROM e.fecha_ejecucion)::int AS anio
         FROM ejecucion e JOIN taller t ON t.id = e.id_taller
        WHERE t.publicado AND t.eliminado_en IS NULL AND e.eliminado_en IS NULL
        ORDER BY anio DESC`
    );

    const urlFiltro = creadorDeUrls('/ejecuciones', { taller: idTaller, anio });
    const chips = [];
    if (idTaller) {
      const elegido = talleres.find((fila) => fila.id === idTaller);
      chips.push(chip(`Taller: ${elegido ? elegido.nombre : '#' + idTaller}`, urlFiltro({ taller: '' })));
    }
    if (anio) chips.push(chip(`Año: ${anio}`, urlFiltro({ anio: '' })));

    res.render('publico/ejecuciones', {
      titulo: 'Ejecuciones',
      ejecuciones,
      talleres,
      anios: anios.map((fila) => fila.anio),
      idTaller,
      anio,
      urlFiltro,
      chips,
      total: ejecuciones.length,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/recetas', async (req, res, next) => {
  try {
    // Un solo campo de búsqueda, en lenguaje natural: nombre, descripción, el
    // taller donde se preparó o el nombre de su archivo. Sin listas fijas de
    // talleres ni filtros por tipo de archivo: eso no escala a cien recetas y
    // los archivos se buscan a través de la receta que los contiene.
    const busqueda = (req.query.q ?? '').toString().trim();
    const patron = busqueda.length >= 2 ? busqueda.replace(/[\\%_]/g, '\\$&') : '';
    const { rows: recetas } = await query(
      `SELECT r.id, r.codigo, r.nombre, r.descripcion, r.enlace_pdf,
              COUNT(DISTINCT t.id)::int AS talleres,
              STRING_AGG(DISTINCT t.nombre, ' · ') AS talleres_nombres,
              (SELECT COUNT(*) FROM documento d0
                WHERE d0.id_receta = r.id AND d0.eliminado_en IS NULL)::int AS archivos,
              MIN(vista.id)::int AS id_imagen, bool_or(vista.es_imagen) AS imagen_es_imagen
         FROM receta r
         LEFT JOIN LATERAL (
              SELECT d.id, (d.tipo_mime LIKE 'image/%') AS es_imagen
                FROM documento d
               WHERE d.id_receta = r.id
                 AND d.eliminado_en IS NULL
                 AND d.tipo_mime LIKE 'image/%'
               ORDER BY d.id
               LIMIT 1
         ) vista ON true
         LEFT JOIN receta_taller rt ON rt.id_receta = r.id
         LEFT JOIN taller t ON t.id = rt.id_taller AND t.publicado AND t.eliminado_en IS NULL
        WHERE r.eliminado_en IS NULL
          AND ($1 = ''
               OR translate(lower(r.nombre), 'áéíóúüñ', 'aeiouun') LIKE '%' || translate(lower($1), 'áéíóúüñ', 'aeiouun') || '%'
               OR translate(lower(r.descripcion), 'áéíóúüñ', 'aeiouun') LIKE '%' || translate(lower($1), 'áéíóúüñ', 'aeiouun') || '%'
               OR EXISTS (SELECT 1 FROM receta_taller rt5
                            JOIN taller t5 ON t5.id = rt5.id_taller
                           WHERE rt5.id_receta = r.id
                             AND translate(lower(t5.nombre), 'áéíóúüñ', 'aeiouun') LIKE '%' || translate(lower($1), 'áéíóúüñ', 'aeiouun') || '%')
               OR EXISTS (SELECT 1 FROM documento d4
                           WHERE d4.id_receta = r.id AND d4.eliminado_en IS NULL
                             AND translate(lower(d4.nombre), 'áéíóúüñ', 'aeiouun') LIKE '%' || translate(lower($1), 'áéíóúüñ', 'aeiouun') || '%'))
          AND (NOT EXISTS (SELECT 1 FROM receta_taller rt2 WHERE rt2.id_receta = r.id)
               OR EXISTS (SELECT 1 FROM receta_taller rt3
                            JOIN taller t3 ON t3.id = rt3.id_taller
                           WHERE rt3.id_receta = r.id AND t3.publicado AND t3.eliminado_en IS NULL))
        GROUP BY r.id
        ORDER BY r.nombre, r.codigo`,
      [patron]
    );

    const urlFiltro = creadorDeUrls('/recetas', { q: busqueda });
    const chips = [];
    if (busqueda) chips.push(chip(`Búsqueda: ${busqueda}`, urlFiltro({ q: '' })));

    res.render('publico/recetas', {
      // Esta vista trae su propio buscador: la cabecera no repite un segundo
      // campo con la misma etiqueta (y el mismo id).
      ocultarBusqueda: true,
      titulo: 'Recetas',
      recetas,
      busqueda,
      total: recetas.length,
      urlFiltro,
      chips,
    });
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
        WHERE r.id = $1 AND r.eliminado_en IS NULL`,
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
      `SELECT id, nombre, archivo, tamano, tipo_mime, contenido
         FROM documento
        WHERE id_receta = $1 AND eliminado_en IS NULL
        ORDER BY creado_en, id`,
      [id]
    );

    // Un PDF no se puede incrustar en un teléfono, así que se muestran sus
    // páginas ya convertidas a imagen. Se cuentan aquí para que la vista sepa
    // cuántas hay, y no se manda el contenido al navegador.
    for (const documento of documentos) {
      documento.paginas =
        documento.tipo_mime === 'application/pdf' ? await contarPaginas(documento.contenido) : 0;
      delete documento.contenido;
    }

    const { rows: talleres } = await query(
      `SELECT t.id, t.nombre, t.tematica, t.descripcion, t.fecha_planificada, t.estado
         FROM taller t
         JOIN receta_taller rt ON rt.id_taller = t.id
        WHERE rt.id_receta = $1 AND t.publicado AND t.eliminado_en IS NULL
        ORDER BY t.fecha_planificada DESC NULLS LAST, t.nombre`,
      [id]
    );

    // Si la receta tiene foto, es la que se ve al compartir el enlace.
    const fotoReceta = documentos.find((documento) => documento.tipo_mime.startsWith('image/'));
    res.locals.ogTitulo = `${receta.nombre} · una receta de Creando Sabores`;
    res.locals.ogDescripcion = (
      receta.descripcion || 'Una receta del archivo de los talleres de cocina.'
    ).slice(0, 180);
    if (fotoReceta) {
      res.locals.ogImagen = `/documentos/${fotoReceta.id}/ver`;
      res.locals.ogImagenAlt = `Foto de ${receta.nombre}`;
    }

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
            AND publicado AND eliminado_en IS NULL
            AND (nombre ILIKE $1 OR tematica ILIKE $1 OR descripcion ILIKE $1)
          ORDER BY tematica, nombre
          LIMIT 20`,
        [patron]
      ),
      query(
        `SELECT r.id, r.codigo, r.nombre, r.descripcion
           FROM receta r
          WHERE $1::text IS NOT NULL
            AND r.eliminado_en IS NULL
            AND (NOT EXISTS (SELECT 1 FROM receta_taller rt WHERE rt.id_receta = r.id)
                 OR EXISTS (SELECT 1 FROM receta_taller rt
                              JOIN taller t ON t.id = rt.id_taller
                             WHERE rt.id_receta = r.id AND t.publicado AND t.eliminado_en IS NULL))
            AND (r.codigo ILIKE $1 OR r.nombre ILIKE $1 OR r.descripcion ILIKE $1)
          ORDER BY r.nombre
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
          WHERE $1::text IS NOT NULL
            AND d.eliminado_en IS NULL
            AND (d.nombre ILIKE $1)
            AND ${PADRE_VISIBLE}
          ORDER BY d.nombre
          LIMIT 20`,
        [patron]
      ),
      query(
        `SELECT video.id, video.nombre, video.descripcion, COALESCE(t.nombre, r.nombre) AS asociado_a,
                CASE WHEN video.id_taller IS NOT NULL THEN '/talleres/' || video.id_taller
                     ELSE '/recetas/' || video.id_receta END AS destino
           FROM video
           LEFT JOIN taller t ON t.id = video.id_taller
           LEFT JOIN receta r ON r.id = video.id_receta
          WHERE $1::text IS NOT NULL
            AND video.eliminado_en IS NULL
            AND (video.nombre ILIKE $1 OR video.descripcion ILIKE $1)
            AND ${PADRE_VISIBLE.replace(/d\./g, 'video.')}
          ORDER BY video.nombre
          LIMIT 20`,
        [patron]
      ),
    ]);

    const total = talleres.rows.length + recetas.rows.length + documentos.rows.length + videos.rows.length;

    res.render('publico/buscar', {
      titulo: 'Buscar',
      termino,
      total,
      // La vista tiene su propio formulario con el término cargado: la cabecera
      // no repite el buscador (un solo role="search" en el documento).
      ocultarBusqueda: true,
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
    const busqueda = (req.query.q ?? '').toString().trim();
    const idTaller = /^\d+$/.test(req.query.taller || '') ? Number(req.query.taller) : null;

    const { rows: videos } = await query(
      `SELECT video.id, video.nombre, video.descripcion, video.enlace, video.id_taller, video.id_receta,
              video.proveedor,
              t.nombre AS taller, t.tematica, r.nombre AS receta
         FROM video
         LEFT JOIN taller t ON t.id = video.id_taller
         LEFT JOIN receta r ON r.id = video.id_receta
        WHERE video.eliminado_en IS NULL
          AND ${PADRE_VISIBLE.replace(/d\./g, 'video.')}
          AND ($1 = '' OR video.nombre ILIKE '%' || $1 || '%' OR video.descripcion ILIKE '%' || $1 || '%')
          AND ($2::int IS NULL OR video.id_taller = $2)
        ORDER BY video.creado_en DESC, video.id DESC`,
      [busqueda.length >= 2 ? busqueda.replace(/[\\%_]/g, '\\$&') : '', idTaller]
    );

    const { rows: talleres } = await query(
      `SELECT id, nombre FROM taller WHERE publicado AND eliminado_en IS NULL ORDER BY nombre`
    );

    const urlFiltro = creadorDeUrls('/videos', { q: busqueda, taller: idTaller });
    const chips = [];
    if (busqueda) chips.push(chip(`Búsqueda: ${busqueda}`, urlFiltro({ q: '' })));
    if (idTaller) {
      const elegido = talleres.find((fila) => fila.id === idTaller);
      chips.push(chip(`Taller: ${elegido ? elegido.nombre : '#' + idTaller}`, urlFiltro({ taller: '' })));
    }

    res.render('publico/videos', {
      // Esta vista trae su propio buscador: la cabecera no repite un segundo
      // campo con la misma etiqueta (y el mismo id).
      ocultarBusqueda: true,
      titulo: 'Videos',
      busqueda,
      idTaller,
      talleres,
      chips,
      urlFiltro,
      total: videos.length,
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
    const busqueda = (req.query.q ?? '').toString().trim();
    const tipo = ['pdf', 'imagen'].includes(req.query.tipo) ? req.query.tipo : '';
    const origen = ['taller', 'receta'].includes(req.query.origen) ? req.query.origen : '';

    const { rows: documentos } = await query(
      `SELECT d.id, d.nombre, d.tamano, d.tipo_mime, d.id_taller, d.id_receta,
              t.nombre AS taller, t.tematica, r.nombre AS receta, r.codigo
         FROM documento d
         LEFT JOIN taller t ON t.id = d.id_taller
         LEFT JOIN receta r ON r.id = d.id_receta
        WHERE d.eliminado_en IS NULL
          AND ${PADRE_VISIBLE}
          AND ($1 = '' OR d.nombre ILIKE '%' || $1 || '%')
          AND ($2 = '' OR ($2 = 'pdf' AND d.tipo_mime = 'application/pdf')
                        OR ($2 = 'imagen' AND d.tipo_mime LIKE 'image/%'))
          AND ($3 = '' OR ($3 = 'taller' AND d.id_taller IS NOT NULL)
                        OR ($3 = 'receta' AND d.id_receta IS NOT NULL))
        ORDER BY d.creado_en DESC, d.id DESC`,
      [busqueda.length >= 2 ? busqueda.replace(/[\\%_]/g, '\\$&') : '', tipo, origen]
    );

    const urlFiltro = creadorDeUrls('/documentos', { q: busqueda, tipo, origen });
    const chips = [];
    if (busqueda) chips.push(chip(`Búsqueda: ${busqueda}`, urlFiltro({ q: '' })));
    if (tipo) chips.push(chip(tipo === 'pdf' ? 'Tipo: PDF' : 'Tipo: Imagen', urlFiltro({ tipo: '' })));
    if (origen) chips.push(chip(origen === 'taller' ? 'Origen: Taller' : 'Origen: Receta', urlFiltro({ origen: '' })));

    res.render('publico/documentos', {
      // Esta vista trae su propio buscador: la cabecera no repite un segundo
      // campo con la misma etiqueta (y el mismo id).
      ocultarBusqueda: true,
      titulo: 'Documentos',
      busqueda,
      tipo,
      origen,
      urlFiltro,
      chips,
      total: documentos.length,
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
