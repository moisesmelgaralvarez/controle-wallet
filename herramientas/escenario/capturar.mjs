/* ============================================================
   Captura las vistas del escenario en los cinco anchos y los dos temas,
   y mide lo que no se ve a ojo: desborde horizontal y errores.

       npm i --no-save playwright && npx playwright install chromium
       node herramientas/escenario/servidor.mjs &
       node herramientas/escenario/capturar.mjs            # todo
       VISTAS=resumen ANCHOS=390 TEMAS=dark node herramientas/escenario/capturar.mjs

   Las capturas van a SALIDA (por omisión, la carpeta temporal del
   sistema): son de un hogar inventado, pero no tienen por qué vivir en el
   repositorio.
   ============================================================ */
import { chromium } from 'playwright';
import { tmpdir } from 'node:os';
const SALIDA = process.env.SALIDA || tmpdir();
const vistas = (process.env.VISTAS || 'resumen,movimientos,importar').split(',');
const anchos = (process.env.ANCHOS || '390,768,1024,1440,1920').split(',').map(Number);
const temas = (process.env.TEMAS || 'light,dark').split(',');
const nav = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let malas = 0;
for (const vista of vistas) for (const tema of temas) for (const ancho of anchos) {
  const ctx = await nav.newContext({ viewport: { width: ancho, height: 900 }, colorScheme: tema });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
  await p.goto(`http://localhost:${process.env.PUERTO || 8790}/escenario/?vista=${vista}`);
  await p.waitForSelector('body[data-listo]');
  await p.waitForTimeout(400);
  const desborde = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const archivo = `${SALIDA}/escenario-${vista}-${tema}-${ancho}.png`;
  await p.screenshot({ path: archivo, fullPage: true });
  if (desborde > 0 || errores.length) malas++;
  console.log(`${vista} ${tema} ${ancho}: desborde ${desborde}px · errores ${errores.length}${errores.length ? ' → ' + errores.join(' | ') : ''}`);
  await ctx.close();
}
await nav.close();
console.log(malas ? `\n${malas} capturas con problemas` : '\nTodo limpio.', '· en', SALIDA);
process.exit(malas ? 1 : 0);
