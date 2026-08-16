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
  const TOKENS = [
    'fondo', 'superficie', 'elevado', 'borde', 'borde-fuerte',
    'acento', 'acento-ct', 'suave', 'alerta', 'tinta', 'tenue',
  ];

  const raiz = getComputedStyle(document.documentElement);
  const paleta = TOKENS
    .map((t) => ({ token: t, valor: raiz.getPropertyValue(`--${t}`).trim() }))
    .filter((x) => x.valor)
    .map((x) => ({ ...x, rgb: aRGB(x.valor) }))
    .filter((x) => x.rgb);

  if (!paleta.length) {
    console.error('No encontré tokens de marca. ¿Está cargado marca.css en esta página?');
    return;
  }

  function aRGB(css) {
    const d = document.createElement('div');
    d.style.color = css;
    document.body.appendChild(d);
    const m = getComputedStyle(d).color.match(/\d+/g);
    d.remove();
    return m ? [ +m[0], +m[1], +m[2] ] : null;
  }

  // Sube por los padres hasta dar con un fondo opaco: eso es lo que se ve.
  function fondoEfectivo(el) {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const m = bg.match(/[\d.]+/g);
      if (m && (m.length < 4 || +m[3] > 0.5)) return [ +m[0], +m[1], +m[2] ];
    }
    const m = getComputedStyle(document.documentElement).backgroundColor.match(/\d+/g);
    return m ? [ +m[0], +m[1], +m[2] ] : [ 255, 255, 255 ];
  }

  function masCercano(rgb) {
    let mejor = null, dmin = Infinity;
    for (const p of paleta) {
      const d = (rgb[0]-p.rgb[0])**2 + (rgb[1]-p.rgb[1])**2 + (rgb[2]-p.rgb[2])**2;
      if (d < dmin) { dmin = d; mejor = p.token; }
    }
    // Un color que no se parece a ningún token es un color fuera del ADN.
    return dmin > 900 ? `FUERA-DEL-ADN(${rgb.join(',')})` : mejor;
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

  const g = (...ts) => ts.reduce((s, t) => s + (cuenta[t] || 0), 0);
  const dominante  = pct(g('fondo'));
  const secundario = pct(g('superficie', 'elevado', 'borde', 'borde-fuerte'));
  const acento     = pct(g('acento', 'suave', 'alerta', 'acento-ct'));

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
