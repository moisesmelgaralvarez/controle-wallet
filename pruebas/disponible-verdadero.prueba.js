/* ============================================================
   «Disponible real» solo suma lo que el banco dijo.

   El dueño: «en cuenta planilla dice que tengo 25 mil y no es cierto».
   Esa cuenta nunca tuvo un estado de cuenta importado; su saldo era
   apertura + ingresos confirmados − lo anotado. Faltaba registrar un pago
   y la app inventaba L 25,837 que se sumaban al disponible, al capital y
   al colchón del diagnóstico.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../sitio/app/nucleo/index.js';

const hogar = () => ({
  version: 6, configurado: true, inicioMes: 1,
  personas: [{ id: 'p1', nombre: 'Moisés', cuentaId: 'c-moi' },
             { id: 'p2', nombre: 'Judith', cuentaId: 'c-jud' }],
  cuentas: [
    // Nunca importada: lo que diga sale de la aritmética.
    { id: 'c-moi', nombre: 'Planilla Moisés', saldoInicial: 25837.84, desdeMes: '2026-08' },
    // Importada: el banco dijo 6,040.70 el 14 de agosto.
    { id: 'c-jud', nombre: 'Planilla Judith', saldoInicial: 0, desdeMes: '2026-08',
      saldoBanco: { monto: 6040.70, fecha: '2026-08-14' } }
  ],
  tarjetas: [], gastos: [], movimientos: [], retiros: [], pagosTarjeta: [],
  plantillaIngresos: [], ingresosMes: {}, financiamientos: [], proyectos: []
});

test('Con una cuenta anclada, la que no tiene saldo del banco no se suma', () => {
  const p = A.patrimonio(hogar(), '2026-08');
  assert.equal(p.enBanco, 6040.70, 'antes daba 31,878.54');
});

test('La que se deja fuera no desaparece: se nombra, con lo que calcula la app', () => {
  const p = A.patrimonio(hogar(), '2026-08');
  assert.deepEqual(p.cuentasSinBanco,
    [{ id: 'c-moi', nombre: 'Planilla Moisés', disponible: 25837.84 }]);
  assert.equal(p.bancoCalculado, false);
});

test('El disponible dice de qué fecha es', () => {
  const D = hogar();
  D.cuentas[0].saldoBanco = { monto: 0, fecha: '2026-08-18' };
  const p = A.patrimonio(D, '2026-08');
  assert.equal(p.saldoAl, '2026-08-14', 'la cuenta más atrasada manda');
  assert.equal(p.enBanco, 6040.70);
  assert.deepEqual(p.cuentasSinBanco, []);
});

test('Sin ninguna cuenta anclada se usa lo calculado, y se avisa', () => {
  const D = hogar();
  delete D.cuentas[1].saldoBanco;
  const p = A.patrimonio(D, '2026-08');
  assert.equal(p.enBanco, 25837.84);
  assert.equal(p.bancoCalculado, true);
  assert.deepEqual(p.cuentasSinBanco, [], 'no hay contra qué contrastar: no se excluye nada');
  assert.equal(p.saldoAl, null);
});

test('El colchón del diagnóstico tampoco cuenta la cuenta inventada', () => {
  const D = hogar();
  D.gastos = [{ id: 'g1', concepto: 'Comida', monto: 10000, categoria: 'Alimentación',
                crecimiento: 0, medioPago: 'tarjeta' }];
  const s = A.saludFinanciera(D, '2026-08');
  assert.ok(Math.abs(s.liquido - 6040.70) < 0.01, `líquido ${s.liquido}`);
});
