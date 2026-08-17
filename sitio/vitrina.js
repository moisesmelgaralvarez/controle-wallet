/* ============================================================
   La vitrina — tres aparatos, uno a la vez.

   La escena se clava y los actos se relevan mientras el visitante
   baja. Cada acto trae su aparato y su texto; adentro de la pantalla
   corre una película de la interfaz trabajando.

   SIN ESTE ARCHIVO la sección se ve COMPLETA: los tres bloques
   apilados, cada uno con su póster —que es el último cuadro de su
   película, o sea la pantalla terminada— y su texto. No hay riel de
   pasos, porque un control que cambia a algo que ya está a la vista
   no controla nada. Es una lista, se lee de arriba abajo, y no falta
   ni una palabra.

   CUATRO DECISIONES, Y NINGUNA ES DE GUSTO:

   1. NO SE MIDE EN CADA CUADRO. Un `scroll` que calcula posiciones
      corre 120 veces por segundo en un ratón de rueda libre. Acá los
      tres tramos los vigila un IntersectionObserver contra una línea
      de un píxel en el medio de la ventana: el navegador avisa tres
      veces en todo el recorrido, y el resto del trabajo lo hace CSS.

   2. LOS TRAMOS MIDEN UN TERCIO CADA UNO, no un píxel. Con
      centinelas finos hay instantes en que ninguno cruza la línea y
      el acto se queda en el anterior por accidente; con tramos que
      llenan la pista, en el medio de la ventana siempre hay
      exactamente uno, y el estado no puede quedar indefinido.

   3. EL `src` SE PONE DESDE ACÁ. Quien no vaya a ver la película
      —ventana chica, movimiento reducido, o sin JavaScript— no baja
      193 KB que no va a usar. Le quedan los pósters, que ya son la
      composición terminada.

   4. LA PELÍCULA VUELVE A EMPEZAR AL ENTRAR SU ACTO, y se pausa al
      salir. Una demostración que arranca a la mitad no demuestra
      nada, y tres videos corriendo a la vez fuera de pantalla gastan
      batería para nadie.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  /* LAS CONSTANTES VAN ADENTRO, y no arriba del archivo como en el resto del
     sitio. Estos son scripts clásicos: comparten UN solo ámbito global, y un
     `const` repetido en dos archivos no es una advertencia — es un
     `SyntaxError` que mata el archivo entero antes de la primera línea.

     Pasó acá: /hero.js ya declaraba `ANCHO_MINIMO`, este declaraba otro, y la
     vitrina no se encendía nunca. Sin síntoma: la sección se veía como la
     lista de reposo, que es una composición correcta, así que el fallo no se
     parecía a un fallo. Lo encontró la consola, no el ojo. */
  const ANCHO_MINIMO = 1024;   /* 64rem — el mismo umbral que la hoja  */
  const ALTO_MINIMO  = 736;    /* 46rem — si cambia uno, cambian los dos */

  const vitrina = document.querySelector('.vitrina');
  if (!vitrina) return;

  const escena = vitrina.querySelector('.vitrina__escena');
  const actos  = [...vitrina.querySelectorAll('.tarima')];
  const tramos = [...vitrina.querySelectorAll('.vitrina__tramo')];
  const pasos  = [...vitrina.querySelectorAll('.paso')];
  if (!escena || actos.length !== tramos.length || !actos.length) return;

  const quietud = matchMedia('(prefers-reduced-motion: reduce)');
  const cabe = () =>
    innerWidth >= ANCHO_MINIMO && innerHeight >= ALTO_MINIMO && !quietud.matches;

  /* Si no cabe, la sección se queda como está en el marcado: la lista. No se
     enciende nada y no se descarga ninguna película. */
  if (!cabe()) return;

  vitrina.classList.add('vitrina--viva');

  const cintas = actos.map((a) => a.querySelector('.chasis__cinta'));
  for (const cinta of cintas) {
    if (cinta && cinta.dataset.cinta) {
      cinta.src = cinta.dataset.cinta;
      cinta.load();
    }
  }

  let actual = -1;

  const mostrar = (i) => {
    if (i === actual) return;
    actual = i;

    actos.forEach((acto, n) => acto.toggleAttribute('data-vivo', n === i));
    pasos.forEach((paso, n) => paso.setAttribute('aria-current', String(n === i)));

    cintas.forEach((cinta, n) => {
      if (!cinta) return;
      if (n === i) {
        cinta.currentTime = 0;
        /* `play()` devuelve una promesa que se rechaza si el navegador
           decide que no. No es un error que haya que reportar: el póster
           —la pantalla terminada— ya está debajo. */
        cinta.play().catch(() => {});
      } else {
        cinta.pause();
      }
    });
  };

  /* La línea de un píxel en el medio de la ventana. El tramo que la cruza
     manda. */
  const vigia = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) mostrar(Number(e.target.dataset.tramo));
      }
    },
    { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
  );
  for (const tramo of tramos) vigia.observe(tramo);

  mostrar(0);

  /* Los pasos llevan a su tramo. `scrollIntoView` con `center` deja el tramo
     cruzando la línea del vigía, que es exactamente la condición que
     enciende ese acto: el riel no fuerza el estado, lo pide. Así no hay dos
     fuentes de verdad que se puedan contradecir. */
  pasos.forEach((paso) => {
    paso.addEventListener('click', () => {
      const destino = tramos[Number(paso.dataset.va)];
      if (destino) destino.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });

  /* Si la ventana deja de dar el tamaño —alguien achica, o gira la tableta—
     la escena se apaga y vuelve la lista. Al revés no: encender a mitad de
     recorrido dejaría al visitante parado en una pista de 320svh que hasta
     hace un segundo no existía, y el scroll saltaría. */
  addEventListener('resize', () => {
    if (!cabe() && vitrina.classList.contains('vitrina--viva')) {
      vigia.disconnect();
      vitrina.classList.remove('vitrina--viva');
      for (const acto of actos) acto.removeAttribute('data-vivo');
      for (const cinta of cintas) if (cinta) cinta.pause();
    }
  }, { passive: true });
});
