/* ============================================================
   El arnés de pruebas de siempre, montado sobre `node:test`.

   `pruebas.html` traía su propio arnés minúsculo: `grupo(...)` para
   titular y `probar(nombre, fn)` donde fn devuelve `true`, o un
   objeto `{ ok, det }` cuando conviene explicar el fallo.

   Se conserva tal cual a propósito. Portar 186 pruebas a otro estilo
   habría significado reescribir 186 aserciones a mano, y cada una es
   una oportunidad de cambiar sin querer lo que la prueba afirma. Así
   los cuerpos de las pruebas viajan intactos y lo único nuevo son
   estas veinte líneas.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';

let grupoActual = '';

/** Titula el bloque de pruebas que viene. */
export const grupo = n => { grupoActual = n; };

/** Una prueba. `fn` devuelve true, o { ok, det } para explicar el fallo. */
export function probar(nombre, fn) {
  test(`${grupoActual} · ${nombre}`, () => {
    let r;
    try {
      r = fn();
    } catch (e) {
      assert.fail(`lanzó: ${e.message}`);
    }
    const ok = r === true || (r && r.ok === true);
    const det = (r && r.det) ? ` — ${r.det}` : ` — devolvió ${JSON.stringify(r)}`;
    assert.ok(ok, `${nombre}${det}`);
  });
}

/** Comparación de dinero con tolerancia: los flotantes no dan exacto. */
export const cerca = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
