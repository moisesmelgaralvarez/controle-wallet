// Un hogar de EJEMPLO a mediados de septiembre de 2026. Nombres y cifras
// inventados: se parece a un hogar real en la forma —tarjeta que revuelve,
// una cuenta sin estado de cuenta importado, efectivo retirado, una compra
// por encargo, comisiones que cambian cada mes— pero no es el de nadie.
const confirmado = (ev, pid, bruto) => ({ confirmado: { [ev]: true }, lineas: { [ev]: { [pid]: { bruto, deducciones: [] } } } });
const juntar = (...ms) => ms.reduce((a, m) => ({ confirmado: { ...a.confirmado, ...m.confirmado }, lineas: { ...a.lineas, ...m.lineas } }), { confirmado: {}, lineas: {} });
const RUBROS = [['g-super', 'Supermercado', 'Alimentación', 9000], ['g-fuera', 'Comida fuera', 'Alimentación', 0],
  ['g-comb', 'Combustible', 'Transporte', 0], ['g-farm', 'Farmacia', 'Salud', 0], ['g-ropa', 'Ropa', 'Personal', 0],
  ['g-serv', 'Servicios', 'Casa', 0]];
const movs = [];
let n = 0;
const m = (fecha, g, monto, tarjeta, extra = {}) => movs.push({ id: 'm' + (++n), fecha, periodo: fecha.slice(0, 7), gastoId: g, monto,
  medioPago: 'tarjeta', tarjetaId: tarjeta, personaId: 'p-car', concepto: extra.c || '', origen: 'import', ...extra });
// Historial: seis meses de la tarjeta.
for (const [per, k] of [['2026-03', 1], ['2026-04', 1.1], ['2026-05', 0.9], ['2026-06', 1.05], ['2026-07', 1.2], ['2026-08', 1]]) {
  m(per + '-05', 'g-super', Math.round(8200 * k), 't-wal', { c: 'WALMART' });
  m(per + '-12', 'g-fuera', Math.round(2600 * k), 't-wal', { c: 'PEDIDOSYA' });
  m(per + '-15', 'g-comb', Math.round(3100 * k), 't-wal', { c: 'PUMA' });
  m(per + '-20', 'g-farm', Math.round(900 * k), 't-wal', { c: 'KIELSA' });
  m(per + '-25', 'g-serv', Math.round(1800 * k), 't-wal', { c: 'ENEE' });
}
// Septiembre en curso.
m('2026-09-03', 'g-super', 5230.4, 't-wal', { c: 'WALMART LAS TORRES' });
m('2026-09-06', 'g-fuera', 1180, 't-wal', { c: 'PEDIDOSYA RESTAURANTE' });
m('2026-09-08', 'g-comb', 3350, 't-wal', { c: 'PUMA CIRCUNVALACION' });
m('2026-09-10', 'g-farm', 410.5, 't-deb-and', { c: 'FARMACIA KIELSA', personaId: 'p-and' });
m('2026-09-11', 'g-fuera', 325, 't-deb-and', { c: 'PEDIDOSYA PUPUSAS GRILL', personaId: 'p-and' });
m('2026-09-14', 'g-ropa', 1890, 't-wal', { c: 'ELEMENTS' });
m('2026-09-15', 'g-serv', 1760, 't-wal', { c: 'ENEE' });
m('2026-09-12', 'g-ropa', 2400, 't-wal', { c: 'SPORTLINE CAMISAS', encargo: true });
m('2026-09-16', null, 60, 't-deb-and', { c: 'PPT BASICO', personaId: 'p-and' });
movs.push({ id: 'm-efe', fecha: '2026-09-09', periodo: '2026-09', gastoId: 'g-fuera', monto: 300, medioPago: 'efectivo', personaId: 'p-car', concepto: 'Baleadas' });

export const hogarCompleto = () => ({
  version: 6, configurado: true, inicioMes: 1, moneda: 'HNL',
  personas: [{ id: 'p-car', nombre: 'Carlos Mejía', cuentaId: 'c-car' }, { id: 'p-and', nombre: 'Andrea', cuentaId: 'c-and' }],
  cuentas: [
    { id: 'c-car', nombre: 'Planilla Carlos', saldoInicial: 25837.84, desdeMes: '2026-08' },
    { id: 'c-and', nombre: 'Planilla Andrea', saldoInicial: 0, desdeMes: '2026-08', saldoBanco: { monto: 6040.70, fecha: '2026-09-14' },
      retenido: { monto: 150, fecha: '2026-09-14' } }
  ],
  tarjetas: [
    { id: 't-wal', nombre: 'Walmart', tipo: 'credito', diaCorte: 6, diaPago: 28, desdeMes: '2026-03', pagaTotal: true, tasaAnual: 54,
      saldoBanco: { monto: 20741.20, fecha: '2026-09-17' } },
    { id: 't-deb-and', nombre: 'Débito Planilla Andrea', tipo: 'debito', cuentaId: 'c-and' }
  ],
  plantillaIngresos: [
    { id: 'sueldo', nombre: 'Sueldo', dia: 31, lineas: [{ personaId: 'p-car', bruto: 18000, deducciones: [] }] },
    { id: 'comis', nombre: 'Comisiones', dia: 6, lineas: [{ personaId: 'p-car', bruto: 5000, deducciones: [] }] }
  ],
  ingresosMes: {
    '2026-04': confirmado('comis', 'p-car', 9100), '2026-05': confirmado('comis', 'p-car', 12400),
    '2026-06': confirmado('comis', 'p-car', 8600), '2026-07': confirmado('comis', 'p-car', 11800),
    '2026-08': juntar(confirmado('comis', 'p-car', 10200), confirmado('sueldo', 'p-car', 18000))
  },
  gastos: RUBROS.map(([id, concepto, categoria, monto], i) => ({ id, concepto, categoria, monto, crecimiento: 0, medioPago: 'tarjeta', orden: i })),
  movimientos: movs,
  retiros: [{ id: 'r1', fecha: '2026-08-04', periodo: '2026-08', monto: 1500, cuentaId: 'c-and' },
            { id: 'r2', fecha: '2026-08-11', periodo: '2026-08', monto: 700, cuentaId: 'c-and' }],
  pagosTarjeta: [{ id: 'pg1', fecha: '2026-09-06', periodo: '2026-09', monto: 18000, tarjetaId: 't-wal', cuentaId: 'c-car' }],
  financiamientos: [], proyectos: [], comercios: {}, presupuestoMes: {}
});
export const PERIODO = '2026-09';
export const HOY = '2026-09-18';
