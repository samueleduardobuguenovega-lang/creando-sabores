/**
 * Validación en español, en el lugar del campo.
 *
 * Los formularios llevan `novalidate` para que el navegador no muestre su globo
 * nativo (que aparece en el idioma del sistema, tapa la etiqueta siguiente y solo
 * enseña el primer error). Acá se marcan todos los campos a la vez, cada mensaje
 * queda junto a su campo y el foco va al primero que falla.
 */
(function () {
  'use strict';

  var MENSAJES = {
    valueMissing: 'Completa este campo.',
    typeMismatch: 'Revisa el formato.',
    badInput: 'Revisa el formato.',
    tooShort: 'El texto es demasiado corto.',
    tooLong: 'El texto es demasiado largo.',
    rangeUnderflow: 'El valor es demasiado bajo.',
    rangeOverflow: 'El valor es demasiado alto.',
    patternMismatch: 'Revisa el formato.',
  };

  function campos(form) {
    return Array.prototype.slice.call(
      form.querySelectorAll('input:not([type=hidden]):not([type=submit]), select, textarea')
    );
  }

  function mensajeDe(campo) {
    var v = campo.validity;
    if (!v || v.valid) return '';
    var claves = Object.keys(MENSAJES);
    for (var i = 0; i < claves.length; i += 1) {
      if (v[claves[i]]) return MENSAJES[claves[i]];
    }
    return 'Revisa este campo.';
  }

  function etiquetaDe(campo, indice) {
    var etiqueta = campo.id ? document.querySelector('label[for="' + campo.id + '"]') : null;
    if (!etiqueta) etiqueta = campo.closest('label');
    var texto = etiqueta ? etiqueta.textContent.replace(/\s+/g, ' ').trim() : '';
    return texto || campo.name || 'campo ' + (indice + 1);
  }

  function limpiar(form) {
    Array.prototype.forEach.call(form.querySelectorAll('.error-campo'), function (n) {
      n.parentNode.removeChild(n);
    });
    Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid="true"]'), function (c) {
      c.removeAttribute('aria-invalid');
      var descrito = (c.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter(function (id) { return id && id.indexOf('error-') !== 0; })
        .join(' ');
      if (descrito) c.setAttribute('aria-describedby', descrito);
      else c.removeAttribute('aria-describedby');
    });
    var resumen = form.querySelector('.resumen-errores');
    if (resumen) resumen.parentNode.removeChild(resumen);
  }

  function marcar(campo, texto) {
    var id = 'error-' + (campo.id || campo.name || Math.random().toString(36).slice(2));
    var aviso = document.createElement('p');
    aviso.className = 'error-campo';
    aviso.id = id;
    aviso.textContent = texto;
    campo.insertAdjacentElement('afterend', aviso);
    campo.setAttribute('aria-invalid', 'true');
    var descrito = (campo.getAttribute('aria-describedby') || '').trim();
    campo.setAttribute('aria-describedby', descrito ? descrito + ' ' + id : id);
  }

  function validar(form) {
    limpiar(form);
    var fallos = [];
    campos(form).forEach(function (campo, i) {
      if (campo.disabled || campo.type === 'checkbox' || campo.type === 'radio') return;
      var texto = mensajeDe(campo);
      if (!texto) return;
      marcar(campo, texto);
      fallos.push({ campo: campo, etiqueta: etiquetaDe(campo, i), texto: texto });
    });

    if (!fallos.length) return true;

    var caja = document.createElement('div');
    caja.className = 'mensaje mensaje-error resumen-errores';
    caja.setAttribute('role', 'alert');
    caja.setAttribute('tabindex', '-1');
    var titulo = document.createElement('p');
    titulo.textContent = fallos.length === 1
      ? 'Falta un dato para guardar:'
      : 'Faltan ' + fallos.length + ' datos para guardar:';
    var lista = document.createElement('ul');
    fallos.forEach(function (fallo) {
      var li = document.createElement('li');
      var enlace = document.createElement('a');
      enlace.href = '#';
      enlace.textContent = fallo.etiqueta;
      enlace.addEventListener('click', function (ev) {
        ev.preventDefault();
        fallo.campo.focus();
      });
      li.appendChild(enlace);
      li.appendChild(document.createTextNode(': ' + fallo.texto.toLowerCase()));
      lista.appendChild(li);
    });
    caja.appendChild(titulo);
    caja.appendChild(lista);
    form.insertBefore(caja, form.firstChild);
    caja.focus();
    return false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    Array.prototype.forEach.call(document.querySelectorAll('form[novalidate]'), function (form) {
      form.addEventListener('submit', function (ev) {
        if (!validar(form)) {
          ev.preventDefault();
          return;
        }
        limpiar(form);
      });
      // Al corregir un campo, su aviso desaparece en cuanto deja de ser válido el motivo.
      form.addEventListener('input', function (ev) {
        var campo = ev.target;
        if (!campo.matches || !campo.matches('[aria-invalid="true"]')) return;
        if (campo.validity && campo.validity.valid) {
          var id = 'error-' + (campo.id || campo.name);
          var aviso = document.getElementById(id);
          if (aviso) aviso.parentNode.removeChild(aviso);
          campo.removeAttribute('aria-invalid');
        }
      });
    });
  });
})();
