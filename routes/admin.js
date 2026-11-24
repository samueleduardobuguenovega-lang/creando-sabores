// Panel de administración: sesión obligatoria, acciones auditadas.
const express = require('express');
const { query } = require('../src/db');
const { hashear } = require('../src/auth');
const { requiereSesion, requiereRol } = require('../src/auth');
const { registrar } = require('../src/auditoria');
const { puedeTocar, tallerDe, sinPermiso } = require('../src/permisos');
const v = require('../src/validaciones');

const router = express.Router();

// ---------------------------------------------------------------- panel (RF-01)

router.get('/panel', requiereSesion, async (req, res, next) => {
  try {
    const { rows: resumen } = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE estado = 'planificado')::int AS planificados,
              COUNT(*) FILTER (WHERE estado = 'en_ejecucion')::int AS en_ejecucion,
              COUNT(*) FILTER (WHERE estado = 'finalizado')::int AS finalizados
         FROM taller
        WHERE eliminado_en IS NULL`
    );
    const { rows: recetas } = await query('SELECT COUNT(*)::int AS total FROM receta WHERE eliminado_en IS NULL');
    const { rows: ejecuciones } = await query('SELECT COUNT(*)::int AS total FROM ejecucion WHERE eliminado_en IS NULL');
    const { rows: ultimasEjecuciones } = await query(
      `SELECT e.id, e.fecha_ejecucion, e.cantidad_participantes,
              t.nombre AS taller, t.id AS id_taller
         FROM ejecucion e
         JOIN taller t ON t.id = e.id_taller
        WHERE e.eliminado_en IS NULL AND t.eliminado_en IS NULL
        ORDER BY e.fecha_ejecucion DESC, e.id DESC
        LIMIT 5`
    );
    const { rows: ultimosTalleres } = await query(
      `SELECT id, nombre, estado, fecha_planificada
         FROM taller
        WHERE eliminado_en IS NULL
        ORDER BY creado_en DESC LIMIT 5`
    );

    // Bandeja de pendientes: un taller puede carecer de varias cosas, pero
    // mostramos solo la más urgente para que la lista siga siendo una acción
    // por fila. Prioridad: ejecución > recetas > documentos > video.
    const { rows: revision } = await query(
      `SELECT t.id, t.nombre, t.estado,
              (SELECT COUNT(*) FROM ejecucion e WHERE e.id_taller = t.id AND e.eliminado_en IS NULL)::int AS ejecuciones,
              (SELECT COUNT(*) FROM receta_taller r WHERE r.id_taller = t.id)::int  AS recetas,
              (SELECT COUNT(*) FROM documento d WHERE d.id_taller = t.id AND d.eliminado_en IS NULL)::int AS documentos,
              (SELECT COUNT(*) FROM video v WHERE v.id_taller = t.id AND v.eliminado_en IS NULL)::int      AS videos
         FROM taller t
        WHERE t.eliminado_en IS NULL
        ORDER BY (t.estado = 'en_ejecucion') DESC,
                 (t.estado = 'finalizado') DESC,
                 t.fecha_planificada ASC NULLS LAST,
                 t.id`
    );

    const pendientes = revision
      .map((fila) => {
        if (fila.ejecuciones === 0) {
          return { ...fila, falta: 'Falta registrar la ejecución', accion: `/admin/ejecuciones?taller=${fila.id}`, etiquetaAccion: 'Registrar ejecución' };
        }
        if (fila.recetas === 0) {
          return { ...fila, falta: 'Falta asociar una receta', accion: `/admin/talleres/${fila.id}`, etiquetaAccion: 'Asignar receta' };
        }
        if (fila.documentos === 0) {
          return { ...fila, falta: 'Falta el PDF del taller', accion: `/admin/documentos?destino=taller:${fila.id}`, etiquetaAccion: 'Subir PDF' };
        }
        if (fila.videos === 0) {
          return { ...fila, falta: 'Falta el video de la clase', accion: `/admin/videos?destino=taller:${fila.id}`, etiquetaAccion: 'Agregar video' };
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, 6);

    res.render('admin/panel', {
      titulo: 'Panel principal',
      resumen: resumen[0],
      totalRecetas: recetas[0].total,
      totalEjecuciones: ejecuciones[0].total,
      ultimasEjecuciones,
      ultimosTalleres,
      pendientes,
    });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------ talleres (RF-03)

function leerTaller(cuerpo) {
  const errores = [];
  const nombre = v.texto(cuerpo.nombre, { campo: 'nombre del taller', max: 140, min: 3 });
  const tematica = v.texto(cuerpo.tematica, { campo: 'temática', max: 120 });
  const descripcion = v.texto(cuerpo.descripcion, { campo: 'descripción', max: 2000, requerido: false });
  const fecha = v.fecha(cuerpo.fecha_planificada, { campo: 'fecha planificada' });
  const estado = v.estado(cuerpo.estado || 'planificado');

  for (const resultado of [nombre, tematica, descripcion, fecha, estado]) {
    if (!resultado.ok) errores.push(resultado.error);
  }

  return {
    errores,
    valores: {
      nombre: nombre.ok ? nombre.valor : (cuerpo.nombre ?? ''),
      tematica: tematica.ok ? tematica.valor : (cuerpo.tematica ?? ''),
      descripcion: descripcion.ok ? descripcion.valor : (cuerpo.descripcion ?? ''),
      fecha_planificada: fecha.ok && fecha.valor ? fecha.valor : '',
      estado: estado.ok ? estado.valor : 'planificado',
    },
  };
}

router.get('/admin/talleres', requiereSesion, async (req, res, next) => {
  try {
    const busqueda = (req.query.q ?? '').toString().trim();
    const estado = v.ESTADOS.includes(req.query.estado) ? req.query.estado : null;

    const { rows: talleres } = await query(
      `SELECT t.id, t.nombre, t.tematica, t.estado, t.fecha_planificada, t.publicado,
              COUNT(DISTINCT e.id)::int AS ejecuciones,
              COUNT(DISTINCT r.id_receta)::int AS recetas
         FROM taller t
         LEFT JOIN ejecucion e ON e.id_taller = t.id
         LEFT JOIN receta_taller r ON r.id_taller = t.id
        WHERE t.eliminado_en IS NULL
          AND ($1 = '' OR t.nombre ILIKE '%' || $1 || '%' OR t.tematica ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR t.estado = $2)
        GROUP BY t.id
        ORDER BY t.creado_en DESC`,
      [busqueda, estado]
    );

    res.render('admin/talleres-lista', { titulo: 'Talleres', talleres, busqueda, estado });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/talleres/nuevo', requiereSesion, (req, res) => {
  res.render('admin/taller-form', {
    titulo: 'Nuevo taller',
    modo: 'crear',
    taller: { nombre: '', tematica: '', descripcion: '', fecha_planificada: '', estado: 'planificado' },
    errores: [],
  });
});

router.post('/admin/talleres', requiereSesion, async (req, res, next) => {
  const { errores, valores } = leerTaller(req.body);
  if (errores.length > 0) {
    return res.status(400).render('admin/taller-form', {
      titulo: 'Nuevo taller',
      modo: 'crear',
      taller: valores,
      errores,
    });
  }

  try {
    const { rows } = await query(
      `INSERT INTO taller (nombre, tematica, descripcion, fecha_planificada, estado, id_usuario, publicado)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        valores.nombre,
        valores.tematica,
        valores.descripcion,
        valores.fecha_planificada || null,
        valores.estado,
        req.session.usuario.id,
        // El docente deja el taller como borrador; la administración publica.
        req.session.usuario.rol === 'admin',
      ]
    );
    await registrar(req.session.usuario.id, 'crear', 'taller', rows[0].id, { nombre: valores.nombre });
    res.redirect(`/admin/talleres/${rows[0].id}?ok=${encodeURIComponent('Taller creado.')}`);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/talleres/:id', requiereSesion, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return next();

    const { rows } = await query('SELECT * FROM taller WHERE id = $1 AND eliminado_en IS NULL', [id]);
    const taller = rows[0];
    if (!taller) {
      return res.status(404).render('error', {
        titulo: 'Taller no encontrado',
        mensaje: 'Ese taller no existe o fue eliminado.',
        detalle: 'Vuelve al listado de talleres.',
      });
    }

    const { rows: recetas } = await query(
      `SELECT r.id, r.codigo, r.nombre
         FROM receta r
         JOIN receta_taller rt ON rt.id_receta = r.id
        WHERE rt.id_taller = $1 AND r.eliminado_en IS NULL
        ORDER BY r.nombre`,
      [id]
    );
    const { rows: ejecuciones } = await query(
      `SELECT id, fecha_ejecucion, cantidad_participantes, observaciones
         FROM ejecucion WHERE id_taller = $1 AND eliminado_en IS NULL
        ORDER BY fecha_ejecucion DESC`,
      [id]
    );
    const { rows: documentos } = await query(
      'SELECT id, nombre, tipo_mime, creado_en FROM documento WHERE id_taller = $1 AND eliminado_en IS NULL ORDER BY creado_en DESC',
      [id]
    );
    const { rows: videos } = await query(
      'SELECT id, nombre, enlace, proveedor FROM video WHERE id_taller = $1 AND eliminado_en IS NULL ORDER BY creado_en DESC',
      [id]
    );
    const { rows: responsables } = await query('SELECT nombre FROM usuario WHERE id = $1', [taller.id_usuario]);
    const videosConReproductor = videos.map((video) => {
      const resultado = v.enlaceVideo(video.enlace);
      return {
        ...video,
        embedUrl: resultado.ok ? resultado.embedUrl : null,
        enlaceValidado: resultado.ok ? resultado.valor : null,
      };
    });

    res.render('admin/taller-detalle', {
      titulo: taller.nombre,
      taller,
      responsable: responsables[0] ? responsables[0].nombre : 'Cuenta eliminada',
      recetas,
      ejecuciones,
      documentos,
      videos: videosConReproductor,
      puedeEditar: puedeTocar(req.session.usuario, taller),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/talleres/:id/editar', requiereSesion, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM taller WHERE id = $1 AND eliminado_en IS NULL', [Number(req.params.id) || 0]);
    if (!rows[0]) {
      return res.status(404).render('error', {
        titulo: 'Taller no encontrado',
        mensaje: 'Ese taller no existe o fue eliminado.',
        detalle: 'Vuelve al listado de talleres.',
      });
    }
    if (!puedeTocar(req.session.usuario, rows[0])) {
      return sinPermiso(
        res,
        'Este taller lo documenta otra persona.',
        'Puedes consultarlo, pero solo quien lo creó o la administración pueden editarlo.'
      );
    }
    res.render('admin/taller-form', {
      titulo: `Editar ${rows[0].nombre}`,
      modo: 'editar',
      taller: {
        ...rows[0],
        fecha_planificada: rows[0].fecha_planificada
          ? new Date(rows[0].fecha_planificada).toISOString().slice(0, 10)
          : '',
      },
      errores: [],
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/talleres/:id', requiereSesion, async (req, res, next) => {
  const id = Number(req.params.id) || 0;
  const { errores, valores } = leerTaller(req.body);

  // Antes de validar nada: si el taller no es tuyo, no hay formulario que guardar.
  try {
    const dueno = await tallerDe(id);
    if (dueno && !puedeTocar(req.session.usuario, dueno)) {
      return sinPermiso(
        res,
        'Este taller lo documenta otra persona.',
        'Puedes consultarlo, pero solo quien lo creó o la administración pueden guardarlo.'
      );
    }
  } catch (error) {
    return next(error);
  }

  if (errores.length > 0) {
    return res.status(400).render('admin/taller-form', {
      titulo: 'Editar taller',
      modo: 'editar',
      taller: { ...valores, id },
      errores,
    });
  }

  try {
    const { rowCount } = await query(
      `UPDATE taller
          SET nombre = $1, tematica = $2, descripcion = $3,
              fecha_planificada = $4, estado = $5, actualizado_en = now()
        WHERE id = $6`,
      [valores.nombre, valores.tematica, valores.descripcion, valores.fecha_planificada || null, valores.estado, id]
    );
    if (rowCount === 0) return next();

    await registrar(req.session.usuario.id, 'actualizar', 'taller', id, {
      nombre: valores.nombre,
      estado: valores.estado,
    });
    res.redirect(`/admin/talleres/${id}?ok=${encodeURIComponent('Cambios guardados.')}`);
  } catch (error) {
    next(error);
  }
});

// Eliminar manda el taller a la papelera (RF-09): deja de verse en todas partes
// pero se puede recuperar. La administración decide cuándo se borra de verdad.
router.post('/admin/talleres/:id/eliminar', requiereRol('admin'), async (req, res, next) => {
  const id = Number(req.params.id) || 0;
  try {
    const { rows } = await query('SELECT nombre FROM taller WHERE id = $1', [id]);
    if (!rows[0]) return next();

    await query('UPDATE taller SET eliminado_en = now(), actualizado_en = now() WHERE id = $1', [id]);
    await registrar(req.session.usuario.id, 'eliminar', 'taller', id, { nombre: rows[0].nombre });
    res.redirect(`/admin/talleres?ok=${encodeURIComponent('Taller enviado a la papelera. Se puede recuperar desde Papelera.')}`);
  } catch (error) {
    next(error);
  }
});

// Publicar u ocultar (RF-07): el docente documenta, la administración decide qué
// se ve en el sitio público. Ocultar no borra nada: el archivo interno queda igual.
router.post('/admin/talleres/:id/publicacion', requiereRol('admin'), async (req, res, next) => {
  const id = Number(req.params.id) || 0;
  const publicar = req.body.publicar === '1';
  try {
    const { rows } = await query(
      'UPDATE taller SET publicado = $1, actualizado_en = now() WHERE id = $2 RETURNING nombre',
      [publicar, id]
    );
    if (!rows[0]) return next();

    await registrar(req.session.usuario.id, publicar ? 'publicar' : 'ocultar', 'taller', id, {
      nombre: rows[0].nombre,
    });
    const aviso = publicar ? 'Taller visible en el sitio público.' : 'Taller oculto del sitio público.';
    res.redirect(`/admin/talleres/${id}?ok=${encodeURIComponent(aviso)}`);
  } catch (error) {
    next(error);
  }
});

// Papelera (RF-09). Solo la administración la ve: son las cosas que se mandaron
// a eliminar y todavía se pueden recuperar. Purga = borrado definitivo.
const ENTIDADES_PAPELERA = {
  taller: { etiqueta: 'Taller', nombre: 'nombre' },
  receta: { etiqueta: 'Receta', nombre: 'nombre' },
  documento: { etiqueta: 'Documento', nombre: 'nombre' },
  video: { etiqueta: 'Video', nombre: 'nombre' },
  ejecucion: { etiqueta: 'Ejecución', nombre: 'fecha_ejecucion' },
};

router.get('/admin/papelera', requiereRol('admin'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT 'taller'::text AS tabla, t.id, t.nombre AS referencia, t.eliminado_en
         FROM taller t WHERE t.eliminado_en IS NOT NULL
       UNION ALL
       SELECT 'receta', r.id, r.codigo || ' · ' || r.nombre, r.eliminado_en
         FROM receta r WHERE r.eliminado_en IS NOT NULL
       UNION ALL
       SELECT 'documento', d.id, d.nombre, d.eliminado_en
         FROM documento d WHERE d.eliminado_en IS NOT NULL
       UNION ALL
       SELECT 'video', v.id, v.nombre, v.eliminado_en
         FROM video v WHERE v.eliminado_en IS NOT NULL
       UNION ALL
       SELECT 'ejecucion', e.id, to_char(e.fecha_ejecucion, 'DD-MM-YYYY') || ' · ' || t.nombre, e.eliminado_en
         FROM ejecucion e JOIN taller t ON t.id = e.id_taller
        WHERE e.eliminado_en IS NOT NULL
       ORDER BY eliminado_en DESC NULLS LAST`
    );
    res.render('admin/papelera', { titulo: 'Papelera', elementos: rows, ENTIDADES_PAPELERA });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/papelera/:tabla/:id/restaurar', requiereRol('admin'), async (req, res, next) => {
  const entidad = ENTIDADES_PAPELERA[req.params.tabla];
  const id = Number(req.params.id) || 0;
  if (!entidad) return next();
  try {
    const { rows } = await query(
      `UPDATE ${req.params.tabla} SET eliminado_en = NULL WHERE id = $1 AND eliminado_en IS NOT NULL RETURNING id`,
      [id]
    );
    if (!rows[0]) return next();

    await registrar(req.session.usuario.id, 'restaurar', req.params.tabla, id, {});
    res.redirect(`/admin/papelera?ok=${encodeURIComponent(`${entidad.etiqueta} restaurado.`)}`);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/papelera/:tabla/:id/purgar', requiereRol('admin'), async (req, res, next) => {
  const entidad = ENTIDADES_PAPELERA[req.params.tabla];
  const id = Number(req.params.id) || 0;
  if (!entidad) return next();
  try {
    const { rows } = await query(
      `DELETE FROM ${req.params.tabla} WHERE id = $1 AND eliminado_en IS NOT NULL RETURNING id`,
      [id]
    );
    if (!rows[0]) return next();

    await registrar(req.session.usuario.id, 'purgar', req.params.tabla, id, {});
    res.redirect(`/admin/papelera?ok=${encodeURIComponent(`${entidad.etiqueta} borrado definitivamente.`)}`);
  } catch (error) {
    next(error);
  }
});

// Borrar una ejecución concreta (RF-09): antes había que borrar el taller entero.
router.post('/admin/ejecuciones/:id/eliminar', requiereRol('admin'), async (req, res, next) => {
  const id = Number(req.params.id) || 0;
  try {
    const { rows } = await query(
      'SELECT id_taller FROM ejecucion WHERE id = $1 AND eliminado_en IS NULL',
      [id]
    );
    if (!rows[0]) return next();

    await query('UPDATE ejecucion SET eliminado_en = now() WHERE id = $1', [id]);
    await registrar(req.session.usuario.id, 'eliminar', 'ejecucion', id, {});
    res.redirect(`/admin/ejecuciones?ok=${encodeURIComponent('Ejecución enviada a la papelera.')}`);
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------ usuarios (RF-02)

router.get('/admin/usuarios', requiereRol('admin'), async (req, res, next) => {
  try {
    const { rows: usuarios } = await query(
      `SELECT id, nombre, usuario, rol, activo, creado_en FROM usuario ORDER BY creado_en`
    );
    res.render('admin/usuarios-lista', { titulo: 'Usuarios', usuarios });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/usuarios/nuevo', requiereRol('admin'), (req, res) => {
  res.render('admin/usuario-form', {
    titulo: 'Nuevo usuario',
    modo: 'crear',
    cuenta: { nombre: '', usuario: '', rol: 'docente', activo: true },
    errores: [],
  });
});

function leerCuenta(cuerpo, { conClave }) {
  const errores = [];
  const nombre = v.texto(cuerpo.nombre, { campo: 'nombre', max: 120, min: 3 });
  const usuario = v.texto(cuerpo.usuario, { campo: 'nombre de usuario', max: 60, min: 3 });
  const rol = ['admin', 'docente'].includes(cuerpo.rol) ? cuerpo.rol : null;
  const clave = (cuerpo.clave ?? '').toString();

  if (!nombre.ok) errores.push(nombre.error);
  if (!usuario.ok) errores.push(usuario.error);
  if (!rol) errores.push('El rol debe ser administrador o docente.');
  if (/[^a-zA-Z0-9._-]/.test(usuario.ok ? usuario.valor : '')) {
    errores.push('El nombre de usuario solo admite letras, números, punto, guion y guion bajo.');
  }
  if (conClave && clave.length < 8) {
    errores.push('La contraseña necesita al menos 8 caracteres.');
  }
  if (!conClave && clave && clave.length < 8) {
    errores.push('La nueva contraseña necesita al menos 8 caracteres.');
  }

  return {
    errores,
    valores: {
      nombre: nombre.ok ? nombre.valor : (cuerpo.nombre ?? ''),
      usuario: usuario.ok ? usuario.valor : (cuerpo.usuario ?? ''),
      rol: rol || 'docente',
      activo: cuerpo.activo === 'on' || cuerpo.activo === 'true',
      clave,
    },
  };
}

router.post('/admin/usuarios', requiereRol('admin'), async (req, res, next) => {
  const { errores, valores } = leerCuenta(req.body, { conClave: true });
  const volverARenderizar = (lista) =>
    res.status(400).render('admin/usuario-form', {
      titulo: 'Nuevo usuario',
      modo: 'crear',
      cuenta: valores,
      errores: lista,
    });

  if (errores.length > 0) return volverARenderizar(errores);
  if (!valores.activo) valores.activo = true;

  try {
    const { rows } = await query(
      `INSERT INTO usuario (nombre, usuario, clave_hash, rol, activo)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
      [valores.nombre, valores.usuario, await hashear(valores.clave), valores.rol]
    );
    await registrar(req.session.usuario.id, 'crear', 'usuario', rows[0].id, { usuario: valores.usuario, rol: valores.rol });
    res.redirect(`/admin/usuarios?ok=${encodeURIComponent('Usuario creado.')}`);
  } catch (error) {
    if (error.code === '23505') {
      return volverARenderizar(['Ya existe un usuario con ese nombre de usuario.']);
    }
    next(error);
  }
});

router.get('/admin/usuarios/:id/editar', requiereRol('admin'), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, nombre, usuario, rol, activo FROM usuario WHERE id = $1', [
      Number(req.params.id) || 0,
    ]);
    if (!rows[0]) return next();
    res.render('admin/usuario-form', {
      titulo: `Editar ${rows[0].nombre}`,
      modo: 'editar',
      cuenta: rows[0],
      errores: [],
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/usuarios/:id', requiereRol('admin'), async (req, res, next) => {
  const id = Number(req.params.id) || 0;
  const { errores, valores } = leerCuenta(req.body, { conClave: false });
  const soyYo = id === req.session.usuario.id;

  if (soyYo && !valores.activo) {
    errores.push('No puedes desactivar tu propia cuenta.');
  }

  // Una cuenta administradora puede degradarse, salvo que sea la última activa:
  // el sistema quedaría sin nadie que gestione usuarios, auditoría ni borrados.
  if (valores.rol !== 'admin' || !valores.activo) {
    try {
      const { rows } = await query(
        "SELECT COUNT(*)::int AS otros FROM usuario WHERE rol = 'admin' AND activo AND id <> $1",
        [id]
      );
      if (rows[0].otros === 0) {
        errores.push(
          'Esta es la última cuenta administradora activa: no puede dejar de serlo ni desactivarse.'
        );
      }
    } catch (error) {
      return next(error);
    }
  }

  if (errores.length > 0) {
    return res.status(400).render('admin/usuario-form', {
      titulo: 'Editar usuario',
      modo: 'editar',
      cuenta: { ...valores, id, activo: valores.activo },
      errores,
    });
  }

  try {
    const { rowCount } = await query(
      `UPDATE usuario SET nombre = $1, usuario = $2, rol = $3, activo = $4 WHERE id = $5`,
      [valores.nombre, valores.usuario, valores.rol, valores.activo, id]
    );
    if (rowCount === 0) return next();

    if (valores.clave) {
      await query('UPDATE usuario SET clave_hash = $1 WHERE id = $2', [await hashear(valores.clave), id]);
    }

    await registrar(req.session.usuario.id, 'actualizar', 'usuario', id, { usuario: valores.usuario, activo: valores.activo });

    // Si me cambié el rol o el nombre, la sesión tiene que reflejarlo.
    if (soyYo) {
      req.session.usuario = { ...req.session.usuario, nombre: valores.nombre, rol: valores.rol };
      await new Promise((ok) => req.session.save(() => ok()));
    }

    res.redirect(`/admin/usuarios?ok=${encodeURIComponent('Cambios guardados.')}`);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).render('admin/usuario-form', {
        titulo: 'Editar usuario',
        modo: 'editar',
        cuenta: { ...valores, id },
        errores: ['Ya existe otro usuario con ese nombre de usuario.'],
      });
    }
    next(error);
  }
});

// ------------------------------------------------------------ auditoría (RNF)

router.get('/admin/auditoria', requiereRol('admin'), async (req, res, next) => {
  try {
    const { rows: registros } = await query(
      `SELECT a.id, a.accion, a.entidad, a.entidad_id, a.detalle, a.creado_en,
              u.nombre AS responsable
         FROM auditoria a
         LEFT JOIN usuario u ON u.id = a.id_usuario
        ORDER BY a.creado_en DESC, a.id DESC
        LIMIT 100`
    );
    res.render('admin/auditoria', { titulo: 'Auditoría', registros });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------- ejecuciones (RF-06 / CU-06)

async function datosEjecuciones() {
  const [ejecuciones, talleres, videos] = await Promise.all([
    query(
      `SELECT e.id, e.fecha_ejecucion, e.cantidad_participantes, e.observaciones,
              e.id_taller, e.id_video, t.nombre AS taller, t.tematica,
              v.nombre AS video
         FROM ejecucion e
         JOIN taller t ON t.id = e.id_taller
         LEFT JOIN video v ON v.id = e.id_video
        WHERE e.eliminado_en IS NULL AND t.eliminado_en IS NULL
        ORDER BY e.fecha_ejecucion DESC, e.id DESC
        LIMIT 100`
    ),
    query('SELECT id, nombre FROM taller WHERE eliminado_en IS NULL ORDER BY nombre'),
    query('SELECT id, nombre FROM video WHERE eliminado_en IS NULL ORDER BY nombre'),
  ]);
  return { ejecuciones: ejecuciones.rows, talleres: talleres.rows, videos: videos.rows };
}

async function renderEjecuciones(req, res, next, { estado = 200, errores = [], valores = {} } = {}) {
  try {
    return res.status(estado).render('admin/ejecuciones', {
      titulo: 'Ejecuciones',
      ...(await datosEjecuciones()),
      errores,
      valores,
    });
  } catch (error) {
    return next(error);
  }
}

router.get('/admin/ejecuciones', requiereSesion, (req, res, next) => {
  const taller = Number(req.query.taller);
  return renderEjecuciones(req, res, next, {
    valores: Number.isInteger(taller) && taller > 0 ? { id_taller: taller } : {},
  });
});

router.post('/admin/ejecuciones', requiereSesion, async (req, res, next) => {
  const cuerpo = req.body || {};
  const idTaller = Number(cuerpo.id_taller);
  const fecha = (cuerpo.fecha_ejecucion || '').toString().trim();
  const participantes = Number(cuerpo.cantidad_participantes);
  const observaciones = v.texto(cuerpo.observaciones, {
    campo: 'observaciones',
    max: 2000,
    requerido: false,
  });
  const idVideo = cuerpo.id_video ? Number(cuerpo.id_video) : null;
  const errores = [];

  if (!Number.isInteger(idTaller) || idTaller < 1) errores.push('Selecciona el taller ejecutado.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) errores.push('Indica la fecha de la ejecución.');
  if (!Number.isInteger(participantes) || participantes < 0 || participantes > 1000) {
    errores.push('La cantidad de participantes debe ser un número entre 0 y 1000.');
  }
  if (!observaciones.ok) errores.push(observaciones.error);
  if (idVideo !== null && (!Number.isInteger(idVideo) || idVideo < 1)) {
    errores.push('El video seleccionado no es válido.');
  }

  if (errores.length > 0) {
    return renderEjecuciones(req, res, next, { estado: 400, errores, valores: cuerpo });
  }

  try {
    const taller = await query('SELECT id, id_usuario FROM taller WHERE id = $1', [idTaller]);
    if (idVideo !== null) {
      const video = await query('SELECT id FROM video WHERE id = $1', [idVideo]);
      if (!video.rows[0]) {
        return renderEjecuciones(req, res, next, {
          estado: 400,
          errores: ['El video seleccionado ya no existe.'],
          valores: cuerpo,
        });
      }
    }
    if (!taller.rows[0]) {
      return renderEjecuciones(req, res, next, {
        estado: 400,
        errores: ['Ese taller ya no existe.'],
        valores: cuerpo,
      });
    }

    if (!puedeTocar(req.session.usuario, taller.rows[0])) {
      return renderEjecuciones(req, res, next, {
        estado: 403,
        errores: [
          'Ese taller lo documenta otra persona: solo quien lo creó o la administración pueden registrar su ejecución.',
        ],
        valores: cuerpo,
      });
    }

    const { rows } = await query(
      `INSERT INTO ejecucion (fecha_ejecucion, id_taller, cantidad_participantes, observaciones,
                              id_video, id_usuario)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [fecha, idTaller, participantes, observaciones.valor, idVideo, req.session.usuario.id]
    );
    await registrar(req.session.usuario.id, 'crear', 'ejecucion', rows[0].id, {
      id_taller: idTaller,
      fecha,
      participantes,
      id_video: idVideo,
    });
    return res.redirect(
      `/admin/ejecuciones?ok=${encodeURIComponent('Ejecución registrada correctamente.')}`
    );
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
