/* ============================================================
   La hoja de «Más».

   La barra del teléfono lleva cuatro destinos fijos —los de todos los
   días— y esta hoja lleva los otros cinco. Antes la barra tenía seis y
   los otros tres no estaban en ninguna parte: desde un teléfono no se
   llegaba a Importar, a Informe ni a Tu cuenta, que es donde se exportan
   y se borran los datos.

   SIN ESTE ARCHIVO no se pierde el acceso: la hoja nace con `hidden` y
   el botón «Más» no aparece —lo esconde la propia hoja de estilo cuando
   no hay quien la abra—, así que nunca queda un control muerto. Los
   nueve enlaces siguen en el riel, que en teléfono va al final del
   documento y es lo que lee quien navega sin JavaScript.

   TRES COSAS QUE UNA HOJA ASÍ TIENE QUE HACER Y CASI NUNCA HACE

   1. CERRARSE TOCANDO AFUERA. En un teléfono se espera antes que buscar
      una equis.
   2. DEVOLVER EL FOCO. Quien la abrió con el teclado tiene que volver al
      botón, no al principio del documento.
   3. NO DEJAR SCROLL DETRÁS. Con la hoja abierta, arrastrar mueve la
      página de atrás y la hoja se queda flotando sobre otro contenido.
   ============================================================ */

const ABIERTA = 'data-abierta';

document.addEventListener('DOMContentLoaded', () => {
  const hoja  = document.querySelector('[data-hoja-mas]');
  const boton = document.querySelector('[data-mas]');
  if (!hoja || !boton) return;

  /* El botón nace con `hidden` en el marcado y se enciende acá: así nunca
     existe un control que no hace nada. Es la misma decisión que ya tomó
     `menu.js` con el tirador de la cabecera. */
  boton.hidden = false;

  const fondo = hoja.querySelector('[data-cerrar-mas]');
  let devolverFoco = false;

  const abrir = () => {
    hoja.hidden = false;
    /* Un cuadro antes de marcarla abierta: si se pone `hidden = false` y
       el atributo en el mismo cuadro, el navegador no tiene un estado
       inicial desde el cual animar y la hoja aparece de golpe. */
    requestAnimationFrame(() => hoja.setAttribute(ABIERTA, ''));
    boton.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    const primero = hoja.querySelector('.hoja-mas__ir');
    if (primero) primero.focus({ preventScroll: true });
  };

  const cerrar = () => {
    if (!hoja.hasAttribute(ABIERTA)) return;
    hoja.removeAttribute(ABIERTA);
    boton.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (devolverFoco) { boton.focus({ preventScroll: true }); devolverFoco = false; }
    /* Se esconde recién cuando terminó de bajar. Con `hidden` inmediato
       desaparecería sin animación, que es peor que no animarla. */
    const fin = () => { if (!hoja.hasAttribute(ABIERTA)) hoja.hidden = true; };
    const panel = hoja.querySelector('.hoja-mas__panel');
    if (panel && matchMedia('(prefers-reduced-motion: no-preference)').matches) {
      panel.addEventListener('transitionend', fin, { once: true });
      setTimeout(fin, 400);          // por si la transición no dispara
    } else fin();
  };

  boton.addEventListener('click', () => {
    devolverFoco = boton.matches(':focus-visible');
    hoja.hasAttribute(ABIERTA) ? cerrar() : abrir();
  });

  if (fondo) fondo.addEventListener('click', cerrar);

  /* Escape cierra, y el foco vuelve al botón: quien llegó con el teclado
     no puede quedar dando vueltas dentro de una hoja cerrada. */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hoja.hasAttribute(ABIERTA)) { devolverFoco = true; cerrar(); }
  });

  /* Ir a una sección cierra la hoja. Sin esto queda abierta encima de la
     pantalla a la que se acaba de navegar. */
  for (const ir of hoja.querySelectorAll('.hoja-mas__ir')) {
    ir.addEventListener('click', cerrar);
  }

  /* Y al pasar a escritorio la hoja deja de tener sentido: ahí está el
     riel con los nueve destinos a la vista. */
  matchMedia('(min-width: 900px)').addEventListener('change', (m) => {
    if (m.matches) cerrar();
  });
});
