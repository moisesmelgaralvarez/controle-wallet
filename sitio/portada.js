/* ============================================================
   La pantalla — la película de la portada.

   Le pone el `src` a la película, la reproduce una vez y la deja
   descansando en su último cuadro, que es exactamente el póster:
   al terminar calza con la imagen de abajo y no hay salto.

   SIN ESTE ARCHIVO EL ACTO SE VE COMPLETO: el marco con su póster,
   que es el resumen del mes ya calculado. Nadie ve una caja negra
   esperando algo que no llega. Por eso el `src` no está en el
   marcado y por eso el `preload` es `none`.

   POR QUÉ NO HAY DESCARGA POR PARTES NI ANILLO DE PROGRESO

   Los tenía, y sobraban. Vienen de la receta para RASPAR un video
   contra el scroll, que necesita buscar cuadro por cuadro; y buscar
   exige que el servidor admita descarga parcial, cosa que no todos
   hacen — de ahí el truco de bajar el archivo entero a memoria.

   Acá no se raspa nada: la película se reproduce una vez. Con un
   `src` directo el navegador la transmite progresivamente y empieza
   a verse antes, sin esperar el archivo completo.

   Y hay una razón mejor: el objeto en memoria se sirve por una URL
   `blob:`, que la CSP de este sitio prohíbe. Se midió —
   «MEDIA_ELEMENT_ERROR: Media load rejected» — y la salida NO era
   agregarle `blob:` a `media-src`. Era no necesitarlo.

   LAS COMPUERTAS

   Cuatro acá, y en `papel.css` las mismas cuatro repartidas en dos
   grupos: tres de TAMAÑO, que esconden el acto entero porque a esa
   escala el tablero no se lee, y una de MOVIMIENTO, que deja el acto
   y solo quita la película.

   Acá van juntas a propósito: las dos cosas terminan en lo mismo —no
   bajar el archivo—, y el reparto en dos grupos es una decisión de
   composición que solo le importa a la hoja. Si una lista cambia y la
   otra no, un lado esconde lo que el otro descarga.

   Y se deciden EN VIVO, no una vez al cargar. Las media queries se
   reevalúan al girar el aparato, al agrandar la ventana o al apagar
   la preferencia de movimiento; una comprobación única deja la
   pantalla en blanco en cuanto pasa cualquiera de las tres cosas.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const figura = document.querySelector('.pantalla');
  const cinta  = document.querySelector('.pantalla__cinta');
  if (!figura || !cinta) return;

  const FUENTE = cinta.dataset.cinta;

  /* Las mismas cuatro de `papel.css`. Si cambia una, cambian las dos.
     El 1080 no es redondo por gusto: es el ancho de ventana con el que el
     marco llega a 883 px, que es lo que necesita el texto más chico del
     tablero para no bajar de 10 px. Está medido en la hoja. */
  const COMPUERTAS = [
    '(max-width: 1080px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)',
  ];
  const LISTAS = COMPUERTAS.map((q) => matchMedia(q));

  let encendida = false;

  const fallar = () => {
    figura.classList.remove('pantalla--cargando', 'pantalla--lista');
    figura.classList.add('pantalla--sin-cinta');
  };

  const encender = () => {
    if (encendida) return;
    encendida = true;
    figura.classList.remove('pantalla--sin-cinta');
    figura.classList.add('pantalla--cargando');

    if (!cinta.src) {
      cinta.preload = 'auto';
      cinta.src = FUENTE;
    }

    /* `canplay` y no `loadeddata`: el primero promete que hay con qué seguir
       reproduciendo, el segundo solo que llegó el primer cuadro. Arrancar con
       el segundo da un tirón en una conexión lenta. */
    cinta.addEventListener('canplay', () => {
      figura.classList.remove('pantalla--cargando');
      figura.classList.add('pantalla--lista');
      /* Se reproduce una sola vez y se queda en el último cuadro, que es el
         póster. Si el navegador la rechaza no es un error que reportar:
         debajo ya está esa misma imagen. */
      cinta.play().catch(() => {});
    }, { once: true });
  };

  const apagar = () => {
    if (!encendida) return;
    encendida = false;
    cinta.pause();
    figura.classList.remove('pantalla--cargando', 'pantalla--lista');
  };

  const decidir = () => {
    if (LISTAS.some((m) => m.matches)) apagar();
    else encender();
  };

  cinta.addEventListener('error', fallar);
  for (const m of LISTAS) m.addEventListener('change', decidir);

  /* No arranca al cargar: arranca cuando el acto se acerca. La portada va
     antes, y todo lo que se baje de entrada le quita ancho de banda a lo que
     el visitante sí está viendo. Con 218 KB ya no es el problema que era con
     6.3 MB, pero la regla sigue siendo correcta y no cuesta nada. */
  if ('IntersectionObserver' in window) {
    const vigia = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        vigia.disconnect();
        decidir();
      }
    }, { rootMargin: '300px 0px' });
    vigia.observe(figura);
  } else {
    decidir();
  }
});
