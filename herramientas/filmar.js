/* ============================================================
   FILMAR — convierte el plató en las películas de la vitrina.

   No se publica y no es dependencia del producto: Playwright y
   ffmpeg son herramientas de escritorio, como `wrangler`. Nada del
   servicio depende de que esto exista, y la regla 9 —sin
   dependencias porque sí— se respeta: `package.json` no cambia.

       npm i --no-save playwright && npx playwright install chromium
       npx wrangler dev &
       node herramientas/filmar.js

   `--no-save` a propósito: Playwright NO entra a `package.json`. La regla 9
   dice que las únicas dependencias son `wrangler` y `supabase`, y esto no es
   una dependencia del servicio — es un torno que se prende cuando hay que
   volver a filmar y se apaga después. Si mañana no está instalado, el sitio
   sigue igual: las películas ya están en `sitio/media/`.

   Requiere `npx wrangler dev` corriendo en 8787. Se apoya en él a
   propósito: así la película se compone con las MISMAS hojas y la
   MISMA Geist autoalojada que el sitio, y no con una copia que se
   desincroniza al primer cambio de `marca.css`.

   TRES DECISIONES QUE NO SON DE GUSTO

   1. DETERMINISTA. No hay `@keyframes` ni reloj: el cuadro n sale de
      llamar `pintar(n / total)`. La misma entrada da siempre la misma
      salida, así que dentro de un año se regenera idéntica — o se
      regenera distinta a propósito, que es lo que se quiere cuando
      cambie la interfaz.

   2. SE FILMA LO QUE SE MUESTRA. El marcado del plató es el de
      `dispositivos.css` y las cifras son las del ejemplo que ya está
      en index.html. Ni una cifra nueva.

   3. EL PÓSTER ES EL ÚLTIMO CUADRO, no el primero. Quien no reciba
      la película —sin JavaScript, con datos medidos, o con el video
      bloqueado— tiene que ver la pantalla TERMINADA, no una vacía.
      Y como la película cierra en ese mismo cuadro, al acabar calza
      con el póster y no hay salto.
   ============================================================ */

import { chromium } from 'playwright';
import { readFileSync, mkdtempSync, rmSync, statSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI    = dirname(fileURLToPath(import.meta.url));
const RAIZ    = join(AQUI, '..');
const DESTINO = join(RAIZ, 'sitio', 'media');
const SERVIDOR = process.env.PLATO_URL || 'http://localhost:8787/';

const POR_SEG = 30;
const CUADROS = 108;   /* 3.6 s a 30/s — el de las tres películas de la vitrina */

/* Cuánto mide cada película y con qué tamaño de letra se compone.
   El ancho es el que va a tener en pantalla: se graba 1:1 y se
   duplica con `deviceScaleFactor`, que es lo que la deja nítida en
   una pantalla de retina sin inventar píxeles.

   LA LETRA SE ELIGIÓ POR LEGIBILIDAD, NO POR FIDELIDAD FÍSICA. A
   escala real una tableta de 820 px reducida a 420 pediría 8 px de
   base, y su texto saldría MÁS CHICO que el del teléfono. Absurdo:
   el punto de esta sección es que el producto se pueda leer. El
   tamaño se fija para que el texto más chico de cada película —el
   rótulo de un movimiento, 0.85em— no baje de 10 px. */
const PLATOS = {
  telefono:   { letra: 12, modo: 'light' },
  tableta:    { letra: 12, modo: 'light' },
  escritorio: { letra: 13, modo: 'light' },

  /* EL HERO VOLVIÓ AL PAPEL, Y DURA TRES VECES MÁS.

     Se filmaba en OSCURO, y no era un capricho: era la mitad real de un
     híbrido cuya primera mitad —seis segundos generados— era luz sobre
     fondo carbón, y un corte de oscuro a claro en mitad de un mismo plano
     se lee como un error de montaje.

     Esa primera mitad ya no existe. Sin ella, el oscuro dejó de tener
     razón: era el color de lo que se fue. En claro, la película es del
     mismo mundo que la página que la enmarca.

     LA LETRA EN 19 ESTÁ MEDIDA, NO ELEGIDA. A 18 el tablero ocupaba el
     68 % del alto del cuadro y el tercio de abajo quedaba en blanco — en el
     acto principal de una página que vende, eso es un tercio del cuadro sin
     trabajar. A 21 sube al 95 % y el tablero toca el borde, que se lee como
     recortado. A 19 ocupa el 86 %, con un margen abajo que se lee como lo
     que es: una pantalla que sigue.

     Y 330 cuadros —once segundos— porque 3.6 s no daban tiempo de LEER.
     Una película de producto que no se puede leer no está mostrando el
     producto: está mostrando que existe. El resto lo pone el reposo
     final, que es cuando el ojo por fin recorre la pantalla entera. */
  hero:       { letra: 19, modo: 'light', cuadros: 330, inicio: true },
};

/* ---------- la curva ----------
   La misma `--curva` del sitio: cubic-bezier(0.16, 1, 0.3, 1). Un
   ease-out fuerte, que es lo correcto para algo que ENTRA. Se
   resuelve por Newton porque CSS no está disponible acá. */
const bezier = (x1, y1, x2, y2) => {
  const A = (a, b) => 1 - 3 * b + 3 * a, B = (a, b) => 3 * b - 6 * a, C = (a) => 3 * a;
  const calc = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const pend = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = pend(t, x1, x2);
      if (Math.abs(d) < 1e-6) break;
      t -= (calc(t, x1, x2) - x) / d;
    }
    return calc(t, y1, y2);
  };
};

/* ---------- el pintor ----------
   Corre DENTRO del navegador. Recibe t de 0 a 1 y deja el documento
   exactamente como tiene que verse en ese instante. */
const PINTOR = `(t, curva) => {
  const B = (x1,y1,x2,y2)=>{const A=(a,b)=>1-3*b+3*a,Bb=(a,b)=>3*b-6*a,C=a=>3*a;
    const c=(u,a,b)=>((A(a,b)*u+Bb(a,b))*u+C(a))*u, p=(u,a,b)=>3*A(a,b)*u*u+2*Bb(a,b)*u+C(a);
    return x=>{if(x<=0)return 0;if(x>=1)return 1;let u=x;
      for(let i=0;i<8;i++){const d=p(u,x1,x2);if(Math.abs(d)<1e-6)break;u-=(c(u,x1,x2)-x)/d;}
      return c(u,y1,y2);};};
  const e = B(...curva);

  /* Cuánto ha corrido esta pieza dentro de su propia ventana. */
  const fase = (el) => {
    const de = parseFloat(el.dataset.de || 0), a = parseFloat(el.dataset.a || 1);
    if (a <= de) return 1;
    return e(Math.min(1, Math.max(0, (t - de) / (a - de))));
  };

  const plata = (n) => 'L ' + Math.round(n).toLocaleString('en-US');

  /* Las cifras cuentan hacia arriba. No es adorno: es lo que hace que
     el ojo lea «esto se está calculando» en vez de «esto es una foto». */
  for (const el of document.querySelectorAll('[data-cuenta]')) {
    const v = fase(el) * parseFloat(el.dataset.hasta);
    el.textContent = el.hasAttribute('data-crudo')
      ? Math.round(v) + (el.dataset.sufijo || '')
      : plata(v);
  }

  /* Las barras del pulso crecen a lo ancho; las de la gráfica, a lo alto. */
  for (const el of document.querySelectorAll('[data-crece]'))
    el.style.width = (fase(el) * parseFloat(el.dataset.hasta)) + '%';
  for (const el of document.querySelectorAll('[data-alza]'))
    el.style.height = (fase(el) * parseFloat(el.dataset.hasta)) + '%';

  /* Y lo que llega, llega desde abajo y desde el desenfoque. Nada
     aparece de la nada: 0.985 y no 0 — un objeto que nace en escala
     cero no se parece a nada del mundo real. */
  for (const el of document.querySelectorAll('[data-llega]')) {
    const f = fase(el);
    el.style.opacity = f;
    el.style.transform = 'translateY(' + ((1 - f) * 10).toFixed(2) + 'px) scale(' + (0.985 + f * 0.015).toFixed(4) + ')';
    el.style.filter = f > 0.995 ? 'none' : 'blur(' + ((1 - f) * 6).toFixed(2) + 'px)';
  }
}`;

/* ---------- el decorado ---------- */
const HOJA = `
  html, body { margin: 0; padding: 0; background: transparent; }
  body { display: block; }
  .plato { position: fixed; left: 0; top: 0; overflow: hidden;
           background: var(--superficie); }
  /* Los tres se apagan y el que se filma se enciende desde filmar.js. */
  .plato { display: none; }
  .plato[data-rodando] { display: block; }
  .plato > .ui { height: 100%; align-content: start; box-sizing: border-box; }
  /* will-change en las piezas que se mueven: sin esto cada cuadro
     repinta la pantalla entera y la captura tarda el triple. */
  [data-llega] { will-change: opacity, transform, filter; }
`;

const nav = await chromium.launch();
/* `bypassCSP` porque el plató se inyecta como marcado y estilo en la
   página del servidor de pruebas, y su CSP —correctamente— prohíbe
   ambos. Es una concesión de la MÁQUINA de filmar, nunca del sitio:
   `sitio/_headers` no se toca. */
const ctx = await nav.newContext({
  viewport: { width: 1000, height: 700 },
  deviceScaleFactor: 2,
  /* El modo se fija POR PLATÓ más abajo con `emulateMedia`, no acá: en una
     misma corrida hay tomas claras y una oscura. */
  bypassCSP: true,
});
const pag = await ctx.newPage();
await pag.goto(SERVIDOR, { waitUntil: 'load' });

/* `plato.css` es la hoja que dibuja las pantallas. Vivía en `sitio/` y la
   enlazaba index.html; desde que la vitrina muestra películas, la página ya
   no la usa y su único consumidor es este plató. Se inyecta desde el disco:
   así no hay que servir una hoja que ninguna página pide. */
const plato = readFileSync(join(AQUI, 'plato.html'), 'utf8');
const vestuario = readFileSync(join(AQUI, 'plato.css'), 'utf8');
await pag.evaluate(([marcado, ...hojas]) => {
  document.body.className = '';
  document.body.innerHTML = marcado;
  for (const h of hojas) {
    const s = document.createElement('style');
    s.textContent = h;
    document.head.appendChild(s);
  }
}, [plato, vestuario, HOJA]);
await pag.evaluate(() => document.fonts.ready);

mkdirSync(DESTINO, { recursive: true });
const curva = [0.16, 1, 0.3, 1];
const informe = [];

for (const [nombre, cfg] of Object.entries(PLATOS)) {
  const medida = await pag.evaluate(([n, letra]) => {
    for (const p of document.querySelectorAll('.plato')) p.removeAttribute('data-rodando');
    const el = document.querySelector(`[data-plato="${n}"]`);
    el.setAttribute('data-rodando', '');
    el.style.width = el.dataset.ancho + 'px';
    el.style.height = el.dataset.alto + 'px';
    el.style.fontSize = letra + 'px';
    return { width: +el.dataset.ancho, height: +el.dataset.alto };
  }, [nombre, cfg.letra]);

  /* El modo de color, por toma. `emulateMedia` reevalúa las media queries
     del documento ya cargado, así que `marca.css` cambia sus once tokens sin
     recargar nada. */
  await pag.emulateMedia({ colorScheme: cfg.modo });
  await pag.setViewportSize(medida);

  const cuadros = cfg.cuadros || CUADROS;

  /* EL REPOSO FINAL. El último 18 % de la película no anima nada: deja la
     pantalla armada y quieta. Sin él la película termina en el instante en
     que la última fila aterriza, y el ojo —que venía siguiendo el
     movimiento— nunca llega a recorrer el tablero completo. Ese reposo es
     lo que convierte «vi que se armaba algo» en «leí lo que dice». */
  const REPOSO = cfg.cuadros ? 0.18 : 0;
  const utiles = Math.round(cuadros * (1 - REPOSO));

  const cocina = mkdtempSync(join(tmpdir(), 'controle-film-'));
  for (let i = 0; i < cuadros; i++) {
    await pag.evaluate(([cuerpo, t, c]) => new Function('return ' + cuerpo)()(t, c),
                       [PINTOR, Math.min(1, i / (utiles - 1)), curva]);
    await pag.screenshot({ path: join(cocina, `${String(i).padStart(4, '0')}.png`) });
  }

  const mp4 = join(DESTINO, `app-${nombre}.mp4`);
  const jpg = join(DESTINO, `app-${nombre}-poster.jpg`);

  /* `-crf 26` y no menos: la interfaz es plana y de bordes duros, y a
     partir de ahí bajar el crf engorda el archivo sin que se vea
     nada. `+faststart` pone el índice al principio, o el navegador
     tiene que bajar el archivo entero antes del primer cuadro. */
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-framerate', String(POR_SEG), '-i', join(cocina, '%04d.png'),
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-crf', '26', '-preset', 'veryslow', '-movflags', '+faststart', '-an', mp4]);

  /* Y para el hero, TAMBIÉN el primero. Son dos pósters con dos oficios
     distintos: el del final es la pantalla terminada, y va donde la película
     no se reproduce —sin JavaScript, con el movimiento apagado—. El del
     principio es el armazón vacío, y va de fondo MIENTRAS la película carga:
     ahí mostrar el final sería enseñar el desenlace para después rebobinar. */
  if (cfg.inicio) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
      '-i', join(cocina, '0000.png'), '-q:v', '4',
      join(DESTINO, `app-${nombre}-inicio.jpg`)]);
  }

  /* El póster es el ÚLTIMO cuadro: la pantalla terminada. */
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-i', join(cocina, `${String(cuadros - 1).padStart(4, '0')}.png`),
    '-q:v', '4', jpg]);

  rmSync(cocina, { recursive: true, force: true });
  informe.push({
    pelicula: `app-${nombre}`,
    medida: `${medida.width}×${medida.height} @2x`,
    dura: (cuadros / POR_SEG).toFixed(1) + ' s',
    mp4: (statSync(mp4).size / 1024).toFixed(1) + ' KB',
    poster: (statSync(jpg).size / 1024).toFixed(1) + ' KB',
  });
}

await nav.close();
console.table(informe);
