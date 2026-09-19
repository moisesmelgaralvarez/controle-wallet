/* ============================================================
   La consulta y el mapeo no se pueden separar.

   `historico` dejó de pedir `select=*` para no bajar 190 KB de
   columnas de auditoría que nadie lee. El ahorro es real y el riesgo
   también: el día que alguien agregue un campo al mapeo del armador y
   no a la lista de columnas, ese campo llegará `undefined`, `num()` lo
   volverá 0, y el saldo saldrá mal SIN UN SOLO ERROR.

   Es la trampa que este proyecto ya documentó dos veces —el `numeric`
   que llega como texto, el nombre anidado que llega vacío— y las dos
   fallaron en silencio dando un número creíble.

   Así que la lista no se mantiene a mano: se comprueba contra quien la
   consume. Esta prueba lee `armador.js`, saca CADA propiedad en
   `snake_case` que el mapeo consulta, y exige que esté pedida.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COLUMNAS, CONFIGURACION, POR_MES } from '../sitio/app/datos/armador.js';

const fuente = readFileSync(
  new URL('../sitio/app/datos/armador.js', import.meta.url), 'utf8');

/* Solo lo que se LEE de una fila, y solo lo que tiene guion bajo:
   `c.saldo_inicial`, `m.gasto_id`. Quedan fuera los nombres de tabla y
   lo que aparezca en un comentario, y también las columnas de una sola
   palabra —`nombre`, `monto`, `fecha`— porque distinguirlas de un
   `.map` o un `.filter` pediría una lista de excepciones que se
   desactualizaría sola. No es una pérdida: la columna que alguien
   olvida al agregar un campo es siempre una de las compuestas. */
const LEIDAS = new Set(
  [...fuente.matchAll(/\b[a-z]\w*\.([a-z]+(?:_[a-z]+)+)\b/g)].map(m => m[1]));

/* `hogares` se trae aparte y es UNA fila: no vale la pena recortarla.
   Sus campos se listan acá para que la prueba no los reclame. */
const DEL_HOGAR = new Set(['inicio_mes']);

const PEDIDAS = new Set(
  Object.values(COLUMNAS).flatMap(lista => lista.split(',')));

test('se leyeron propiedades del armador, o abajo no se comprueba nada', () => {
  // Sin esto, un cambio en el mapeo que rompiera la expresión regular
  // dejaría la prueba en verde sin haber mirado una sola columna.
  assert.ok(LEIDAS.size >= 25,
    `solo se leyeron ${LEIDAS.size} propiedades: la expresión ya no encuentra el mapeo`);
  assert.ok(LEIDAS.has('saldo_inicial') && LEIDAS.has('gasto_id') && LEIDAS.has('paga_total'),
    'faltan columnas conocidas: el lector está mirando otra cosa');
});

test('cada columna que el armador lee está pedida en la consulta', () => {
  const faltan = [...LEIDAS].filter(c => !PEDIDAS.has(c) && !DEL_HOGAR.has(c)).sort();
  assert.deepEqual(faltan, [],
    `el armador lee ${faltan.join(', ')} y la consulta no las pide: llegarían undefined, ` +
    'se volverían 0 al pasar por num(), y las cifras saldrían mal sin dar error');
});

test('no se pide una tabla sin decir qué columnas', () => {
  // Una tabla en la lista de tablas y no en la de columnas volvería a
  // `select=*` sin que nadie lo note.
  const sinColumnas = [...CONFIGURACION, ...POR_MES].filter(t => !COLUMNAS[t]);
  assert.deepEqual(sinColumnas, [],
    `estas tablas seguirían pidiendo todo: ${sinColumnas.join(', ')}`);
});

test('no se piden columnas de una tabla que ya no se trae', () => {
  const tablas = new Set([...CONFIGURACION, ...POR_MES]);
  const sobran = Object.keys(COLUMNAS).filter(t => !tablas.has(t));
  assert.deepEqual(sobran, [], `sobran en COLUMNAS: ${sobran.join(', ')}`);
});

test('las columnas de auditoría NO se piden — que es de lo que se trata', () => {
  for (const c of ['actualizado_en', 'actualizado_por']) {
    assert.ok(!PEDIDAS.has(c),
      `volvió a pedirse ${c}: son los 190 KB por hogar que esto vino a quitar`);
  }
  // Y `creado_en` sí, porque `porOrden` lo usa para desempatar.
  assert.ok(PEDIDAS.has('creado_en'),
    'sin creado_en, gastos y proyectos cambiarían de orden entre cargas');
});
