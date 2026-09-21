/* ============================================================
   De la marca a los archivos que el navegador y WhatsApp piden.

   Genera, desde `sitio/favicon.svg` y los tokens de `marca.css`:
     · los iconos PNG que Safari y Android piden (SVG no les basta),
     · la imagen de enlace (1200×630) que se ve al compartir el sitio.

   No se publica ni es dependencia: como `filmar.js`, es un torno.

       npm i --no-save playwright && npx playwright install chromium
       node herramientas/marca-imagenes.mjs

   POR QUÉ SE DIBUJA Y NO SE PIDE A UN MODELO: la imagen de enlace lleva
   la frase con la que abre la portada y la marca real. Un dibujo generado
   se parecería a otra cosa cada vez que se regenere, y esta página se
   sostiene en que nada de lo que enseña es inventado.
   ============================================================ */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const SITIO = RAIZ + 'sitio/';
const marca = readFileSync(SITIO + 'favicon.svg', 'utf8').replace(/<\?xml[^>]*\?>/, '');
const fuente = readFileSync(SITIO + 'fuentes/Geist-Variable.woff2').toString('base64');

const nav = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await nav.newContext({ deviceScaleFactor: 1 });

/* Los iconos: el mismo SVG, en los tamaños que piden los sistemas. El de
   Apple va sin esquinas redondeadas propias —iOS las pone él— y con el
   fondo lleno, porque un PNG transparente sale negro sobre el escritorio. */
const iconos = [[180, 'apple-touch-icon.png', true], [192, 'icono-192.png', false], [512, 'icono-512.png', false]];
for (const [lado, archivo, apple] of iconos) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: lado, height: lado });
  await p.setContent(`<style>html,body{margin:0;background:${apple ? '#FBF9F9' : 'transparent'}}
    svg{width:${lado}px;height:${lado}px;display:block}${apple ? 'rect.lienzo{rx:0;ry:0}' : ''}</style>${marca}`);
  await p.screenshot({ path: SITIO + archivo, omitBackground: !apple });
  await p.close();
  console.log('icono', archivo);
}

/* La imagen de enlace. Tipografía, colores y frase del sitio: lo que ve
   quien recibe el enlace por WhatsApp tiene que ser el mismo producto. */
const p = await ctx.newPage();
await p.setViewportSize({ width: 1200, height: 630 });
await p.setContent(`<style>
  @font-face { font-family: Geist; src: url(data:font/woff2;base64,${fuente}) format('woff2');
               font-weight: 100 900; font-display: block; }
  html, body { margin: 0; }
  body { width: 1200px; height: 630px; background: #FBF9F9; color: #131315;
         font-family: Geist, system-ui, sans-serif; display: grid;
         grid-template-rows: auto 1fr auto; padding: 64px 72px; box-sizing: border-box; }
  .marca { display: flex; align-items: center; gap: 14px; font-size: 26px; font-weight: 600; letter-spacing: -0.01em; }
  .marca svg { width: 40px; height: 40px; }
  h1 { font-size: 78px; line-height: 1.02; letter-spacing: -0.035em; font-weight: 500; margin: 0; align-self: center; }
  h1 em { font-style: normal; color: #5B6260; }
  .pie { display: flex; justify-content: space-between; align-items: end; font-size: 24px; color: #5B6260; }
  .pie b { color: #064E3B; font-weight: 600; }
</style>
<div class="marca">${marca}<span>Controle Wallet</span></div>
<h1>El dinero ya se gastó.<br><em>El saldo todavía no lo sabe.</em></h1>
<div class="pie"><span>Presupuesto del hogar sobre el ciclo real de tu tarjeta</span><b>controlewallet.com</b></div>`);
await p.waitForTimeout(300);
await p.screenshot({ path: SITIO + 'media/enlace.png' });
console.log('imagen de enlace: sitio/media/enlace.png');
await nav.close();
