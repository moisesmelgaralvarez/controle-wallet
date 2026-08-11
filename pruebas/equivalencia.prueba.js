/* ============================================================
   La mudanza no perdió nada.

   Las 175 pruebas portadas comprueban que el núcleo CALCULA igual.
   Esto comprueba algo distinto y que ninguna de ellas vería: que la
   superficie pública sea idéntica.

   Una función que se quedó sin exportar al partir el archivo no
   rompe ninguna prueba existente —simplemente nadie la llama— y el
   fallo aparece meses después, en la pantalla de un usuario. Aquí se
   compara la lista completa de `window.Asesor` contra la de
   `nucleo/index.js`, nombre por nombre.

   Cuando `heredado/` se borre al terminar la fase 1, este archivo se
   borra con él: habrá cumplido su única razón de existir.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as nuevo from '../sitio/app/nucleo/index.js';

/* El núcleo viejo es un IIFE que cuelga su API de `window`. Se le da
   un `window` de mentira y se ejecuta: no toca red, DOM ni reloj más
   allá de `Date`, así que corre igual en Node. */
function nucleoViejo() {
  const src = readFileSync(new URL('../heredado/asesor.js', import.meta.url), 'utf8');
  const ventana = {};
  new Function('window', src)(ventana);
  return ventana.Asesor;
}

/* El importador viejo vive en OTRO archivo y cuelga de
   `window.Importar`. Cuando se portó, sus funciones entraron al mismo
   `nucleo/index.js` que el resto — así que para esta comparación las
   dos superficies viejas se juntan en una. Sin esto, cada función del
   importador aparecería como «inventada». */
function importadorViejo() {
  const src = readFileSync(new URL('../heredado/importar.js', import.meta.url), 'utf8');
  const ventana = {};
  new Function('window', src)(ventana);
  return ventana.Importar || {};
}

const viejo = { ...nucleoViejo(), ...importadorViejo() };

test('la API nueva expone todo lo que exponía la vieja', () => {
  const faltan = Object.keys(viejo).filter(k => !(k in nuevo));
  assert.deepEqual(faltan, [], `quedaron sin exportar: ${faltan.join(', ')}`);
});

test('la API nueva no inventa nada que la vieja no tuviera', () => {
  // `default` lo agrega el sistema de módulos, no nosotros.
  const sobran = Object.keys(nuevo).filter(k => k !== 'default' && !(k in viejo));
  assert.deepEqual(sobran, [], `aparecieron de la nada: ${sobran.join(', ')}`);
});

test('cada nombre sigue siendo de la misma naturaleza', () => {
  const distintos = Object.keys(viejo)
    .filter(k => typeof viejo[k] !== typeof nuevo[k])
    .map(k => `${k}: era ${typeof viejo[k]}, ahora ${typeof nuevo[k]}`);
  assert.deepEqual(distintos, [], distintos.join(' · '));
});

test('las constantes valen exactamente lo mismo', () => {
  const constantes = Object.keys(viejo).filter(k => typeof viejo[k] !== 'function');
  assert.ok(constantes.length > 0, 'no se encontró ninguna constante que comparar');
  for (const k of constantes) {
    assert.deepEqual(nuevo[k], viejo[k], `la constante ${k} cambió de valor`);
  }
});

test('el núcleo no arrastró dependencias del navegador', () => {
  // Si algún módulo tocara `window`, `document` o `localStorage`, no
  // podría correr en el servidor — y la regla 2 dice que tiene que
  // correr igual en los tres sitios. Se revisa el texto de los
  // módulos, que es la única forma de verlo sin ejecutarlos todos.
  const dir = new URL('../sitio/app/nucleo/', import.meta.url);
  const archivos = ['base.js', 'fechas.js', 'ingresos.js', 'financiamientos.js',
                    'saldos.js', 'sugerido.js', 'proyeccion.js', 'pulso.js',
                    'patrimonio.js', 'prioridad.js', 'carta.js', 'importar.js', 'index.js'];
  const culpables = [];
  for (const a of archivos) {
    const txt = readFileSync(new URL(a, dir), 'utf8');
    // Se ignoran los comentarios: varios explican por qué NO se usa window.
    const codigo = txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const prohibido of ['window.', 'document.', 'localStorage', 'fetch(']) {
      if (codigo.includes(prohibido)) culpables.push(`${a} usa ${prohibido}`);
    }
  }
  assert.deepEqual(culpables, [], culpables.join(' · '));
});
