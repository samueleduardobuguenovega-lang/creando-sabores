// Etiqueta «En el fuego» de la portada: pasa de receta en receta.
//
// Cada receta es un enlace propio y todos están en el HTML, así que sin
// JavaScript se ve y se abre la primera. El turno se detiene mientras alguien
// la mira (ratón encima o foco del teclado) y cuando la pestaña no se ve.
(function () {
  var caja = document.querySelector('[data-turno]');
  if (!caja) return;

  var enlaces = caja.querySelectorAll('.plato-nombre');
  if (enlaces.length < 2) return;

  var quieto = window.matchMedia('(prefers-reduced-motion: reduce)');
  var SEGUNDOS = 5000;
  var actual = 0;
  var turno = null;

  function mostrar(indice) {
    actual = indice;
    for (var i = 0; i < enlaces.length; i += 1) {
      enlaces[i].classList.toggle('activo', i === indice);
    }
  }

  function parar() {
    if (turno) {
      clearInterval(turno);
      turno = null;
    }
  }

  function arrancar() {
    parar();
    if (quieto.matches || document.hidden) return;
    turno = setInterval(function () {
      mostrar((actual + 1) % enlaces.length);
    }, SEGUNDOS);
  }

  caja.addEventListener('mouseenter', parar);
  caja.addEventListener('mouseleave', arrancar);
  caja.addEventListener('focusin', parar);
  caja.addEventListener('focusout', arrancar);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) parar();
    else arrancar();
  });

  arrancar();
})();
