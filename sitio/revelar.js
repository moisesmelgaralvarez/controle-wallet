/* ============================================================
   REVELAR — lo que entra cuando el ojo llega.

   Treinta líneas y ninguna dependencia. La regla 9 no se dobla ni un
   poco: no hace falta. El sitio que sirvió de referencia mueve cuarenta
   y tres piezas sin GSAP, sin Lottie y sin Framer — con un
   `IntersectionObserver` y una clase, que es exactamente esto.

   POR QUÉ VA EN EL <head> Y SIN `defer`

   Todo lo demás en este sitio carga con `defer`, y está bien: nada de
   eso decide cómo se ve el primer cuadro. Esto sí. La hoja esconde
   `[data-revelar]` únicamente cuando el <html> lleva la clase `revela`,
   y esa clase la pone la primera línea de este archivo. Con `defer`, el
   navegador pintaría la página entera con todo a la vista y medio
   segundo después la escondería de golpe para volver a revelarla — un
   parpadeo peor que no animar nada.

   Cuesta cerca de un milisegundo de parseo. Es el precio correcto.

   Y de ahí sale sola la respuesta a «¿y si no hay JavaScript?»: sin este
   archivo nadie pone la clase, la hoja no esconde nada y la página se ve
   completa y quieta. No hay un estado en que el contenido quede
   invisible esperando un script que no llegó.

   EL VOCABULARIO ES EL DEL PAPEL, NO EL DE LA REFERENCIA

   Allá el movimiento son 32 y 40 px, que en una pantalla grande se lee
   como una diapositiva. Acá son 12 px —los mismos `0.75rem` con que ya
   entra la portada— porque `IDENTIDAD.md` lo dice en una línea: el
   movimiento se mide en milímetros. Y la curva es `--curva`, la única
   que existe en el sistema.

   TRES COSAS QUE HACEN LA DIFERENCIA Y CASI NADIE HACE

   1. SE REVELA UNA VEZ. Volver a esconder algo al subir convierte la
      página en un juguete y marea a quien solo quería releer un párrafo.
   2. `will-change` SE QUITA AL TERMINAR. Es una promesa de que algo va a
      moverse: dejarla puesta en cuarenta piezas quietas le pide al
      navegador una capa por cada una, para siempre.
   3. LO QUE YA ESTÁ EN PANTALLA NO ESPERA. El observador dispara al
      empezar a observar, así que lo visible al cargar entra de una vez
      —escalonado— y no se queda esperando un scroll que quizá no ocurra.
   ============================================================ */

document.documentElement.classList.add('revela');

document.addEventListener('DOMContentLoaded', () => {
  const piezas = document.querySelectorAll('[data-revelar]');
  if (!piezas.length) return;

  /* Sin movimiento no hay nada que observar: la hoja ya las deja visibles
     y quietas. Montar el observador igual sería trabajo para nada. */
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.remove('revela');
    return;
  }

  /* El escalonado se calcula acá y no en la hoja: `nth-child` contaría
     TODOS los hermanos, y en una tanda suele haber un título o una nota
     que no se revela. Lo que importa es el orden entre las que sí.

     Y VA CON TOPE. Sin él, la página de preguntas —doce en una tanda—
     dejaba a la última esperando 770 ms después de entrar en pantalla: se
     mide, se ve, y se lee como que la página va lenta. Con el tope, las
     primeras cinco dan la sensación de cascada —que es para lo que sirve—
     y de ahí en adelante entran juntas. Nadie cuenta hasta doce; lo que el
     ojo registra es que no llegaron todas de golpe. */
  const TANDA_MAX = 5;
  for (const tanda of document.querySelectorAll('[data-revelar-tanda]')) {
    const hijas = tanda.querySelectorAll(':scope > [data-revelar]');
    hijas.forEach((el, i) =>
      el.style.setProperty('--revelar-espera', Math.min(i, TANDA_MAX) * 70 + 'ms'));
  }

  const pendientes = new Set(piezas);

  const revelar = (el, seco) => {
    pendientes.delete(el);
    vigia.unobserve(el);
    /* «Seco» es sin transición: la pieza ya quedó arriba de la pantalla y
       nadie la va a ver entrar. Animarla sería gastar cuadros en algo que
       ocurre fuera de la vista, y dejaría contenido a medio aparecer si el
       lector vuelve a subir en ese instante. */
    if (seco) el.style.transition = 'none';
    el.classList.add('revelado');
    if (seco) {
      requestAnimationFrame(() => { el.style.transition = ''; el.style.willChange = 'auto'; });
      return;
    }
    /* Al terminar la transición la pieza queda quieta para siempre: la capa
       de composición ya no compra nada y cuesta memoria. */
    el.addEventListener('transitionend', function limpiar(ev) {
      if (ev.target !== el) return;                  // no las de adentro
      el.style.willChange = 'auto';
      el.removeEventListener('transitionend', limpiar);
    });
  };

  /* EL BARRIDO, Y POR QUÉ HACE FALTA SI YA HAY UN OBSERVADOR.

     El observador avisa cuando una pieza CRUZA el umbral, y para eso tiene
     que haber cuadros en los que la pieza esté cruzando. En un salto no los
     hay: el navegador pasa de arriba del todo a abajo del todo en un solo
     cuadro, y todo lo que quedó en el medio pasó de «debajo de la pantalla»
     a «encima de la pantalla» sin estar nunca dentro. El observador no
     dispara y esas piezas se quedan invisibles para siempre.

     No es un caso de laboratorio: pasa al recargar una página que el
     navegador restaura a media altura, y al llegar por un enlace con
     ancla. Se midió — un salto al pie dejaba 21 de 24 piezas escondidas.

     Por eso el barrido solo mira lo que ya quedó ARRIBA de la pantalla. No
     duplica el trabajo del observador: atiende exactamente el hueco que el
     observador no puede ver. */
  let pedido = 0;
  const barrer = () => {
    pedido = 0;
    for (const el of pendientes) {
      if (el.getBoundingClientRect().bottom < 0) revelar(el, true);
    }
    if (!pendientes.size) removeEventListener('scroll', alBajar);
  };
  const alBajar = () => { if (!pedido) pedido = requestAnimationFrame(barrer); };

  const vigia = new IntersectionObserver((entradas) => {
    for (const e of entradas) if (e.isIntersecting) revelar(e.target, false);
  }, {
    /* Un poco antes de que asome del todo. Con el umbral en 0 puro, algo
       alto empieza a entrar cuando ya se le ve el borde y el movimiento
       llega tarde; con `-8%` arranca justo cuando el ojo lo va a buscar. */
    rootMargin: '0px 0px -8% 0px',
    threshold: 0,
  });

  for (const p of piezas) vigia.observe(p);

  addEventListener('scroll', alBajar, { passive: true });
  /* Y una vez al arrancar, por la página que el navegador restaura a media
     altura: ahí el salto ya ocurrió antes de que existiera el observador. */
  barrer();
});
