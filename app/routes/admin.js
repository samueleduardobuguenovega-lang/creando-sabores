// Panel de administración: sesión obligatoria, acciones auditadas.
const express = require('express');
const { query } = require('../src/db');
const { hashear } = require('../src/auth');
const { requiereSesion, requiereRol } = require('../src/auth');
const { registrar } = require('../src/auditoria');
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
         FROM taller`
    );
    const { rows: recetas } = await query('SELECT COUNT(*)::int AS total FROM receta');
    const { rows: ejecuciones } = await query('SELECT COUNT(*)::int AS total FROM ejecucion');
    const { rows: ultimasEjecuciones } = await query(
      `SELECT e.id, e.fecha_ejecucion, e.cantidad_participantes,
              t.nombre AS taller, t.id AS id_taller
         FROM ejecucion e
         JOIN taller t ON t.id = e.id_taller
        ORDER BY e.fecha_ejecucion DESC, e.id DESC
        LIMIT 5`
    );
    const { rows: ultimosTalleres } = await query(
      `SELECT id, nombre, estado, fecha_planificada
         FROM taller ORDER BY creado_en DESC LIMIT 5`
    );

    res.render('admin/panel', {
      titulo: 'Panel principal',
      resumen: resumen[0],
      totalRecetas: recetas[0].total,
      totalEjecuciones: ejecuciones[0].total,
      ultimasEjecuciones,
      ultimosTalleres,
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
      `SELECT t.id, t.nombre, t.tematica, t.estado, t.fecha_planificada,
              COUNT(DISTINCT e.id)::int AS ejecuciones,
              COUNT(DISTINCT r.id_receta)::int AS recetas
         FROM taller t
         LEFT JOIN ejecucion e ON e.id_taller = t.id
         LEFT JOIN receta_taller r ON r.id_taller = t.id
        WHERE ($1 = '' OR t.nombre ILIKE '%' || $1 || '%' OR t.tematica ILIKE '%' || $1 || '%')
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
      `INSERT INTO taller (nombre, tematica, descripcion, fecha_planificada, estado, id_usuario)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        valores.nombre,
        valores.tematica,
        valores.descripcion,
        valores.fecha_planificada || null,
        valores.estado,
        req.session.usuario.id,
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

    const { rows } = await query('SELECT * FROM taller WHERE id = $1', [id]);
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
        WHERE rt.id_taller = $1
        ORDER BY r.nombre`,
      [id]
    );
    const { rows: ejecuciones } = await query(
      `SELECT id, fecha_ejecucion, cantidad_participantes, observaciones
         FROM ejecucion WHERE id_taller = $1
        ORDER BY fecha_ejecucion DESC`,
      [id]
    );
    const { rows: documentos } = await query(
      'SELECT id, nombre, tipo_mime, creado_en FROM documento WHERE id_taller = $1 ORDER BY creado_en DESC',
      [id]
    );
    const { rows: videos } = await query(
      'SELECT id, nombre, enlace, proveedor FROM video WHERE id_taller = $1 ORDER BY creado_en DESC',
      [id]
    );
    const { rows: responsables } = await query('SELECT nombre FROM usuario WHERE id = $1', [taller.id_usuario]);

    res.render('admin/taller-detalle', {
      titulo: taller.nombre,
      taller,
      responsable: responsables[0] ? responsables[0].nombre : 'Cuenta eliminada',
      recetas,
      ejecuciones,
      documentos,
      videos,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/talleres/:id/editar', requiereSesion, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM taller WHERE id = $1', [Number(req.params.id) || 0]);
    if (!rows[0]) {
      return res.status(404).render('error', {
        titulo: 'Taller no encontrado',
        mensaje: 'Ese taller no existe o fue eliminado.',
        detalle: 'Vuelve al listado de talleres.',
      });
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

// Eliminar arrastra ejecuciones, recetas vinculadas y documentos: solo administración.
router.post('/admin/talleres/:id/eliminar', requiereRol('admin'), async (req, res, next) => {
  const id = Number(req.params.id) || 0;
  try {
    const { rows } = await query('SELECT nombre FROM taller WHERE id = $1', [id]);
    if (!rows[0]) return next();

    await query('DELETE FROM taller WHERE id = $1', [id]);
    await registrar(req.session.usuario.id, 'eliminar', 'taller', id, { nombre: rows[0].nombre });
    res.redirect(`/admin/talleres?ok=${encodeURIComponent('Taller eliminado.')}`);
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

// ------------------------------------- módulos de los compañeros (aún vacíos)

const PENDIENTES = {
  recetas: {
    titulo: 'Recetas',
    responsable: 'Francisco Puelles',
    tarea: 'T5',
    descripcion: 'Ficha PDF de recetas, código único y vínculo con uno o varios talleres (RF-04 / CU-04).',
  },
  documentos: {
    titulo: 'Documentos PDF',
    responsable: 'Goran Almendra',
    tarea: 'T7',
    descripcion: 'Subida de PDF, validación de tamaño y tipo, y visor dentro del navegador (RF-05 / CU-05).',
  },
  videos: {
    titulo: 'Videos',
    responsable: 'Goran Almendra',
    tarea: 'T8',
    descripcion: 'Registro de enlaces de YouTube y Vimeo con nombre, descripción y asociación (RF-05 / CU-05).',
  },
  ejecuciones: {
    titulo: 'Ejecuciones',
    responsable: 'Francisco Puelles',
    tarea: 'T6',
    descripcion: 'Documentar la ejecución del taller: fecha, participantes y observaciones (RF-06 / CU-06).',
  },
};

for (const [ruta, datos] of Object.entries(PENDIENTES)) {
  router.get(`/admin/${ruta}`, requiereSesion, (req, res) => {
    res.render('pendiente', datos);
  });
}

module.exports = router;
