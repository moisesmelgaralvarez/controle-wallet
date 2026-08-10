/* ============================================================
   Moverse de mes sin salirse ni perder un registro.

   Aritmética de meses: diciembre a enero, el mes anterior al primero,
   un tope que se pasa por uno. Y el caso que de verdad duele —anotar
   un gasto mirando julio y que se guarde en agosto— que no es un error
   de fecha sino de expectativa: el período sale de la FECHA del
   movimiento, no de la pantalla que se está mirando.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limites, mover, esElActual, fechaPorOmision } from '../sitio/app/datos/periodos.js';
import { rangoPeriodo } from '../sitio/app/nucleo/fechas.js';

const hogar = (cuentas = [], tarjetas = []) => ({ cuentas, tarjetas });

/* ------------------------------------------------------------
   Hasta dónde se llega
   ------------------------------------------------------------ */

test('el tope de adelante es el mes en curso', () => {
  const l = limites(hogar(), '2026-08');
  assert.equal(l.ultimo, '2026-08');
  assert.equal(mover('2026-08', 1, l), null, 'no se puede pasar del mes en curso');
  assert.equal(mover('2026-07', 1, l), '2026-08');
});

test('el piso llega hasta el saldo declarado más viejo', () => {
  const l = limites(hogar([{ desdeMes: '2024-03' }], [{ desdeMes: '2023-11' }]), '2026-08');
  assert.equal(l.primero, '2023-11', 'manda el más viejo de todos');
  assert.equal(mover('2023-11', -1, l), null);
  assert.equal(mover('2023-12', -1, l), '2023-11');
});

test('sin nada declarado se llega un año atrás, que es lo que abarca Historia', () => {
  const l = limites(hogar(), '2026-08');
  assert.equal(l.primero, '2025-08');
  assert.equal(mover('2025-08', -1, l), null);
});

test('un saldo declarado hace poco NO esconde los meses anteriores', () => {
  // `desdeMes` dice desde cuándo vale un saldo, no cuándo empezó el
  // hogar: alguien puede declarar su cuenta desde agosto y tener
  // movimientos de julio anotados. Con el piso puesto en agosto, julio
  // quedaría inalcanzable y sus registros invisibles.
  const l = limites(hogar([{ desdeMes: '2026-08' }]), '2026-08');
  assert.equal(l.primero, '2025-08');
  assert.equal(mover('2026-08', -1, l), '2026-07');
});

test('un `desdeMes` con basura no se toma en cuenta', () => {
  // La columna es texto libre: puede llegar vacía o a medio escribir.
  const l = limites(hogar([{ desdeMes: '' }, { desdeMes: 'no-es-un-mes' }, { desdeMes: '2024-01' }]), '2026-08');
  assert.equal(l.primero, '2024-01');
});

test('una cuenta declarada hacia adelante no traba las flechas', () => {
  // Un `desdeMes` posterior al mes en curso dejaría el rango al revés
  // si fuera el único candidato. El año por omisión lo impide.
  const l = limites(hogar([{ desdeMes: '2027-05' }]), '2026-08');
  assert.equal(l.primero, '2025-08');
  assert.equal(l.ultimo, '2026-08');
  assert.equal(mover('2026-08', -1, l), '2026-07');
  assert.equal(mover('2026-08', 1, l), null);
});

/* ------------------------------------------------------------
   El cambio de año
   ------------------------------------------------------------ */

test('de diciembre a enero y de vuelta', () => {
  const l = limites(hogar([{ desdeMes: '2023-01' }]), '2026-08');
  assert.equal(mover('2025-12', 1, l), '2026-01');
  assert.equal(mover('2026-01', -1, l), '2025-12');
});

/* ------------------------------------------------------------
   Saber que no se está mirando hoy
   ------------------------------------------------------------ */

test('el mes en curso se distingue de cualquier otro', () => {
  assert.equal(esElActual('2026-08', '2026-08'), true);
  assert.equal(esElActual('2026-07', '2026-08'), false);
});

/* ------------------------------------------------------------
   La fecha con que se abre un formulario
   ------------------------------------------------------------ */

test('mirando el mes en curso, la fecha por omisión es hoy', () => {
  const rango = rangoPeriodo('2026-08', 1);          // 1–31 de agosto
  assert.equal(fechaPorOmision(rango, '2026-08-09'), '2026-08-09');
});

test('mirando un mes pasado, la fecha cae DENTRO de ese mes', () => {
  // Este es el caso que duele: con la fecha de hoy, el gasto se
  // guardaría en agosto y desaparecería de la pantalla de julio.
  const rango = rangoPeriodo('2026-07', 1);
  assert.equal(fechaPorOmision(rango, '2026-08-09'), '2026-07-31');
});

test('respeta el día de arranque del hogar, no el del calendario', () => {
  // Con arranque el 7, «julio» va del 7 de julio al 6 de agosto: el 9
  // de agosto queda fuera, y la fecha por omisión es el 6 de agosto.
  const rango = rangoPeriodo('2026-07', 7);
  assert.equal(rango.desde, '2026-07-07');
  assert.equal(rango.hasta, '2026-08-06');
  assert.equal(fechaPorOmision(rango, '2026-08-09'), '2026-08-06');

  // Y si hoy SÍ cae dentro de ese mes del hogar, se usa hoy.
  assert.equal(fechaPorOmision(rango, '2026-08-03'), '2026-08-03');
});
