// Gestión administrativa de recetas y su relación con talleres (RF-04).
const express = require('express');
const { query, transaccion } = require('../src/db');
const { requiereSesion, requiereRol } = require('../src/auth');
const { registrar } = require('../src/auditoria');
const v = require('../src/validaciones');

const router = express.Router();

function leerReceta(cuerpo) {
  const errores = [];
  const codigo = v.texto(cuerpo.codigo, { campo: 'código', max: 40 });
  const nombre = v.texto(cuerpo.nombre, { campo: 'nombre', max: 140, min: 3 });
  const descripcion = v.texto(cuerpo.descripcion, {
    campo: 'descripción',
    max: 2000,
    requerido: false,
  });
  const enlace = v.texto(cuerpo.enlace_pdf, { campo: 'enlace al PDF', max: 2048, requerido: false });
  const enlaceValido = enlace.ok && enlace.valor ? v.enlaceHttp(enlace.valor, { campo: 'enlace al PDF' }) : enlace;

  for (const resultado of [codigo, nombre, descripcion, enlace, enlaceValido]) {
    if (!resultado.ok) errores.push(resultado.error);
  }

  const valores = {
    codigo: codigo.ok ? codigo.valor : (cuerpo.codigo ?? ''),
    nombre: nombre.ok ? nombre.valor : (cuerpo.nombre ?? ''),
    descripcion: descripcion.ok ? descripcion.valor : (cuerpo.descripcion ?? ''),
    enlace_pdf: enlace.ok ? enlace.valor : (cuerpo.enlace_pdf ?? ''),
  };
  const seleccionados = [];
  const idsEnviados = cuerpo.talleres === undefined
    ? []
    : Array.isArray(cuerpo.talleres)
      ? cuerpo.talleres
      : [cuerpo.talleres];

  for (const id of idsEnviados) {
    if (!/^\d+$/.test(String(id))) {
      errores.push('La selección de talleres no es válida.');
      continue;
    }
    const resultado = v.entero(id, { campo: 'taller', min: 1, max: 2147483647 });
    if (!resultado.ok) {
      errores.push(resultado.error);
      continue;
    }
    if (!seleccionados.includes(resultado.valor)) seleccionados.push(resultado.valor);
  }

  return { errores: [...new Set(errores)], valores, seleccionados };
}

async function cargarTalleres(seleccionados = []) {
  const { rows: talleres } = await query(
    `SELECT id, nombre, tematica
       FROM taller
      ORDER BY nombre, id`
  );
  const idsDisponibles = new Set(talleres.map((taller) => taller.id));
  const seleccionValida = seleccionados.filter((id) => idsDisponibles.has(id));
  return { talleres, seleccionados: seleccionValida };
}

async function renderFormulario(res, { titulo, modo, receta, errores, status = 200 }) {
  const datosTalleres = await cargarTalleres(receta.seleccionados);
  return res.status(status).render('admin/receta-form', {
    titulo,
    modo,
    receta: receta.valores,
    talleres: datosTalleres.talleres,
    talleresSeleccionados: datosTalleres.seleccionados,
    errores,
  });
}

async function validarTalleresSeleccionados(seleccionados) {
  if (seleccionados.length === 0) return true;
  const { rows } = await query('SELECT id FROM taller WHERE id = ANY($1::int[])', [seleccionados]);
  return rows.length === seleccionados.length;
}

router.get('/admin/recetas', requiereSesion, async (req, res, next) => {
  try {
    const busqueda = (req.query.q ?? '').toString().trim();
    const { rows: recetas } = await query(
      `SELECT r.id, r.codigo, r.nombre, r.enlace_pdf,
              COUNT(DISTINCT rt.id_taller)::int AS talleres
         FROM receta r
         LEFT JOIN receta_taller rt ON rt.id_receta = r.id
        WHERE ($1 = '' OR r.codigo ILIKE '%' || $1 || '%' OR r.nombre ILIKE '%' || $1 || '%')
        GROUP BY r.id
        ORDER BY r.nombre, r.codigo`,
      [busqueda]
    );
    res.render('admin/recetas-lista', { titulo: 'Recetas', recetas, busqueda });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/recetas/nueva', requiereSesion, async (req, res, next) => {
  try {
    await renderFormulario(res, {
      titulo: 'Nueva receta',
      modo: 'crear',
      receta: {
        valores: { codigo: '', nombre: '', descripcion: '', enlace_pdf: '' },
        seleccionados: [],
      },
      errores: [],
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/recetas', requiereSesion, async (req, res, next) => {
  const receta = leerReceta(req.body);
  if (receta.errores.length > 0) {
    try {
      return await renderFormulario(res, {
        titulo: 'Nueva receta',
        modo: 'crear',
        receta: { valores: receta.valores, seleccionados: receta.seleccionados },
        errores: receta.errores,
        status: 400,
      });
    } catch (error) {
      return next(error);
    }
  }

  try {
    if (!(await validarTalleresSeleccionados(receta.seleccionados))) {
      return await renderFormulario(res, {
        titulo: 'Nueva receta',
        modo: 'crear',
        receta: { valores: receta.valores, seleccionados: receta.seleccionados },
        errores: ['Uno o más talleres seleccionados ya no existen.'],
        status: 400,
      });
    }

    const id = await transaccion(async (cliente) => {
      const { rows } = await cliente.query(
        `INSERT INTO receta (codigo, nombre, descripcion, enlace_pdf, id_usuario)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          receta.valores.codigo,
          receta.valores.nombre,
          receta.valores.descripcion,
          receta.valores.enlace_pdf || null,
          req.session.usuario.id,
        ]
      );
      for (const idTaller of receta.seleccionados) {
        await cliente.query(
          'INSERT INTO receta_taller (id_receta, id_taller) VALUES ($1, $2)',
          [rows[0].id, idTaller]
        );
      }
      return rows[0].id;
    });

    await registrar(req.session.usuario.id, 'crear', 'receta', id, {
      codigo: receta.valores.codigo,
      nombre: receta.valores.nombre,
    });
    res.redirect(`/admin/recetas?ok=${encodeURIComponent('Receta creada.')}`);
  } catch (error) {
    if (error.code === '23505') {
      try {
        return await renderFormulario(res, {
          titulo: 'Nueva receta',
          modo: 'crear',
          receta: { valores: receta.valores, seleccionados: receta.seleccionados },
          errores: ['Ya existe una receta con ese código.'],
          status: 400,
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    next(error);
  }
});

router.get('/admin/recetas/:id/editar', requiereSesion, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return next();

    const { rows } = await query(
      `SELECT id, codigo, nombre, descripcion, enlace_pdf
         FROM receta
        WHERE id = $1`,
      [id]
    );
    if (!rows[0]) return next();

    const { rows: vinculaciones } = await query(
      'SELECT id_taller FROM receta_taller WHERE id_receta = $1',
      [id]
    );
    await renderFormulario(res, {
      titulo: `Editar ${rows[0].nombre}`,
      modo: 'editar',
      receta: {
        valores: rows[0],
        seleccionados: vinculaciones.map((vinculo) => vinculo.id_taller),
      },
      errores: [],
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/recetas/:id', requiereSesion, async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return next();

  const receta = leerReceta(req.body);
  if (receta.errores.length > 0) {
    try {
      return await renderFormulario(res, {
        titulo: 'Editar receta',
        modo: 'editar',
        receta: { valores: { ...receta.valores, id }, seleccionados: receta.seleccionados },
        errores: receta.errores,
        status: 400,
      });
    } catch (error) {
      return next(error);
    }
  }

  try {
    if (!(await validarTalleresSeleccionados(receta.seleccionados))) {
      return await renderFormulario(res, {
        titulo: 'Editar receta',
        modo: 'editar',
        receta: { valores: { ...receta.valores, id }, seleccionados: receta.seleccionados },
        errores: ['Uno o más talleres seleccionados ya no existen.'],
        status: 400,
      });
    }

    const actualizada = await transaccion(async (cliente) => {
      const resultado = await cliente.query(
        `UPDATE receta
            SET codigo = $1, nombre = $2, descripcion = $3, enlace_pdf = $4
          WHERE id = $5`,
        [
          receta.valores.codigo,
          receta.valores.nombre,
          receta.valores.descripcion,
          receta.valores.enlace_pdf || null,
          id,
        ]
      );
      if (resultado.rowCount === 0) return false;

      await cliente.query('DELETE FROM receta_taller WHERE id_receta = $1', [id]);
      for (const idTaller of receta.seleccionados) {
        await cliente.query(
          'INSERT INTO receta_taller (id_receta, id_taller) VALUES ($1, $2)',
          [id, idTaller]
        );
      }
      return true;
    });
    if (!actualizada) return next();

    await registrar(req.session.usuario.id, 'actualizar', 'receta', id, {
      codigo: receta.valores.codigo,
      nombre: receta.valores.nombre,
      talleres: receta.seleccionados,
    });
    res.redirect(`/admin/recetas?ok=${encodeURIComponent('Cambios guardados.')}`);
  } catch (error) {
    if (error.code === '23505') {
      try {
        return await renderFormulario(res, {
          titulo: 'Editar receta',
          modo: 'editar',
          receta: { valores: { ...receta.valores, id }, seleccionados: receta.seleccionados },
          errores: ['Ya existe otra receta con ese código.'],
          status: 400,
        });
      } catch (renderError) {
        return next(renderError);
      }
    }
    next(error);
  }
});

router.post('/admin/recetas/:id/eliminar', requiereRol('admin'), async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return next();

  try {
    const { rows } = await query(
      'DELETE FROM receta WHERE id = $1 RETURNING codigo, nombre',
      [id]
    );
    if (!rows[0]) return next();

    await registrar(req.session.usuario.id, 'eliminar', 'receta', id, {
      codigo: rows[0].codigo,
      nombre: rows[0].nombre,
    });
    res.redirect(`/admin/recetas?ok=${encodeURIComponent('Receta eliminada.')}`);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
