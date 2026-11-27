// Respuesta visual al uso: la aplicación avisa cuando está cargando, pide
// confirmación antes de destruir algo y muestra lo que el usuario va a guardar.
// Sin frameworks, sin dependencias: eventos nativos y DOM.
(function () {
  'use strict';

  var cuerpo = document.body;
  var temporizadorLento = null;
  var temporizadorSeguridad = null;

  // ---------------------------------------------------------------- carga

  function empezarCarga() {
    cuerpo.classList.add('navegando');

    // El esqueleto aparece solo si la carga se demora: en conexión rápida no se
    // alcanza a ver y no parpadea.
    window.clearTimeout(temporizadorLento);
    temporizadorLento = window.setTimeout(function () {
      cuerpo.classList.add('navegando-lento');
    }, 220);

    // Red de seguridad: si la navegación se cancela (descarga, error, atrás),
    // no se queda la pantalla tapada para siempre.
    window.clearTimeout(temporizadorSeguridad);
    temporizadorSeguridad = window.setTimeout(terminarCarga, 10000);
  }

  function soltarBotones() {
    Array.prototype.forEach.call(document.querySelectorAll('.boton-cargando'), function (boton) {
      boton.classList.remove('boton-cargando');
      boton.removeAttribute('aria-busy');
      boton.disabled = false;
      if (boton.dataset.etiquetaOriginal) {
        boton.textContent = boton.dataset.etiquetaOriginal;
        delete boton.dataset.etiquetaOriginal;
      }
    });
  }

  function terminarCarga() {
    cuerpo.classList.remove('navegando', 'navegando-lento');
    window.clearTimeout(temporizadorLento);
    window.clearTimeout(temporizadorSeguridad);
    // Un formulario que volvió del historial no puede quedar con el botón
    // diciendo «Guardando…» ni deshabilitado para siempre.
    soltarBotones();
  }

  function marcarEnvio(formulario) {
    empezarCarga();
    var boton = formulario.querySelector('button[type="submit"], button:not([type])');
    if (!boton) return;
    boton.dataset.etiquetaOriginal = boton.textContent.trim();
    // Cada formulario puede decir qué está haciendo: «Entrando…», «Guardando…»,
    // «Eliminando…». Si no lo dice, Guardando es la verdad más probable.
    boton.textContent = boton.dataset.etiquetaCargando || 'Guardando…';
    boton.classList.add('boton-cargando');
    boton.setAttribute('aria-busy', 'true');
  }

  document.addEventListener('click', function (evento) {
    var enlace = evento.target.closest ? evento.target.closest('a') : null;
    if (!enlace) return;
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey || evento.button !== 0) return;
    if (enlace.target && enlace.target !== '_self') return;
    if (enlace.hasAttribute('download')) return;

    var href = enlace.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
    if (enlace.origin !== window.location.origin) return;

    empezarCarga();
  }, true);

  // -------------------------------------------------- confirmación propia

  // Un solo diálogo reutilizable, creado la primera vez que hace falta. Se usa
  // en lugar de window.confirm(): se puede estilizar, se lee en el celular y no
  // bloquea el hilo. Suele tener el foco atrapado mientras está abierto.
  var dialogo = null;
  var disparadorActual = null;
  var formularioPendiente = null;
  var confirmado = false;

  function construirDialogo() {
    var caja = document.createElement('div');
    caja.className = 'dialogo-fondo';
    caja.setAttribute('hidden', '');
    caja.innerHTML =
      '<div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="dialogo-titulo" aria-describedby="dialogo-texto">' +
      '<h2 class="dialogo-titulo" id="dialogo-titulo">¿Seguro?</h2>' +
      '<p class="dialogo-texto" id="dialogo-texto"></p>' +
      '<div class="dialogo-acciones">' +
      '<button type="button" class="boton boton-secundario" data-cancelar>Cancelar</button>' +
      '<button type="button" class="boton boton-peligro" data-aceptar>Eliminar</button>' +
      '</div></div>';

    caja.querySelector('[data-cancelar]').addEventListener('click', cerrarDialogo);
    caja.querySelector('[data-aceptar]').addEventListener('click', function () {
      var formulario = formularioPendiente;
      if (!formulario) return cerrarDialogo();
      confirmado = true;
      cerrarDialogo(true);
      // requestSubmit dispara el evento submit normal: el aviso de carga y el
      // botón se comportan igual que en un envío con el mouse.
      if (typeof formulario.requestSubmit === 'function') formulario.requestSubmit();
      else formulario.submit();
    });
    caja.addEventListener('click', function (evento) {
      if (evento.target === caja) cerrarDialogo();
    });

    document.body.appendChild(caja);
    return caja;
  }

  function abrirDialogo(formulario, disparador) {
    if (!dialogo) dialogo = construirDialogo();
    formularioPendiente = formulario;
    disparadorActual = disparador || document.activeElement;

    var texto = formulario.dataset.confirmar || 'Esta acción no se puede deshacer.';
    var boton = formulario.querySelector('button[type="submit"], button:not([type])');
    dialogo.querySelector('.dialogo-texto').textContent = texto;
    // El botón del diálogo dice lo mismo que el botón que lo abrió: «Enviar a
    // papelera» no se confunde con «Borrar definitivo».
    dialogo.querySelector('[data-aceptar]').textContent =
      (boton && boton.textContent.trim()) || (boton && boton.dataset.accion) || 'Eliminar';
    dialogo.removeAttribute('hidden');
    dialogo.querySelector('[data-cancelar]').focus();
  }

  function cerrarDialogo(confirmadoElEnvio) {
    if (!dialogo) return;
    dialogo.setAttribute('hidden', '');
    // Cancelar no puede dejar el formulario ni el botón a medio camino.
    if (!confirmadoElEnvio) soltarBotones();
    var volver = disparadorActual;
    formularioPendiente = null;
    disparadorActual = null;
    if (volver && volver.focus) volver.focus();
  }

  document.addEventListener('keydown', function (evento) {
    if (!dialogo || dialogo.hasAttribute('hidden')) return;
    if (evento.key === 'Escape') {
      evento.preventDefault();
      cerrarDialogo();
      return;
    }
    if (evento.key !== 'Tab') return;
    // Foco atrapado: Tab no se escapa del diálogo.
    var focos = dialogo.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focos.length) return;
    var primero = focos[0];
    var ultimo = focos[focos.length - 1];
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  });

  // ---------------------------------------------------------- envío

  // Fase normal (sin captura) y saliendo si alguien ya canceló el envío: así el
  // botón nunca se bloquea antes de que el usuario confirme.
  document.addEventListener('submit', function (evento) {
    if (evento.defaultPrevented) return;
    var formulario = evento.target;
    if (!formulario || formulario.dataset.sinCarga !== undefined) return;
    if (formulario.dataset.confirmar && !confirmado) {
      evento.preventDefault();
      abrirDialogo(formulario, formulario.querySelector('button[type="submit"]'));
      return;
    }
    confirmado = false;
    marcarEnvio(formulario);
  }, false);

  // ------------------------------------------------- previas de archivos

  function describir(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
  }

  function pintarPrevias(entrada) {
    var destino = document.getElementById(entrada.dataset.previa);
    if (!destino) return;
    var archivos = Array.prototype.slice.call(entrada.files || []);
    // Se liberan las URLs temporales anteriores antes de reemplazarlas.
    Array.prototype.forEach.call(destino.querySelectorAll('img[data-temporal]'), function (img) {
      URL.revokeObjectURL(img.src);
    });
    destino.innerHTML = '';

    var primeraImagen = true;
    archivos.forEach(function (archivo) {
      var ficha = document.createElement('li');
      ficha.className = 'previa-archivo';
      var esImagen = /^image\//.test(archivo.type);
      if (esImagen) {
        var img = document.createElement('img');
        img.src = URL.createObjectURL(archivo);
        img.alt = 'Vista previa de ' + archivo.name;
        img.setAttribute('data-temporal', '1');
        img.className = 'previa-miniatura';
        ficha.appendChild(img);
      } else {
        var icono = document.createElement('span');
        icono.className = 'previa-icono';
        icono.textContent = /pdf/i.test(archivo.type) ? 'PDF' : 'DOC';
        ficha.appendChild(icono);
      }
      var datos = document.createElement('span');
      datos.className = 'previa-datos';
      datos.textContent = archivo.name + ' · ' + describir(archivo.size);
      ficha.appendChild(datos);
      if (esImagen && primeraImagen) {
        var etiqueta = document.createElement('span');
        etiqueta.className = 'insignia insignia-info';
        etiqueta.textContent = 'Portada';
        ficha.appendChild(etiqueta);
        primeraImagen = false;
      }
      destino.appendChild(ficha);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('input[type="file"][data-previa]'), function (entrada) {
    entrada.addEventListener('change', function () { pintarPrevias(entrada); });
  });

  // --------------------------------------------------- previa de video

  function identificadorVideo(url) {
    try {
      var direccion = new URL(url);
      var host = direccion.hostname.replace(/^www\./, '');
      if (host === 'youtu.be') return { proveedor: 'youtube', id: direccion.pathname.slice(1) };
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        var id = direccion.searchParams.get('v');
        if (id) return { proveedor: 'youtube', id: id };
        var partes = direccion.pathname.split('/').filter(Boolean);
        if (['embed', 'shorts', 'live'].indexOf(partes[0]) !== -1 && partes[1]) {
          return { proveedor: 'youtube', id: partes[1] };
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('input[data-previa-video]'), function (entrada) {
    var destino = document.querySelector(entrada.dataset.previaVideo);
    if (!destino) return;
    function actualizar() {
      var video = identificadorVideo(entrada.value.trim());
      destino.innerHTML = '';
      if (!video) {
        destino.hidden = true;
        return;
      }
      var marco = document.createElement('iframe');
      marco.src = 'https://www.youtube-nocookie.com/embed/' + video.id;
      marco.title = 'Vista previa del video';
      marco.loading = 'lazy';
      marco.setAttribute('allowfullscreen', '');
      destino.appendChild(marco);
      destino.hidden = false;
    }
    entrada.addEventListener('input', actualizar);
    entrada.addEventListener('change', actualizar);
    actualizar();
  });

  // ------------------------------------------------ previa de la ficha

  // Los formularios de taller pueden mostrar cómo se verá la ficha pública
  // mientras se escribe: título, temática, fecha, estado y descripción.
  Array.prototype.forEach.call(document.querySelectorAll('[data-previa-ficha]'), function (formulario) {
    var destino = document.getElementById(formulario.dataset.previaFicha);
    if (!destino) return;
    function copiar() {
      Array.prototype.forEach.call(formulario.querySelectorAll('[data-campo]'), function (campo) {
        var salida = destino.querySelector('[data-campo="' + campo.dataset.campo + '"]');
        if (!salida) return;
        var valor = campo.value.trim();
        if (campo.tagName === 'SELECT') {
          valor = campo.options[campo.selectedIndex] ? campo.options[campo.selectedIndex].text : valor;
        }
        salida.textContent = valor || salida.dataset.vacio || '—';
      });
    }
    formulario.addEventListener('input', copiar);
    formulario.addEventListener('change', copiar);
    copiar();
  });

  // Volver con el botón «atrás» puede restaurar la página desde la caché del
  // navegador: ahí se limpia todo lo que quedó a medio camino.
  window.addEventListener('pageshow', terminarCarga);
  window.addEventListener('load', terminarCarga);

  // --------------------------------------------------- tablas en tarjetas

  // En el celular cada fila se muestra como tarjeta y cada celda necesita su
  // etiqueta («Taller», «Fecha»…). Se toma el texto del <th> de esa columna:
  // una sola fuente de verdad, sin repetir el rótulo en cada <td> de cada vista.
  Array.prototype.forEach.call(document.querySelectorAll('table.tabla'), function (tabla) {
    var encabezados = Array.prototype.map.call(
      tabla.querySelectorAll('thead th'),
      function (celda) { return celda.textContent.trim(); }
    );
    if (!encabezados.length) return;
    Array.prototype.forEach.call(tabla.querySelectorAll('tbody tr'), function (fila) {
      Array.prototype.forEach.call(fila.children, function (celda, indice) {
        if (celda.tagName !== 'TD' || celda.hasAttribute('data-columna')) return;
        celda.setAttribute('data-columna', encabezados[indice] || '');
      });
    });
  });
})();
