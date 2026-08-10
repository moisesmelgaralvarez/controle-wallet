/* ============================================================
   Traer el histórico entero, o no traer nada.

   El cálculo del servidor existe para que las cifras que recorren
   toda la vida del hogar salgan bien. Si al traerlas se pierde un
   pedazo, ese trabajo se vuelve contra sí mismo: da un número con
   toda la autoridad de venir del servidor y con un tercio de los
   datos.

   PostgREST no avisa cuando corta: devuelve un 206 con las primeras
   mil filas y un `Content-Range` que nadie mira. Estas pruebas fijan
   que sí se mira, y que cuando no cuadra se levanta la mano en vez
   de calcular.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traerTodo, totalDelRango } from '../supabase/functions/_compartido/traer.js';

/** Un servidor de mentira con `n` filas y un techo por respuesta. */
function servidor(n, { techo = 1000, mienteElTotal = null } = {}) {
  const filas = Array.from({ length: n }, (_, i) => ({ id: i }));
  const viajes = [];
  const leer = async (desde, hasta) => {
    viajes.push([desde, hasta]);
    const cuantas = Math.min(hasta - desde + 1, techo);
    return { filas: filas.slice(desde, desde + cuantas),
             total: mienteElTotal != null ? mienteElTotal : n };
  };
  leer.viajes = viajes;
  return leer;
}

/* ------------------------------------------------------------
   Leer el total de la cabecera
   ------------------------------------------------------------ */

test('el total sale del Content-Range', () => {
  assert.equal(totalDelRango('0-999/3412'), 3412);
  assert.equal(totalDelRango('0-24/25'), 25);
  // Sin filas, PostgREST manda `*/0`.
  assert.equal(totalDelRango('*/0'), 0);
});

test('un Content-Range sin total no inventa un número', () => {
  // Con `count` apagado el servidor manda `0-999/*`. Que devuelva null
  // importa: null significa «no sé», y con eso la paginación se guía
  // por el tamaño de la página en vez de por un total falso.
  assert.equal(totalDelRango('0-999/*'), null);
  assert.equal(totalDelRango(null), null);
  assert.equal(totalDelRango(''), null);
});

/* ------------------------------------------------------------
   Traer de verdad todo
   ------------------------------------------------------------ */

test('una tabla que cabe en una página se trae de un viaje', async () => {
  const leer = servidor(240);
  const filas = await traerTodo(leer, { tam: 1000 });
  assert.equal(filas.length, 240);
  assert.equal(leer.viajes.length, 1);
});

test('tres años de movimientos se traen enteros, en páginas', async () => {
  // El caso que motivó todo esto: más filas de las que caben en una
  // respuesta. Antes se habrían calculado saldos con las primeras mil.
  const leer = servidor(3412);
  const filas = await traerTodo(leer, { tam: 1000 });
  assert.equal(filas.length, 3412);
  assert.equal(leer.viajes.length, 4);
  // Y en el orden correcto, sin repetir ni saltarse ninguna.
  assert.deepEqual(filas.map(f => f.id).slice(0, 3), [0, 1, 2]);
  assert.equal(filas[3411].id, 3411);
  assert.equal(new Set(filas.map(f => f.id)).size, 3412);
});

test('una tabla vacía no da ni un viaje de más', async () => {
  const leer = servidor(0);
  assert.deepEqual(await traerTodo(leer, { tam: 1000 }), []);
  assert.equal(leer.viajes.length, 1);
});

test('un múltiplo exacto del tamaño de página no se corta', async () => {
  // Justo el caso que un `filas.length < tam` mal puesto se come: con
  // 2000 filas y páginas de 1000, la segunda viene llena y hay que
  // preguntar una vez más.
  const leer = servidor(2000);
  const filas = await traerTodo(leer, { tam: 1000 });
  assert.equal(filas.length, 2000);
});

/* ------------------------------------------------------------
   Y cuando no se puede traer todo, se dice
   ------------------------------------------------------------ */

test('si falta una sola fila, no se calcula: se levanta la mano', async () => {
  // El servidor dice que hay 3,000 pero solo entrega 1,000 y deja de
  // dar más. Devolver esas mil sería el error más caro posible: un
  // saldo con un tercio de la historia y cara de correcto.
  const leer = async (desde) => ({ filas: desde === 0 ? Array.from({ length: 1000 }, (_, i) => ({ id: i })) : [],
                                   total: 3000 });
  await assert.rejects(() => traerTodo(leer, { tam: 1000 }),
    /Se trajeron 1000 filas de 3000/);
});

test('el mensaje dice cuántas faltaron, no «algo salió mal»', async () => {
  const leer = async (desde) => ({ filas: desde === 0 ? [{ id: 1 }] : [], total: 5 });
  await assert.rejects(() => traerTodo(leer, { tam: 1 }),
    e => /No se calcula con historia incompleta/.test(e.message));
});

test('sin total no se inventa un fallo: se para cuando la página viene a medias', async () => {
  // Una instancia con `count` apagado. No hay con qué comprobar, así
  // que se confía en el tamaño de la página — pero tampoco se aborta
  // por no poder comprobar.
  const leer = async (desde, hasta) => {
    const filas = Array.from({ length: Math.max(0, Math.min(hasta, 1499) - desde + 1) }, (_, i) => ({ id: desde + i }));
    return { filas, total: null };
  };
  const filas = await traerTodo(leer, { tam: 1000 });
  assert.equal(filas.length, 1500);
});

test('el tope de páginas evita un bucle infinito si el servidor se porta mal', async () => {
  // Un servidor que siempre devuelve la página llena y un total que
  // nunca se alcanza dejaría esto girando para siempre.
  const leer = async () => ({ filas: Array.from({ length: 10 }, (_, i) => ({ id: i })), total: 999999 });
  await assert.rejects(() => traerTodo(leer, { tam: 10, tope: 5 }),
    /No se calcula con historia incompleta/);
});
