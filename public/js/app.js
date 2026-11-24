// Respuesta visual al uso: la aplicación avisa cuando está cargando.
// Sin frameworks: dos eventos (clic y envío) alcanzan para que el sitio no se
// sienta congelado en una conexión lenta.
(function () {
  'use strict';

  var cuerpo = document.body;
  var temporizadorLento = null;
  var temporizadorSeguridad = null;

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

  function terminarCarga() {
    cuerpo.classList.remove('navegando', 'navegando-lento');
    window.clearTimeout(temporizadorLento);
    window.clearTimeout(temporizadorSeguridad);

    // Un formulario que volvió del historial no puede quedar con el botón
    // diciendo «Guardando…».
    Array.prototype.forEach.call(document.querySelectorAll('.boton-cargando'), function (boton) {
      boton.classList.remove('boton-cargando');
      boton.removeAttribute('aria-busy');
      if (boton.dataset.etiquetaOriginal) {
        boton.textContent = boton.dataset.etiquetaOriginal;
        delete boton.dataset.etiquetaOriginal;
      }
    });
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

  document.addEventListener('submit', function (evento) {
    var formulario = evento.target;
    if (!formulario || formulario.dataset.sinCarga !== undefined) return;

    empezarCarga();

    var boton = formulario.querySelector('button[type="submit"], button:not([type])');
    if (!boton || boton.disabled) return;

    boton.dataset.etiquetaOriginal = boton.textContent.trim();
    // Cada formulario puede decir qué está haciendo: «Entrando…», «Guardando…»,
    // «Eliminando…». Si no lo dice, Guardando es la verdad más probable.
    boton.textContent = boton.dataset.etiquetaCargando || 'Guardando…';
    boton.classList.add('boton-cargando');
    boton.setAttribute('aria-busy', 'true');
  }, true);

  // Volver con el botón «atrás» puede restaurar la página desde la caché del
  // navegador: ahí se limpia todo lo que quedó a medio camino.
  window.addEventListener('pageshow', terminarCarga);
  window.addEventListener('load', terminarCarga);
})();
