/* ============================================================
   El hero raspado por el scroll.

   El video NO se reproduce solo: su tiempo lo pone el dedo. Bajás
   y avanza; subís y retrocede. El scroll es la aguja.

   CUATRO DECISIONES, Y NINGUNA ES DE GUSTO:

   1. El `src` se pone desde acá, no en el marcado. Así el video no
      se descarga en teléfono ni para quien pidió menos movimiento:
      esas 311 KB no se gastan si no se van a usar. En su lugar
      queda el póster, que pesa 19 KB y ya está compuesto.

   2. Se busca con un candado. Pedir un `currentTime` nuevo mientras
      el anterior todavía no llegó encola búsquedas y el video se
      traba. Se ignora todo pedido hasta que `seeked` avisa.

   3. El tiempo mostrado PERSIGUE al tiempo pedido en vez de saltar a
      él. Sin eso, un golpe de rueda del ratón mueve el video de
      medio segundo de una vez y se ve como un corte.

   4. El bucle se duerme. Cuando lo mostrado y lo pedido coinciden,
      deja de pedir cuadros: un rAF corriendo para siempre calienta
      la batería sin dibujar nada.

   Sin este archivo la portada se ve completa: el póster de fondo y
   el instrumento en CSS por delante. El video es la atmósfera, no
   el contenido.
   ============================================================ */

const ANCHO_MINIMO = 1000;          /* debajo de esto manda el póster */
const PERSECUCION  = 0.12;          /* cuánto se acerca por cuadro */

document.addEventListener('DOMContentLoaded', () => {
  const video = document.querySelector('[data-hero]');
  const acto  = document.querySelector('.acto');
  if (!video || !acto) return;

  const quietud = matchMedia('(prefers-reduced-motion: reduce)');
  const angosto = matchMedia(`(max-width: ${ANCHO_MINIMO - 1}px)`);
  if (quietud.matches || angosto.matches) return;

  video.src = video.dataset.hero;
  video.load();

  let duracion = 0;
  let pedido = 0, mostrado = 0;
  let buscando = false, despierto = false;

  video.addEventListener('seeked', () => { buscando = false; });

  video.addEventListener('loadedmetadata', () => {
    duracion = video.duration || 0;
    acto.classList.add('acto--filmado');
    medir();
  }, { once: true });

  /* Cuánto se ha recorrido del acto, de 0 a 1. Se mide contra la
     altura de la ventana y no contra la del acto: así el raspado
     dura lo mismo en un portátil que en un monitor alto. */
  const progreso = () => {
    const alto = acto.offsetHeight - innerHeight;
    if (alto <= 0) return 0;
    return Math.min(1, Math.max(0, scrollY / alto));
  };

  const cuadro = () => {
    /* Nunca hasta el final exacto: el último cuadro de un mp4 a veces
       no se puede buscar y el video se queda en negro. */
    const dif = pedido - mostrado;

    if (Math.abs(dif) < 0.004) { despierto = false; return; }

    mostrado += dif * PERSECUCION;

    if (!buscando) {
      buscando = true;
      video.currentTime = mostrado;
    }

    requestAnimationFrame(cuadro);
  };

  const medir = () => {
    if (!duracion) return;
    pedido = progreso() * (duracion - 0.05);
    if (!despierto) { despierto = true; requestAnimationFrame(cuadro); }
  };

  addEventListener('scroll', medir, { passive: true });
  addEventListener('resize', medir, { passive: true });
});
