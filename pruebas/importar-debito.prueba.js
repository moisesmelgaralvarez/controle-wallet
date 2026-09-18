/* ============================================================
   Una compra leída del estado de cuenta de una CUENTA baja de esa cuenta.

   Lo que pasaba: el motor colgaba la compra de «la tarjeta de débito de
   esta cuenta», y si nadie la había anotado —lo normal— quedaba como
   «tarjeta» sin tarjeta. No bajaba la cuenta ni subía ninguna deuda, y en
   Movimientos se mezclaba con la tarjeta de crédito. El dueño lo preguntó
   así: «¿por qué lo detecta como tarjeta si es una cuenta bancaria?».

   Y de paso, quién hizo el gasto: con la persona anotada solo por el
   nombre de pila, todas sus compras caían en la primera del hogar.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../sitio/app/nucleo/index.js';

let n = 0;
const ayudaPara = D => ({
  uid: () => `id-${++n}`,
  now: () => '2026-09-18T12:00:00Z',
  periodoDe: f => f.slice(0, 7),
  debitoDe: cuentaId => ((D.tarjetas || [])
    .find(t => t.tipo === 'debito' && t.cuentaId === cuentaId) || {}).id || null,
  tarjetaCredito: () => (D.tarjetas || []).find(t => (t.tipo || 'credito') === 'credito') || null
});

const hogar = () => ({
  version: 6, configurado: true, inicioMes: 1,
  personas: [
    { id: 'p-moi', nombre: 'Moisés Melgar', cuentaId: 'c-moi' },
    { id: 'p-jud', nombre: 'Judith', cuentaId: 'c-jud' }
  ],
  cuentas: [
    { id: 'c-moi', nombre: 'Planilla Moisés', saldoInicial: 0, desdeMes: '2026-09' },
    { id: 'c-jud', nombre: 'Planilla Judith', saldoInicial: 5000, desdeMes: '2026-09' }
  ],
  tarjetas: [{ id: 't-cred', nombre: 'Walmart', tipo: 'credito', diaCorte: 6 }],
  gastos: [], comercios: {}, movimientos: [], retiros: [], pagosTarjeta: [],
  plantillaIngresos: [], ingresosMes: {}, financiamientos: [], proyectos: []
});

const loteCuenta = (movs, extra = {}) => ({
  archivo: 'judith-septiembre.csv', tipo: 'cuenta',
  desde: '2026-09-01', hasta: '2026-09-15', movs, ...extra
});

const compra = (fecha, concepto, monto, titular = '') =>
  ({ fecha, concepto, monto: -monto, tipo: 'gasto', titular });

test('La compra de una cuenta sin débito anotado crea esa tarjeta y cuelga de ella', () => {
  const D = hogar();
  const r = A.aplicarLote(D, loteCuenta([
    compra('2026-09-03', 'PEDIDOSYA PUPUSAS GRILL', 325),
    compra('2026-09-06', 'PEDIDOSYA PLUS', 83.40)
  ]), { clase: 'cuenta', id: 'c-jud' }, ayudaPara(D));

  const debito = D.tarjetas.filter(t => t.tipo === 'debito');
  assert.equal(debito.length, 1, 'una sola tarjeta de débito, no una por compra');
  assert.equal(debito[0].cuentaId, 'c-jud');
  assert.match(debito[0].nombre, /Planilla Judith/);
  assert.deepEqual(r.tarjetasNuevas, [debito[0].id]);
  assert.ok(D.movimientos.every(m => m.tarjetaId === debito[0].id),
    'ninguna compra queda como «tarjeta» sin tarjeta');
});

test('Y la cuenta baja: el saldo de Judith refleja lo que gastó', () => {
  const D = hogar();
  A.aplicarLote(D, loteCuenta([
    compra('2026-09-03', 'PEDIDOSYA PUPUSAS GRILL', 325),
    compra('2026-09-06', 'PEDIDOSYA PLUS', 83.40)
  ]), { clase: 'cuenta', id: 'c-jud' }, ayudaPara(D));
  const s = A.saldoCuenta(D, D.cuentas.find(c => c.id === 'c-jud'));
  assert.equal(Math.round(s.saldo * 100) / 100, 5000 - 325 - 83.40);
});

test('Tampoco sube la deuda de la tarjeta de crédito', () => {
  const D = hogar();
  A.aplicarLote(D, loteCuenta([compra('2026-09-03', 'FARMACIA KIELSA', 340)]),
    { clase: 'cuenta', id: 'c-jud' }, ayudaPara(D));
  assert.ok(!D.movimientos.some(m => m.tarjetaId === 't-cred'));
});

test('Si la tarjeta de débito ya existe, se usa esa y no se crea otra', () => {
  const D = hogar();
  D.tarjetas.push({ id: 't-deb', nombre: 'Débito Judith', tipo: 'debito', cuentaId: 'c-jud' });
  const r = A.aplicarLote(D, loteCuenta([compra('2026-09-03', 'FARMACIA KIELSA', 340)]),
    { clase: 'cuenta', id: 'c-jud' }, ayudaPara(D));
  assert.equal(D.tarjetas.filter(t => t.tipo === 'debito').length, 1);
  assert.deepEqual(r.tarjetasNuevas, []);
  assert.equal(D.movimientos[0].tarjetaId, 't-deb');
});

test('Un archivo de la cuenta sin compras no inventa una tarjeta', () => {
  const D = hogar();
  const r = A.aplicarLote(D, loteCuenta([
    { fecha: '2026-09-04', concepto: 'RETIRO DE EFECTIVO ATM', monto: -1500, tipo: 'retiro' }
  ]), { clase: 'cuenta', id: 'c-jud' }, ayudaPara(D));
  assert.equal(D.tarjetas.length, 1);
  assert.deepEqual(r.tarjetasNuevas, []);
});

test('El estado de cuenta de la TARJETA no crea tarjetas de débito', () => {
  const D = hogar();
  const r = A.aplicarLote(D, { archivo: 'walmart.pdf', tipo: 'tarjeta', desde: '2026-09-01',
    hasta: '2026-09-15', movs: [compra('2026-09-03', 'WALMART', 1200)] },
    { clase: 'tarjeta', id: 't-cred' }, ayudaPara(D));
  assert.equal(D.tarjetas.length, 1);
  assert.deepEqual(r.tarjetasNuevas, []);
  assert.equal(D.movimientos[0].tarjetaId, 't-cred');
});

test('Del archivo de la cuenta de Judith, lo sin nombre es de Judith', () => {
  const D = hogar();
  A.aplicarLote(D, loteCuenta([compra('2026-09-03', 'FARMACIA KIELSA', 340)]),
    { clase: 'cuenta', id: 'c-jud' }, ayudaPara(D));
  assert.equal(D.movimientos[0].personaId, 'p-jud',
    'antes caía en la primera persona del hogar');
});

test('Anotada solo por el nombre de pila, se reconoce en el plástico', () => {
  const D = hogar();
  A.aplicarLote(D, { archivo: 'walmart.pdf', tipo: 'tarjeta', desde: '2026-09-01',
    hasta: '2026-09-15', movs: [
      compra('2026-09-03', 'SUPER TIENDA', 500, 'JUDITH ELIZABETH/VALLEJOS AGUILERA'),
      compra('2026-09-04', 'GASOLINERA', 900, 'MOISES ALEXANDER/MELGAR ALVAREZ')
    ] }, { clase: 'tarjeta', id: 't-cred' }, ayudaPara(D));
  assert.equal(D.movimientos[0].personaId, 'p-jud');
  assert.equal(D.movimientos[1].personaId, 'p-moi');
});

test('Un nombre de pila corto no se queda con lo de otra persona', () => {
  const D = hogar();
  D.personas.push({ id: 'p-ana', nombre: 'Ana' });
  A.aplicarLote(D, { archivo: 'walmart.pdf', tipo: 'tarjeta', desde: '2026-09-01',
    hasta: '2026-09-15', movs: [compra('2026-09-03', 'SUPER TIENDA', 500, 'DIANA MARIA/LOPEZ PAZ')] },
    { clase: 'tarjeta', id: 't-cred' }, ayudaPara(D));
  assert.notEqual(D.movimientos[0].personaId, 'p-ana', '«Ana» está dentro de «Diana»');
});

test('La tarjeta nueva viaja a la base solo con id y nombre', async () => {
  const { filaTarjetaDebito } = await import('../sitio/app/datos/importar.js');
  const fila = filaTarjetaDebito({ id: 'x', nombre: 'Débito Planilla', tipo: 'credito',
                                   cuentaId: 'otra', diaCorte: 3 });
  // El tipo y la cuenta los decide la base: si viajaran, un cliente
  // podría crear una tarjeta de crédito sin corte o colgarla de otra cuenta.
  assert.deepEqual(fila, { id: 'x', nombre: 'Débito Planilla' });
});
