/* ============================================================
   Cada pantalla recibe las funciones que llama.

   Esta prueba existe por un fallo concreto y evitable: la pantalla de
   importar llamaba a `A.leerArchivo`, y `nucleo/index.js` —la puerta
   del núcleo— no reexportaba nada de `importar.js`. El módulo cargaba
   sin quejarse, porque importar un espacio de nombres SIEMPRE funciona
   aunque esté vacío. El error apareció recién al elegir un archivo, en
   producción: «A.leerArchivo is not a function».

   Lo que lo dejó pasar fue una comprobación que no podía fallar: se
   verificó que la vista se pudiera importar, no que lo que llama
   exista. Una comprobación que no puede fallar no está comprobando
   nada.

   Así que aquí se lee el CÓDIGO de cada vista, se saca cada `A.algo`
   que use, y se exige que el núcleo lo exporte de verdad.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as A from '../sitio/app/nucleo/index.js';

const CARPETA = new URL('../sitio/app/vistas/', import.meta.url);
const vistas = readdirSync(CARPETA).filter(n => n.endsWith('.js'));

test('el lector encuentra las vistas y lo que llaman', () => {
  // Sin esto, las de abajo pasarían en verde sin comprobar nada.
  assert.ok(vistas.length >= 6, `solo se encontraron ${vistas.length} vistas`);
  const importar = readFileSync(new URL('importar.js', CARPETA), 'utf8');
  assert.match(importar, /A\.leerArchivo/, 'la vista de importar debería llamar a leerArchivo');
});

for (const archivo of vistas) {
  test(`la vista ${archivo} solo llama a lo que el núcleo exporta`, () => {
    const fuente = readFileSync(new URL(archivo, CARPETA), 'utf8');

    // Solo cuenta si el archivo de verdad importa el núcleo como `A`.
    if (!/import \* as A from ['"]\.\.\/nucleo\/index\.js['"]/.test(fuente)) return;

    const usadas = new Set([...fuente.matchAll(/\bA\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
    const faltan = [...usadas].filter(k => A[k] === undefined);

    assert.deepEqual(faltan, [],
      `${archivo} llama a ${faltan.join(', ')}, que el núcleo no exporta: ` +
      `reventaría al usarlo, no al cargar la pantalla`);
  });
}
