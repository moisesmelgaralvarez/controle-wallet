/* ============================================================
   Lo que toda página publicada tiene que llevar.

   Tres cosas que faltaban y no daban ningún error: el sitio no tenía
   icono —la pestaña salía en blanco y `/favicon.ico` daba 404 en
   producción—, no tenía imagen de enlace —compartirlo por WhatsApp no
   mostraba nada— y publicaba `prueba-marca.html`, una página interna de
   diseño que cualquiera podía abrir.

   Nada de eso se ve mirando la página. Por eso se comprueba leyendo los
   archivos que de verdad se publican, que es `sitio/`.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const SITIO = new URL('../sitio/', import.meta.url);
const leer = r => readFileSync(new URL(r, SITIO), 'utf8');

/** Todas las .html publicadas, incluida la de la app. */
function paginas(dir = '', vistas = []) {
  for (const e of readdirSync(new URL(dir, SITIO), { withFileTypes: true })) {
    if (e.isDirectory()) paginas(`${dir}${e.name}/`, vistas);
    else if (e.name.endsWith('.html')) vistas.push(`${dir}${e.name}`);
  }
  return vistas;
}

const TODAS = paginas();
/* La app va `noindex` y detrás de sesión: no se comparte por enlace, así
   que no lleva metadatos sociales. El icono sí, que es la pestaña. */
const PUBLICAS = TODAS.filter(p => !p.startsWith('app/'));

test('se encontraron las páginas, o lo de abajo no comprueba nada', () => {
  assert.ok(TODAS.length >= 9, `solo se vieron ${TODAS.length}: ${TODAS}`);
  assert.ok(PUBLICAS.includes('index.html'));
});

for (const p of TODAS) {
  test(`${p} lleva icono y color de tema`, () => {
    const s = leer(p);
    assert.match(s, /<link rel="icon" href="\/favicon\.svg"/, 'sin icono, la pestaña sale en blanco');
    assert.match(s, /<link rel="apple-touch-icon"/, 'iOS no entiende el SVG: necesita el PNG');
    assert.match(s, /<meta name="theme-color"[^>]*prefers-color-scheme: dark/, 'falta el color de tema en oscuro');
    assert.match(s, /<html lang="es-HN"/);
  });
}

for (const p of PUBLICAS) {
  test(`${p} se puede compartir`, () => {
    const s = leer(p);
    assert.match(s, /<meta property="og:image" content="https:\/\/controlewallet\.com\/media\/enlace\.png">/,
      'sin imagen de enlace, compartirlo por WhatsApp no muestra nada');
    assert.match(s, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(s, /<meta property="og:title"/);
    assert.match(s, /<meta name="description" content="[^"]{30,}"/, 'la descripción es lo que se lee en el buscador');
    assert.match(s, /<title>[^<]+<\/title>/);
  });
}

test('los archivos que las páginas prometen existen de verdad', () => {
  for (const r of ['favicon.svg', 'apple-touch-icon.png', 'icono-192.png', 'icono-512.png',
                   'media/enlace.png', 'app/app.webmanifest']) {
    assert.ok(existsSync(new URL(r, SITIO)), `falta ${r}`);
  }
});

test('el manifiesto de la app es válido y sus iconos existen', () => {
  const m = JSON.parse(leer('app/app.webmanifest'));
  assert.equal(m.start_url, '/app/');
  assert.ok(m.icons.length >= 2);
  for (const i of m.icons) {
    assert.ok(existsSync(new URL('.' + i.src, SITIO)), `el manifiesto promete ${i.src} y no está`);
  }
});

for (const p of PUBLICAS) {
  test(`${p} fija el tema claro: el sitio es de papel`, () => {
    // La app tiene modo oscuro; el sitio no. Sin declararlo, lo que pinta
    // el navegador —barra de desplazamiento, autocompletado— salía oscuro
    // contra una página blanca.
    assert.match(leer(p), /<html lang="es-HN" data-tema="claro">/);
  });
}

test('no se publica ninguna página de prueba', () => {
  // `prueba-marca.html` estuvo en línea, abierta a cualquiera, sin estar
  // enlazada desde ningún lado. Vive en `herramientas/`, que no se publica.
  const coladas = TODAS.filter(p => /prueba|plato|escenario|borrador/i.test(p));
  assert.deepEqual(coladas, [], `se publicarían: ${coladas.join(', ')}`);
});

test('lo estático se comprime: `no-transform` no alcanza a las hojas ni a las fuentes', () => {
  /* `no-transform` apaga la inyección del beacon de Cloudflare, y de paso
     la compresión. Medido en producción: 152 KB de CSS sin comprimir. Las
     reglas por extensión devuelven la compresión a lo que no es página. */
  const h = leer('_headers');
  for (const patron of ['/fuentes/*', '/media/*', '/*.css', '/*.js']) {
    assert.ok(h.includes(`\n${patron}\n`), `falta la regla ${patron}`);
  }
  const tras = h.slice(h.indexOf('/fuentes/*'));
  assert.ok(!tras.includes('no-transform'),
    'las reglas de lo estático no pueden repetir no-transform: es lo que impide comprimir');
});
