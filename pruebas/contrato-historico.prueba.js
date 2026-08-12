/* ============================================================
   El servidor devuelve lo que las pantallas piden.

   Tres vistas leen campos de la respuesta de la Edge Function
   `historico`: Resumen usa `patrimonio`, `cuentas` y `salud`;
   Historia usa `historia` y `filasUsadas`; Proyectos usa `cartera`.

   Si alguien renombra uno de esos campos en la función, NADA se
   rompe de forma visible: el campo llega `undefined`, la vista hace
   su `if (!pat) return ''` y el bloque simplemente no aparece. Una
   pantalla que se queda sin la mitad de su contenido y no dice nada
   es exactamente el tipo de fallo que este proyecto persigue.

   Así que el contrato se lee del código de la función —no de un
   comentario— y se compara contra lo que las vistas consumen.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fuente = readFileSync(
  new URL('../supabase/functions/historico/index.ts', import.meta.url), 'utf8');

/** Las claves de primer nivel del objeto que devuelve la función. */
function clavesDeLaRespuesta(texto) {
  // El único `responder({` con varias líneas es la respuesta buena;
  // los errores usan `fallar(...)`, que arma su cuerpo aparte.
  const desde = texto.indexOf('return responder({');
  assert.ok(desde > 0, 'no se encontró la respuesta de la función');
  const hasta = texto.indexOf('\n    });', desde);
  assert.ok(hasta > desde, 'no se encontró el cierre de la respuesta');

  const cuerpo = texto.slice(desde, hasta);
  /* Claves de primer nivel del objeto, con su sangría de seis
     espacios. El `[,:]` no es adorno: `periodo,` va como propiedad
     abreviada y sin él se perdía —que es justo lo que esta prueba
     encontró la primera vez que corrió. */
  return new Set([...cuerpo.matchAll(/^ {6}(\w+)[,:]/gm)].map(m => m[1]));
}

const CLAVES = clavesDeLaRespuesta(fuente);

/* Lo que cada pantalla lee. Si una vista empieza a usar un campo
   nuevo, se agrega aquí y la prueba obliga a que la función lo mande. */
const CONSUMEN = {
  Resumen:   ['patrimonio', 'cuentas', 'salud'],
  Historia:  ['historia', 'filasUsadas'],
  Proyectos: ['cartera'],
  Cierre:    ['cierre', 'paraCerrar'],
  Informe:   ['carta', 'patrimonio', 'salud', 'historia', 'cartera', 'cuentas', 'tarjetas']
};

test('el lector del contrato encuentra la respuesta de verdad', () => {
  // Si esto falla, las de abajo pasarían en verde sin comprobar nada.
  assert.ok(CLAVES.size >= 6, `solo se leyeron ${CLAVES.size} claves: ${[...CLAVES]}`);
  assert.ok(CLAVES.has('periodo'), 'falta `periodo`, que la función siempre devuelve');
});

for (const [vista, campos] of Object.entries(CONSUMEN)) {
  test(`${vista} recibe todos los campos que lee`, () => {
    const faltan = campos.filter(c => !CLAVES.has(c));
    assert.deepEqual(faltan, [],
      `la función ya no devuelve: ${faltan.join(', ')} — ${vista} se quedaría sin ese bloque, en silencio`);
  });
}

test('los errores de la función van marcados para pasar tal cual', () => {
  // `propio: true` es lo que impide que un 500 se convierta en «falló
  // el servidor» y se trague el motivo real. Ver `datos/mensajes.js`.
  assert.match(fuente, /propio:\s*true/,
    'los errores perdieron la marca `propio` y volverían a salir como genéricos');
  assert.doesNotMatch(fuente, /return responder\(\{ error:/,
    'quedó un error sin pasar por `fallar()`, así que sale sin la marca');
});
