/* ============================================================
   Cómo se salda la tarjeta: deuda contra lo que hay y lo que viene.

   El caso es el del dueño a mediados de agosto: la tarjeta debe
   L 20,741.20, en la cuenta de Judith hay L 6,040.70, el 31 cae el
   sueldo y el 6 las comisiones, que cambian cada mes.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../sitio/app/nucleo/index.js';
import { proximaFecha } from '../sitio/app/nucleo/saldar.js';

const confirmado = (evId, lineas) => ({ confirmado: { [evId]: true }, lineas: { [evId]: lineas } });

const hogar = () => ({
  version: 6, configurado: true, inicioMes: 1,
  personas: [{ id: 'p1', nombre: 'Moisés', cuentaId: 'c1' }],
  cuentas: [{ id: 'c1', nombre: 'Planilla Judith', saldoInicial: 0, desdeMes: '2026-08',
              saldoBanco: { monto: 6040.70, fecha: '2026-08-14' } }],
  tarjetas: [{ id: 't1', nombre: 'Walmart', tipo: 'credito', diaCorte: 21, desdeMes: '2026-08',
               saldoBanco: { monto: 20741.20, fecha: '2026-08-17' } }],
  plantillaIngresos: [
    { id: 'sueldo', nombre: 'Sueldo', dia: 31, lineas: [{ personaId: 'p1', bruto: 18000, deducciones: [] }] },
    { id: 'comis', nombre: 'Comisiones', dia: 6, lineas: [{ personaId: 'p1', bruto: 5000, deducciones: [] }] }
  ],
  // Las comisiones de verdad: 8,000, 12,000 y 10,000. La plantilla dice 5,000
  // porque es lo que alguien tecleó una vez, y ya no se parece a nada.
  ingresosMes: {
    '2026-05': confirmado('comis', { p1: { bruto: 8000, deducciones: [] } }),
    '2026-06': confirmado('comis', { p1: { bruto: 12000, deducciones: [] } }),
    '2026-07': confirmado('comis', { p1: { bruto: 10500, deducciones: [{ concepto: 'ISR', monto: 500 }] } })
  },
  gastos: [], movimientos: [], retiros: [], pagosTarjeta: [], financiamientos: [], proyectos: []
});

test('Pone la deuda contra lo que hay y lo que viene, en orden de fecha', () => {
  const s = A.planParaSaldar(hogar(), '2026-08', '2026-08-18');
  assert.equal(s.hay, true);
  assert.equal(s.deuda, 20741.20);
  assert.equal(s.disponible, 6040.70);
  assert.deepEqual(s.ingresos.map(x => [x.nombre, x.fecha]),
    [['Sueldo', '2026-08-31'], ['Comisiones', '2026-09-06']]);
});

test('Las comisiones valen lo que dejaron las últimas veces, no la plantilla', () => {
  const s = A.planParaSaldar(hogar(), '2026-08', '2026-08-18');
  const c = s.ingresos.find(x => x.id === 'comis');
  assert.equal(c.base, 'promedio');
  assert.equal(c.veces, 3);
  assert.equal(c.monto, 10000, '(8,000 + 12,000 + 10,000) / 3, ya sin el ISR');
  assert.equal(c.minimo, 8000);
  assert.equal(c.maximo, 12000);
});

test('Un ingreso nunca confirmado usa la plantilla, y lo dice', () => {
  const s = A.planParaSaldar(hogar(), '2026-08', '2026-08-18');
  const x = s.ingresos.find(i => i.id === 'sueldo');
  assert.equal(x.base, 'plantilla');
  assert.equal(x.monto, 18000);
});

test('Dice con cuál ingreso se completa la deuda y cuánto sobra', () => {
  const s = A.planParaSaldar(hogar(), '2026-08', '2026-08-18');
  // 6,040.70 + 18,000 = 24,040.70 ≥ 20,741.20: alcanza con el sueldo.
  assert.equal(s.cubreYa, false);
  assert.equal(s.cubreCon, 'sueldo');
  assert.equal(s.faltaTrasDisponible, 14700.50);
  assert.equal(s.resultado, 13299.50, "6,040.70 + 18,000 + 10,000 − 20,741.20");
});

test('Lo que viene NO se suma al disponible', () => {
  const D = hogar();
  const antes = A.patrimonio(D, '2026-08').enBanco;
  A.planParaSaldar(D, '2026-08', '2026-08-18');
  assert.equal(A.patrimonio(D, '2026-08').enBanco, antes);
});

test('Sin deuda no hay nada que saldar', () => {
  const D = hogar();
  D.tarjetas[0].saldoBanco = { monto: 0, fecha: '2026-08-17' };
  assert.equal(A.planParaSaldar(D, '2026-08', '2026-08-18').hay, false);
});

test('El día que cae un ingreso ya no se cuenta como por venir', () => {
  // Ese día el dinero ya está en el banco, o está por estarlo: contarlo
  // también como «por entrar» lo sumaría dos veces en cuanto se importe.
  assert.equal(proximaFecha(6, '2026-09-06'), '2026-10-06');
  assert.equal(proximaFecha(6, '2026-09-05'), '2026-09-06');
  assert.equal(proximaFecha(31, '2026-09-18'), '2026-09-30', 'septiembre no tiene 31');
  assert.equal(proximaFecha(15, '2026-12-20'), '2027-01-15');
});
