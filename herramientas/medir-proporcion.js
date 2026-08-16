/**
 * medir-proporcion.js — ¿qué porcentaje de la pantalla ocupa cada color de marca?
 *
 * Por qué existe: la regla 60-30-10 es una proporción de SUPERFICIE, no una
 * paleta. Nadie puede juzgarla a ojo — un fondo se ve dominante mucho antes de
 * llegar al 60%, y un acento se siente excesivo bastante antes del 10%. Se mide.
 *
 * Cómo se usa:
 *   1. npx wrangler dev
 *   2. Abrí la página que querés medir en el navegador
 *   3. Pegá TODO este archivo en la consola de las herramientas de desarrollo
 *
 * Sin dependencias, sin instalación, sin build. Corre igual contra localhost
 * que contra producción, y lee los tokens de marca.css que estén vivos en esa
 * página — no una copia que se pueda quedar atrás.
 *
 * Método: muestrea la página en una rejilla y pregunta qué elemento está
 * arriba en cada punto, subiendo por los padres hasta encontrar un fondo
 * opaco. Es lo que el ojo realmente ve, no lo que el CSS declara.
 */

(() => {
  /* Los del ADN original y los del mundo `noche` del sitio público. Van juntos
     a propósito: una misma página puede tener las dos familias vivas mientras
     el rediseño avanza por etapas, y el medidor tiene que poder leer las dos.
     Los tokens que no existan en la página se descartan solos. */
  const TOKENS = [
    'fondo', 'superficie', 'elevado', 'borde', 'borde-fuerte',
    'acento', 'acento-ct', 'suave', 'alerta', 'tinta', 'tenue',
    'vacio', 'vidrio', 'vidrio-alto', 'filete', 'filete-vivo',
    'luz', 'verde', 'verde-hondo', 'salmon',
  ];

  /* Los tokens del mundo `noche` los declara `.noche`, que es el <body>, no
     :root. Se leen desde el body para que los dos mundos resuelvan. */
  const raiz = getComputedStyle(document.body);

  function aRGBA(css) {
    const d = document.createElement('div');
    d.style.color = css;
    document.body.appendChild(d);
    const m = getComputedStyle(d).color.match(/[\d.]+/g);
    d.remove();
    return m ? [ +m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3] ] : null;
  }

  /* Componer una capa sobre lo que ya hay debajo. Es lo mismo que hace el
     navegador al pintar, y lo que hace el ojo al mirar. */
  const sobre = (capa, fondo) =>
    [0, 1, 2].map((i) => capa[3] * capa[i] + (1 - capa[3]) * fondo[i]);

  const lienzo = aRGBA(raiz.getPropertyValue('--vacio').trim() ||
                       raiz.getPropertyValue('--fondo').trim() || '#fff');

  /* Un token translúcido no se compara crudo: se compara ya compuesto sobre el
     lienzo, que es el color que de verdad sale en pantalla. */
  const paleta = TOKENS
    .map((t) => ({ token: t, valor: raiz.getPropertyValue(`--${t}`).trim() }))
    .filter((x) => x.valor)
    .map((x) => ({ token: x.token, rgb: sobre(aRGBA(x.valor) || [0,0,0,1], lienzo) }));

  if (!paleta.length) {
    console.error('No encontré tokens de marca. ¿Está cargado marca.css en esta página?');
    return;
  }

  /* ANTES ESTA FUNCIÓN MENTÍA, Y EN SILENCIO.
     Subía por los padres hasta encontrar un fondo con alfa > 0.5 y descartaba
     todo lo demás. Servía mientras las superficies eran opacas. Con el mundo
     de vidrio —donde TODA superficie es alfa 0.035 a 0.06— saltaba todas las
     cartas y aterrizaba siempre en el lienzo: la página entera medía 99.9% de
     fondo y 0% de superficie, o sea que el 60-30-10 dejó de comprobarse sin
     que nada avisara. Ahora se apilan las capas y se componen. */
  function fondoEfectivo(el) {
    const capas = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
      if (!m) continue;
      const alfa = m.length < 4 ? 1 : +m[3];
      if (alfa === 0) continue;
      capas.push([ +m[0], +m[1], +m[2], alfa ]);
      if (alfa > 0.99) break;                  // opaco: lo de atrás ya no se ve
    }
    let color = lienzo.slice(0, 3);
    for (const capa of capas.reverse()) color = sobre(capa, color);
    return color;
  }

  function masCercano(rgb) {
    let mejor = null, dmin = Infinity;
    for (const p of paleta) {
      const d = (rgb[0]-p.rgb[0])**2 + (rgb[1]-p.rgb[1])**2 + (rgb[2]-p.rgb[2])**2;
      if (d < dmin) { dmin = d; mejor = p.token; }
    }
    /* Un color que no se parece a ningún token es un color fuera del ADN. Se
       redondea porque desde que se componen las capas esto llega con
       decimales, y un rótulo con seis cifras no se puede ni buscar. */
    return dmin > 900 ? `FUERA-DEL-ADN(${rgb.map(Math.round).join(',')})` : mejor;
  }

  const PASO = 8;                                    // px entre muestras
  const ancho = window.innerWidth, alto = window.innerHeight;
  const cuenta = {};
  let total = 0;

  for (let y = PASO / 2; y < alto; y += PASO) {
    for (let x = PASO / 2; x < ancho; x += PASO) {
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      const t = masCercano(fondoEfectivo(el));
      cuenta[t] = (cuenta[t] || 0) + 1;
      total++;
    }
  }

  const pct = (n) => (100 * n / total);
  const filas = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);

  console.log(`%cProporción de superficie · ${location.pathname} · ${ancho}×${alto}`,
              'font-weight:bold;font-size:13px');
  console.table(filas.map(([token, n]) => ({
    token,
    '%': +pct(n).toFixed(1),
    barra: '█'.repeat(Math.round(pct(n) / 2)),
  })));

  /* Cada grupo junta los tokens de las dos familias que cumplen ese papel: el
     lienzo (`fondo` en el ADN, `vacio` en el mundo de vidrio), las superficies
     y los acentos. Así el número dice lo mismo mida lo que mida. */
  const g = (...ts) => ts.reduce((s, t) => s + (cuenta[t] || 0), 0);
  const dominante  = pct(g('fondo', 'vacio'));
  const secundario = pct(g('superficie', 'elevado', 'borde', 'borde-fuerte',
                           'vidrio', 'vidrio-alto', 'filete', 'filete-vivo'));
  const acento     = pct(g('acento', 'suave', 'alerta', 'acento-ct',
                           'verde', 'verde-hondo', 'salmon'));

  const juicio = (real, meta, tol) =>
    Math.abs(real - meta) <= tol ? 'en rango' : (real > meta ? 'de más' : 'de menos');

  console.log(
`
 60-30-10 ─────────────────────────────────────
   60 · dominante   ${dominante.toFixed(1).padStart(5)}%   ${juicio(dominante, 60, 10)}
   30 · secundario  ${secundario.toFixed(1).padStart(5)}%   ${juicio(secundario, 30, 10)}
   10 · acento      ${acento.toFixed(1).padStart(5)}%   ${juicio(acento, 10, 5)}

 Metas por superficie:
   sitio que vende ..... 60 / 30 / 10
   pantallas de la app .. 60 / 32 /  8   (el acento es semántico: si pinta
                                          demasiado, deja de significar)
`);

  const fuera = filas.filter(([t]) => t.startsWith('FUERA-DEL-ADN'));
  if (fuera.length) {
    console.warn('Colores que no salen de ningún token:', fuera.map(([t]) => t));
  } else {
    console.log('%cTodo el color de esta pantalla sale de marca.css ✓', 'color:#0a7');
  }
})();
