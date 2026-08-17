/* ============================================================
   EL MUNDO — el lienzo vivo que sostiene la página entera.

   NO ES UN FONDO BONITO. Es la tesis del producto, dibujándose:
   dos líneas de tiempo que no calzan. La de arriba es el mes del
   calendario; la de abajo, el ciclo real de la tarjeta. El ciclo
   empieza antes y termina antes, y esa diferencia —el DESFASE— es
   el hueco de luz salmón que queda entre las dos.

   POR QUÉ UN LIENZO Y NO UNA PELÍCULA
   La portada tenía un mp4 de 311 KB. Se ve igual siempre, no
   responde a nada y hay que volver a generarlo —y a pagarlo— cada
   vez que cambie una decisión de arte. Esto pesa 8 KB, corre a 60
   cuadros, responde al puntero y al scroll, y se afina cambiando un
   número. Además el mp4 no puede hacer lo único que importa acá:
   que las dos líneas SE JUNTEN al final del recorrido, que es la
   promesa del producto contada sin una palabra.

   POR QUÉ NO ROMPE NINGUNA REGLA
   Sin dependencias: es Canvas 2D, que ya viene en el navegador. Sin
   estilos en línea: el lienzo se dimensiona por atributo `width` y
   `height`, que son geometría y no estilo — la misma razón por la
   que /ciclo.js mueve atributos de SVG. Sin peticiones externas.
   Y los colores NO se escriben acá: se leen de `marca.css`, así que
   el ADN sigue teniendo un solo dueño.

   QUIÉN NO LO VE
   Con `prefers-reduced-motion` se dibuja UN cuadro y se apaga el
   reloj: queda la composición, quieta y completa. Sin JavaScript no
   hay lienzo y la página se ve entera igual — el mundo es
   atmósfera, nunca contenido.
   ============================================================ */

(() => {
  const lienzo = document.querySelector('[data-mundo]');
  if (!lienzo || !lienzo.getContext) return;

  const pincel = lienzo.getContext('2d', { alpha: true });
  const quietud = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- la paleta sale de marca.css, no de acá ---------- */
  const tinte = (nombre, respaldo) => {
    const v = getComputedStyle(document.body).getPropertyValue(nombre).trim();
    return v || respaldo;
  };
  let VERDE, SALMON, LUZ;
  const leerPaleta = () => {
    VERDE  = tinte('--verde',  '#95d3ba');
    SALMON = tinte('--salmon', '#ffb4a9');
    LUZ    = tinte('--luz',    '#f4f3f1');
  };
  leerPaleta();

  /* Un color a `rgb()` para poder darle alfa variable sin concatenar
     cadenas hexadecimales a mano en cada cuadro. */
  const componentes = (hex) => {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  };

  let A = 0, H = 0, DPR = 1;

  const medir = () => {
    DPR = Math.min(devicePixelRatio || 1, 2);   /* más de 2 no se nota y cuesta */
    A = innerWidth;
    H = innerHeight;
    /* `width` y `height` son ATRIBUTOS del lienzo: geometría, no estilo.
       Ninguna política de seguridad los mira, igual que los de un SVG. */
    lienzo.width  = Math.round(A * DPR);
    lienzo.height = Math.round(H * DPR);
    pincel.setTransform(DPR, 0, 0, DPR, 0, 0);
    ({ MES, CICLO } = anchos());
  };

  /* ---------- el puntero, con inercia ----------
     Atado directo a la posición del ratón se siente artificial, porque
     no tiene masa: llega antes que la mano. Persiguiendo el objetivo
     con un resorte flojo se siente material. */
  const raton = { x: 0.5, y: 0.5, vx: 0.5, vy: 0.5, cerca: 0 };
  addEventListener('pointermove', (e) => {
    raton.x = e.clientX / A;
    raton.y = e.clientY / H;
    raton.cerca = 1;
  }, { passive: true });
  addEventListener('pointerleave', () => { raton.cerca = 0; }, { passive: true });

  /* ---------- el recorrido ---------- */
  let avance = 0;         /* 0 arriba de todo, 1 abajo de todo */
  const medirAvance = () => {
    const total = document.documentElement.scrollHeight - H;
    avance = total > 0 ? Math.min(1, Math.max(0, scrollY / total)) : 0;
  };
  addEventListener('scroll', medirAvance, { passive: true });

  /* ---------- las dos vías ----------

     El mes va del día 1 al 31. El ciclo va del 7 de julio al 6 de
     agosto: ARRANCA ANTES Y TERMINA ANTES. Esas cuatro fracciones son
     el desfase, y son las mismas proporciones que el instrumento
     dibuja en CSS más abajo en la página.

     DÓNDE VAN. En pantalla ancha el texto se queda con la mitad izquierda y
     las vías corren por la derecha, a media altura: reparto, no
     superposición — cruzando por encima del titular se leen como una raya
     sobre el texto, no como un aparato al lado. En pantalla angosta el texto
     ocupa todo el ancho, así que las vías bajan a la banda de abajo, debajo
     de todo. */
  const anchos = () => (A >= 1000
    ? { MES:   { desde: 0.58, hasta: 0.98, y: 0.435 },
        CICLO: { desde: 0.50, hasta: 0.88, y: 0.565 } }
    : { MES:   { desde: 0.30, hasta: 0.96, y: 0.775 },
        CICLO: { desde: 0.14, hasta: 0.80, y: 0.830 } });
  let { MES, CICLO } = anchos();

  /* Los pulsos que corren por las vías. El del ciclo va un poco más
     rápido: el consumo corre, y el abono lo persigue. */
  const pulsos = [];
  for (let i = 0; i < 26; i++) {
    pulsos.push({
      via: i % 2,
      t: Math.random(),
      v: 0.00035 + Math.random() * 0.0007,
      largo: 0.04 + Math.random() * 0.11,
      brillo: 0.25 + Math.random() * 0.75,
    });
  }

  /* Dibuja una vía como un hilo de luz: varias pasadas, de la más
     ancha y tenue a la más fina y encendida. Sale más barato y más
     limpio que `shadowBlur`, que en Safari se paga carísimo. */
  const hilo = (x1, x2, y, rgb, fuerza, combado) => {
    const paso = 26;
    /* Cinco pasadas, de la más ancha y tenue a la más fina y encendida. Con
       tres se leía como una raya; el halo ancho es lo que la convierte en luz
       y no en borde. */
    const capas = [
      [40, 0.035], [24, 0.06], [12, 0.10], [5, 0.20], [2, 0.45], [1, 1],
    ];
    for (const [ancho, alfa] of capas) {
      pincel.beginPath();
      pincel.lineWidth = ancho;
      pincel.lineCap = 'round';
      pincel.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alfa * fuerza})`;
      for (let i = 0; i <= paso; i++) {
        const p = i / paso;
        const x = x1 + (x2 - x1) * p;
        /* El combado: la vía se hunde hacia el puntero. Una campana
           centrada en el ratón, no un desplazamiento parejo — así se
           lee como que el cursor PESA sobre el hilo. */
        const d = (x / A) - raton.x;
        const campana = Math.exp(-(d * d) / 0.012);
        const yy = y + combado * campana * raton.cerca;
        if (i === 0) pincel.moveTo(x, yy); else pincel.lineTo(x, yy);
      }
      pincel.stroke();
    }
  };

  const pintarPulso = (pulso, rgb, y, x1, x2, combado) => {
    const a = x1 + (x2 - x1) * pulso.t;
    const b = x1 + (x2 - x1) * Math.max(0, pulso.t - pulso.largo);
    const grad = pincel.createLinearGradient(b, 0, a, 0);
    grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.55 * pulso.brillo})`);
    pincel.beginPath();
    pincel.lineWidth = 2;
    pincel.lineCap = 'round';
    pincel.strokeStyle = grad;
    const paso = 10;
    for (let i = 0; i <= paso; i++) {
      const p = i / paso;
      const x = b + (a - b) * p;
      const d = (x / A) - raton.x;
      const yy = y + combado * Math.exp(-(d * d) / 0.012) * raton.cerca;
      if (i === 0) pincel.moveTo(x, yy); else pincel.lineTo(x, yy);
    }
    pincel.stroke();
  };

  const verde  = componentes(VERDE);
  const salmon = componentes(SALMON);
  const luz    = componentes(LUZ);

  let reloj = 0;

  const cuadro = (ahora) => {
    const dt = Math.min(48, ahora - reloj || 16);
    reloj = ahora;

    pincel.clearRect(0, 0, A, H);

    /* LA CONVERGENCIA. Es lo único que el mp4 no podía hacer, y es la
       promesa entera del producto: cuando el mes y el ciclo coinciden,
       se acaban las sorpresas. Las vías se juntan a lo largo del
       recorrido y el hueco salmón se cierra. */
    const juntar = Math.pow(avance, 1.6);

    const yMes   = H * (MES.y   + (0.5 - MES.y)   * juntar);
    const yCiclo = H * (CICLO.y + (0.5 - CICLO.y) * juntar);

    const cicloDesde = (CICLO.desde + (MES.desde - CICLO.desde) * juntar) * A;
    const cicloHasta = (CICLO.hasta + (MES.hasta - CICLO.hasta) * juntar) * A;
    const mesDesde = MES.desde * A;
    const mesHasta = MES.hasta * A;

    const combado = (raton.y - 0.5) * 26;

    /* El mes va neutro: el calendario no es el culpable de nada. */
    hilo(mesDesde, mesHasta, yMes, luz, 0.34, combado);
    hilo(cicloDesde, cicloHasta, yCiclo, verde, 1, combado);

    for (const pulso of pulsos) {
      pulso.t += pulso.v * dt * (pulso.via ? 1.35 : 1);
      if (pulso.t > 1 + pulso.largo) pulso.t = -pulso.largo;
      if (pulso.via) pintarPulso(pulso, verde, yCiclo, cicloDesde, cicloHasta, combado);
      else           pintarPulso(pulso, luz,   yMes,   mesDesde,   mesHasta,   combado);
    }

    /* LA COSTURA. Donde el ciclo se acaba y el mes sigue corriendo:
       el tramo que ya se gastó y que el saldo todavía no sabe. Se
       apaga a medida que las vías convergen — es el único momento del
       sitio donde el salmón se rinde. */
    const hueco = 1 - juntar;
    if (hueco > 0.01) {
      const x = cicloHasta;
      const arriba = Math.min(yMes, yCiclo) - 26;
      const abajo  = Math.max(yMes, yCiclo) + 26;
      const grad = pincel.createLinearGradient(0, arriba, 0, abajo);
      grad.addColorStop(0,   `rgba(${salmon[0]},${salmon[1]},${salmon[2]},0)`);
      grad.addColorStop(0.5, `rgba(${salmon[0]},${salmon[1]},${salmon[2]},${0.75 * hueco})`);
      grad.addColorStop(1,   `rgba(${salmon[0]},${salmon[1]},${salmon[2]},0)`);
      pincel.beginPath();
      pincel.lineWidth = 1.25;
      pincel.strokeStyle = grad;
      pincel.moveTo(x, arriba);
      pincel.lineTo(x, abajo);
      pincel.stroke();

      /* El nudo: un punto encendido donde corta. */
      pincel.beginPath();
      pincel.fillStyle = `rgba(${salmon[0]},${salmon[1]},${salmon[2]},${0.9 * hueco})`;
      pincel.arc(x, yCiclo, 2.5, 0, Math.PI * 2);
      pincel.fill();
    }

    if (!quietud.matches) requestAnimationFrame(cuadro);
  };

  const arrancar = () => {
    medir();
    medirAvance();
    if (quietud.matches) { cuadro(performance.now()); return; }
    requestAnimationFrame(cuadro);
  };

  let temporizador;
  addEventListener('resize', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { medir(); if (quietud.matches) cuadro(performance.now()); }, 120);
  }, { passive: true });

  quietud.addEventListener('change', arrancar);
  document.addEventListener('DOMContentLoaded', () => { leerPaleta(); arrancar(); });
  if (document.readyState !== 'loading') { leerPaleta(); arrancar(); }
})();
