/* ============================================================
   Lo comprado por encargo sale de la tarjeta, pero no es gasto de la casa.

   El dueño: camisas deportivas para un hermano, que después mandó el
   dinero de EE. UU. Esa compra está en la deuda y en el ciclo de la
   tarjeta —el banco la cobra—, pero no puede hacer que Ropa «se pase» ni
   inflar por un año la media con que se sugiere el plan.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../sitio/app/nucleo/index.js';
import { armar, COLUMNAS } from '../sitio/app/datos/armador.js';

const mov = (id, periodo, fecha, gastoId, monto, extra = {}) =>
  ({ id, periodo, fecha, gastoId, monto, medioPago: 'tarjeta', tarjetaId: 't1', ...extra });

const hogar = () => ({
  version: 6, configurado: true, inicioMes: 1,
  personas: [{ id: 'p1', nombre: 'Moisés' }],
  cuentas: [], financiamientos: [], proyectos: [], retiros: [], pagosTarjeta: [],
  plantillaIngresos: [], ingresosMes: {},
  tarjetas: [{ id: 't1', nombre: 'Walmart', tipo: 'credito', diaCorte: 6, desdeMes: '2026-05', saldoInicial: 0 }],
  gastos: [{ id: 'ropa', concepto: 'Ropa', categoria: 'Otros', monto: 1500, crecimiento: 0, medioPago: 'tarjeta' }],
  movimientos: [
    mov('m1', '2026-05', '2026-05-10', 'ropa', 1200),
    mov('m2', '2026-06', '2026-06-10', 'ropa', 1400),
    mov('m3', '2026-07', '2026-07-10', 'ropa', 1300),
    // Las camisas del hermano, en julio.
    mov('m4', '2026-07', '2026-07-20', 'ropa', 8825.54, { encargo: true })
  ]
});

test('No suma al gasto del mes ni al rubro, y se reporta aparte', () => {
  const r = A.realPorRubro(hogar(), '2026-07', {});
  const ropa = r.filas.find(f => f.id === 'ropa');
  assert.equal(ropa.gastado, 1300, 'Ropa no «se pasa» por un favor');
  assert.equal(r.gastado, 1300);
  assert.equal(r.encargo, 8825.54);
  assert.equal(r.movimientosEncargo, 1);
});

test('No entra en «en qué se fue»', () => {
  const c = A.porCategoria(hogar(), '2026-07');
  assert.equal(c.total, 1300);
});

test('No infla la media con que se sugiere el plan', () => {
  const s = A.presupuestoSugerido(hogar(), '2026-07', 12);
  const ropa = s.filas.find(f => f.gastoId === 'ropa');
  // Mediana de 1,200 · 1,400 · 1,300 = 1,300. Con el encargo, julio
  // pesaría 10,125.54 y el máximo saldría disparado.
  assert.ok(ropa.maximo < 2000, `máximo ${ropa.maximo}`);
});

test('Pero SÍ está en la deuda de la tarjeta: el banco la cobra', () => {
  const D = hogar();
  const con = A.deudaTarjeta(D, D.tarjetas[0]).deuda;
  D.movimientos[3].encargo = false;
  const sin = A.deudaTarjeta(D, D.tarjetas[0]).deuda;
  assert.equal(con, sin);
  assert.ok(con > 12000);
});

test('Y en el cierre del mes no hay que justificarla como exceso', () => {
  const c = A.cierreDeMes(hogar(), '2026-07');
  const ropa = (c.filas || []).find(f => f.gastoId === 'ropa');
  assert.ok(ropa && ropa.real === 1300, `real ${ropa && ropa.real}`);
});

test('La base la manda y el armador la lee — y solo `true` es true', () => {
  const doc = armar({ hogar: {}, movimientos: [
    { id: 'a', fecha: '2026-07-20', periodo: '2026-07', monto: '8825.54', encargo: true },
    { id: 'b', fecha: '2026-07-21', periodo: '2026-07', monto: '10' },
    { id: 'c', fecha: '2026-07-22', periodo: '2026-07', monto: '10', encargo: 'false' }
  ] });
  assert.deepEqual(doc.movimientos.map(m => m.encargo), [true, false, false]);
});

test('El histórico la pide: sin la columna, cada encargo volvería a contar', () => {
  // `columnas.prueba.js` solo vigila los nombres compuestos; este es de una
  // sola palabra y se le escaparía.
  assert.ok(COLUMNAS.movimientos.split(',').includes('encargo'));
});
