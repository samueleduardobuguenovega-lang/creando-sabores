// Facetas de las colecciones: un solo lugar que arma las URLs de filtro y los
// chips activos. Antes cada vista concatenaba "?a=1&b=2" a mano y un enlace
// borraba los filtros vecinos o dejaba un "&" colgando.
//
// Uso en una ruta:
//   const urlFiltro = creadorDeUrls('/recetas', { q, taller, conArchivo });
//   res.render('...', { urlFiltro, ... });

function creadorDeUrls(base, actuales) {
  return (cambios = {}) => {
    const parametros = new URLSearchParams();
    const valores = { ...actuales, ...cambios };
    Object.keys(valores).forEach((clave) => {
      const valor = valores[clave];
      if (valor === null || valor === undefined || valor === '' || valor === false) return;
      parametros.set(clave, valor === true ? '1' : valor);
    });
    const cadena = parametros.toString();
    return cadena ? `${base}?${cadena}` : base;
  };
}

// Chips removibles: [{ etiqueta: 'Temática: Conservas', quitar: '/talleres?...' }]
function chip(etiqueta, quitar) {
  return { etiqueta, quitar };
}

module.exports = { creadorDeUrls, chip };
