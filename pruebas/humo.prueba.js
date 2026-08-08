/* ============================================================
   Prueba de humo.

   No prueba el producto: prueba la tubería. Existe para que la
   etapa 0 termine con CI verde de verdad y no con un flujo de
   trabajo que nadie ha visto correr.

   Cuando la etapa 1 traiga el núcleo con sus 201 pruebas, este
   archivo se puede borrar sin ceremonia.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('el corredor de pruebas de Node encuentra y corre este archivo', () => {
  assert.equal(1 + 1, 2);
});

test('el proyecto corre en módulos ES, no en CommonJS', () => {
  // Si package.json no dijera "type": "module", este archivo ni siquiera
  // habría cargado: el `import` de arriba habría reventado. Llegar hasta
  // aquí ya es la prueba; la aserción solo la deja explícita.
  assert.equal(typeof import.meta.url, 'string');
});
