/* ============================================================
   El armador traduce sin cambiar un número.

   La forma de probarlo no es revisar campo por campo a ojo — eso
   se pasa por alto un `saldo_inicial` que llega como `undefined` y
   se convierte en cero sin avisar. La forma es esta:

     el MISMO hogar, escrito de dos maneras
       · como documento a mano (la forma que el núcleo espera)
       · como filas de base (lo que devuelve PostgREST)

     y el núcleo tiene que dar EL MISMO NÚMERO por los dos caminos.

   Si el armador se come un campo, pierde un decimal o confunde un
   mes, alguno de los cálculos se separa y la prueba lo dice.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../nucleo/index.js';
import { armar } from '../datos/armador.js';

/* ------------------------------------------------------------
   El hogar, a mano. Ejercita lo que de verdad cuesta: ingreso con
   retenciones, un mes confirmado y otro no, tarjeta de crédito con
   su ciclo, financiamiento a medias, efectivo, pago de tarjeta y
   un mes ya congelado.
   ------------------------------------------------------------ */

const documentoAMano = {
  inicioMes: 7,
  moneda: 'HNL',
  configurado: true,
  personas: [{ id: 'p1', nombre: 'Moisés', cuentaId: 'c1' }],
  cuentas: [{
    id: 'c1', nombre: 'Ficohsa', numero: '200012610911',
    saldoInicial: 30000, desdeMes: '2026-07',
    retenido: { monto: 450, fecha: '2026-08-04' },
    saldoBanco: { monto: 28750.25, fecha: '2026-08-03' }
  }],
  tarjetas: [{
    id: 't1', nombre: 'BAC', numero: '4321', tipo: 'credito',
    diaCorte: 6, diaPago: 20, pagaCon: 'q1', cuentaId: null,
    saldoInicial: 0, desdeMes: '2026-07', pagaTotal: true, tasaAnual: 54,
    retenido: { monto: 120, fecha: '2026-08-05' },
    saldoBanco: { monto: 19101, fecha: '2026-08-06' }
  }],
  plantillaIngresos: [{
    id: 'q1', nombre: 'Comisiones', dia: 6,
    lineas: [{ personaId: 'p1', bruto: 25000, deducciones: [{ concepto: 'ISR', monto: 5000 }] }]
  }],
  ingresosMes: {
    '2026-07': {
      lineas: { q1: { p1: { bruto: 27400, deducciones: [{ concepto: 'ISR', monto: 6200 }] } } },
      confirmado: { q1: true }
    }
  },
  gastos: [
    { id: 'g1', concepto: 'Comida',    monto: 8000, categoria: 'Alimentación', medioPago: 'tarjeta',  tarjetaId: 't1', crecimiento: 0 },
    { id: 'g2', concepto: 'Pediatría', monto: 2000, categoria: 'Salud',        medioPago: 'efectivo', tarjetaId: null, crecimiento: 3 }
  ],
  financiamientos: [{ id: 'f1', nombre: 'Refri', cuotaMensual: 500, cuotasTotales: 12, cuotasPagadas: 5, tarjetaId: null }],
  proyectos: [{
    id: 'pr1', nombre: 'Carro', costoMin: 180000, costoMax: 220000,
    aporteMensual: 3000, fechaObjetivo: '', nota: '', tipo: 'necesidad',
    urgencia: 'este_ano', consecuencia: '',
    aportes: [{ id: 'ap1', personaId: 'p1', monto: 4500, fecha: '2026-07-20', nota: '' }]
  }],
  movimientos: [
    { id: 'm1', fecha: '2026-07-20', periodo: '2026-07', monto: 2410.75, concepto: 'Súper',   gastoId: 'g1', personaId: 'p1', medioPago: 'tarjeta',  tarjetaId: 't1', origen: 'manual', fuente: '' },
    { id: 'm2', fecha: '2026-08-02', periodo: '2026-07', monto: 1180.50, concepto: 'Gasolina', gastoId: 'g1', personaId: 'p1', medioPago: 'tarjeta',  tarjetaId: 't1', origen: 'manual', fuente: '' },
    { id: 'm3', fecha: '2026-07-15', periodo: '2026-07', monto: 640.25,  concepto: 'Farmacia', gastoId: 'g2', personaId: 'p1', medioPago: 'efectivo', tarjetaId: null, origen: 'manual', fuente: '' }
  ],
  retiros: [{ id: 'r1', fecha: '2026-07-18', periodo: '2026-07', monto: 3000, cuentaId: 'c1', personaId: 'p1', nota: 'Cajero' }],
  pagosTarjeta: [{ id: 'pt1', fecha: '2026-07-25', periodo: '2026-07', monto: 5000, tarjetaId: 't1', cuentaId: 'c1', nota: '' }],
  presupuestoMes: {
    '2026-06': { montos: { g1: 7500, g2: 1900 }, notas: { g1: 'Mes de vacaciones' }, cerrado: true, cerradoEl: '2026-07-07T10:00:00Z' }
  },
  comercios: { PAIZ: 'g1', 'FARMACIA KIELSA': 'g2' }
};

/* ------------------------------------------------------------
   El mismo hogar, como lo devuelve la base.

   Los montos van COMO TEXTO a propósito: así los entrega PostgREST
   para las columnas `numeric`, y es la trampa que más caro sale.
   Un "8000.00" sin convertir no revienta — se concatena y aparece
   un número absurdo tres pantallas más allá.
   ------------------------------------------------------------ */

const filasDeBase = {
  hogar: { inicio_mes: 7, moneda: 'HNL' },
  personas: [{ id: 'p1', nombre: 'Moisés', cuenta_id: 'c1', orden: 0, creado_en: '2026-07-01' }],
  cuentas: [{
    id: 'c1', nombre: 'Ficohsa', numero: '200012610911',
    saldo_inicial: '30000.00', desde_mes: '2026-07',
    retenido_monto: '450.00', retenido_fecha: '2026-08-04',
    saldo_banco_monto: '28750.25', saldo_banco_fecha: '2026-08-03',
    orden: 0, creado_en: '2026-07-01'
  }],
  tarjetas: [{
    id: 't1', nombre: 'BAC', numero: '4321', tipo: 'credito',
    dia_corte: 6, dia_pago: 20, paga_con: 'q1', cuenta_id: null,
    saldo_inicial: '0.00', desde_mes: '2026-07', paga_total: true, tasa_anual: '54.00',
    retenido_monto: '120.00', retenido_fecha: '2026-08-05',
    saldo_banco_monto: '19101.00', saldo_banco_fecha: '2026-08-06',
    orden: 0, creado_en: '2026-07-01'
  }],
  plantilla_ingresos: [{ id: 'q1', nombre: 'Comisiones', dia: 6, orden: 0, creado_en: '2026-07-01' }],
  plantilla_lineas: [{
    id: 'pl1', plantilla_id: 'q1', persona_id: 'p1',
    bruto: '25000.00', deducciones: [{ concepto: 'ISR', monto: 5000 }],
    orden: 0, creado_en: '2026-07-01'
  }],
  ingresos_mes: [{
    id: 'im1', periodo: '2026-07', plantilla_id: 'q1', persona_id: 'p1',
    bruto: '27400.00', deducciones: [{ concepto: 'ISR', monto: '6200.00' }], confirmado: true,
    orden: 0, creado_en: '2026-08-01'
  }],
  gastos: [
    { id: 'g1', concepto: 'Comida',    monto: '8000.00', categoria: 'Alimentación', medio_pago: 'tarjeta',  tarjeta_id: 't1', crecimiento: '0.00', orden: 0, creado_en: '2026-07-01' },
    { id: 'g2', concepto: 'Pediatría', monto: '2000.00', categoria: 'Salud',        medio_pago: 'efectivo', tarjeta_id: null, crecimiento: '3.00', orden: 1, creado_en: '2026-07-01' }
  ],
  financiamientos: [{ id: 'f1', nombre: 'Refri', cuota_mensual: '500.00', cuotas_totales: 12, cuotas_pagadas: 5, tarjeta_id: null, orden: 0, creado_en: '2026-07-01' }],
  proyectos: [{
    id: 'pr1', nombre: 'Carro', costo_min: '180000.00', costo_max: '220000.00',
    aporte_mensual: '3000.00', fecha_objetivo: null, nota: null, tipo: 'necesidad',
    urgencia: 'este_ano', consecuencia: null, orden: 0, creado_en: '2026-07-01'
  }],
  aportes: [{ id: 'ap1', proyecto_id: 'pr1', persona_id: 'p1', monto: '4500.00', fecha: '2026-07-20', nota: null, orden: 0, creado_en: '2026-07-20' }],
  movimientos: [
    { id: 'm1', fecha: '2026-07-20', periodo: '2026-07', monto: '2410.75', concepto: 'Súper',    gasto_id: 'g1', persona_id: 'p1', medio_pago: 'tarjeta',  tarjeta_id: 't1', origen: 'manual', fuente: null },
    { id: 'm2', fecha: '2026-08-02', periodo: '2026-07', monto: '1180.50', concepto: 'Gasolina', gasto_id: 'g1', persona_id: 'p1', medio_pago: 'tarjeta',  tarjeta_id: 't1', origen: 'manual', fuente: null },
    { id: 'm3', fecha: '2026-07-15', periodo: '2026-07', monto: '640.25',  concepto: 'Farmacia', gasto_id: 'g2', persona_id: 'p1', medio_pago: 'efectivo', tarjeta_id: null, origen: 'manual', fuente: null }
  ],
  retiros: [{ id: 'r1', fecha: '2026-07-18', periodo: '2026-07', monto: '3000.00', cuenta_id: 'c1', persona_id: 'p1', nota: 'Cajero' }],
  pagos_tarjeta: [{ id: 'pt1', fecha: '2026-07-25', periodo: '2026-07', monto: '5000.00', tarjeta_id: 't1', cuenta_id: 'c1', nota: null }],
  presupuesto_mes: [{
    id: 'pm1', periodo: '2026-06',
    montos: { g1: '7500.00', g2: '1900.00' }, notas: { g1: 'Mes de vacaciones' },
    cerrado: true, cerrado_el: '2026-07-07T10:00:00Z'
  }],
  comercios: [
    { id: 'co1', clave: 'PAIZ', gasto_id: 'g1' },
    { id: 'co2', clave: 'FARMACIA KIELSA', gasto_id: 'g2' }
  ]
};

const armado = armar(filasDeBase);
const PER = '2026-07';

/* ------------------------------------------------------------
   Los dos caminos tienen que coincidir.
   ------------------------------------------------------------ */

/** Compara el resultado de una función del núcleo por ambos caminos. */
function igual(nombre, fn) {
  test(`mismo resultado por ambos caminos · ${nombre}`, () => {
    assert.deepEqual(fn(armado), fn(documentoAMano));
  });
}

igual('ingresoMes',      D => A.ingresoMes(D, PER));
igual('gastosMes',       D => A.gastosMes(D, 0, PER));
igual('resumenMes',      D => A.resumenMes(D, PER));
igual('cicloTarjeta',    D => A.cicloTarjeta(D, D.tarjetas[0], PER));
igual('estadoTarjeta',   D => A.estadoTarjeta(D, D.tarjetas[0], PER));
igual('deudaTarjeta',    D => A.deudaTarjeta(D, D.tarjetas[0], PER));
igual('saldoCuenta',     D => A.saldoCuenta(D, D.cuentas[0], PER));
igual('saldosCuentas',   D => A.saldosCuentas(D, PER));
igual('efectivo',        D => A.efectivo(D, PER));
igual('patrimonio',      D => A.patrimonio(D, PER));
igual('cierreDeMes',     D => A.cierreDeMes(D, PER));
igual('conciliaciones',  D => A.conciliaciones(D, PER));
igual('saldosCierre',    D => A.saldosCierre(D, PER));
igual('aperturaDe',      D => A.aperturaDe(D, PER));
igual('porCategoria',    D => A.porCategoria(D, PER));
igual('historia',        D => A.historia(D, PER));
igual('pulso',           D => A.pulso(D, PER, '2026-07-20'));
igual('cuotasEn',        D => A.cuotasEn(D, 0));
igual('liberaciones',    D => A.liberaciones(D));
igual('saludFinanciera', D => A.saludFinanciera(D, PER));
igual('evaluarCartera',  D => A.evaluarCartera(D, PER));
igual('priorizar',       D => A.priorizar(D, PER));
igual('proyectar',       D => A.proyectar(D, PER, 12));
igual('cartaAsesor',     D => A.cartaAsesor(D, PER));

/* ------------------------------------------------------------
   Y las trampas, comprobadas de frente.
   ------------------------------------------------------------ */

test('los montos que llegan como texto quedan convertidos a número', () => {
  const sospechosos = [];
  const revisar = (ruta, v) => {
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) sospechosos.push(`${ruta} = "${v}"`);
    else if (Array.isArray(v)) v.forEach((x, i) => revisar(`${ruta}[${i}]`, x));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => revisar(`${ruta}.${k}`, x));
  };
  // Se saltan las fechas y los períodos, que son texto legítimo.
  const doc = JSON.parse(JSON.stringify(armado));
  revisar('D', doc);
  const numericos = sospechosos.filter(s => !/fecha|periodo|desdeMes|cerradoEl|numero|dia\b/i.test(s));
  assert.deepEqual(numericos, [], 'quedaron montos como texto');
});

test('el día de arranque del mes viene del hogar, no de una tabla', () => {
  assert.equal(armado.inicioMes, 7);
  // Con arranque 7, un gasto del 2 de agosto pertenece a JULIO.
  assert.equal(A.periodoDe('2026-08-02', armado.inicioMes), '2026-07');
});

test('las anclas de conciliación llegan completas', () => {
  assert.deepEqual(armado.cuentas[0].saldoBanco, { monto: 28750.25, fecha: '2026-08-03' });
  assert.deepEqual(armado.cuentas[0].retenido,   { monto: 450, fecha: '2026-08-04' });
  assert.deepEqual(armado.tarjetas[0].saldoBanco, { monto: 19101, fecha: '2026-08-06' });
  assert.deepEqual(armado.tarjetas[0].retenido,   { monto: 120, fecha: '2026-08-05' });
});

test('una cuenta sin declaración del banco no inventa un ancla en cero', () => {
  // Cero declarado y "nada declarado" son cosas distintas: un cero
  // dice que la cuenta está vacía, la ausencia dice que nadie lo ha
  // dicho. Confundirlos haría fallar una conciliación que ni
  // siquiera debía correr.
  const sin = armar({ hogar: {}, cuentas: [{ id: 'x', nombre: 'Sin banco', saldo_inicial: '10', desde_mes: '2026-07' }] });
  assert.equal(sin.cuentas[0].saldoBanco, undefined);
  assert.equal(sin.cuentas[0].retenido, undefined);
});

test('un pago con alguna línea sin confirmar NO cuenta como confirmado', () => {
  const doc = armar({
    hogar: { inicio_mes: 1 },
    ingresos_mes: [
      { periodo: '2026-08', plantilla_id: 'q1', persona_id: 'p1', bruto: '100', deducciones: [], confirmado: true },
      { periodo: '2026-08', plantilla_id: 'q1', persona_id: 'p2', bruto: '200', deducciones: [], confirmado: false }
    ]
  });
  assert.equal(A.eventoConfirmado(doc, 'q1', '2026-08'), false,
    'un pago a medias se dio por confirmado');
});

test('un pago con todas sus líneas confirmadas sí cuenta', () => {
  const doc = armar({
    hogar: { inicio_mes: 1 },
    ingresos_mes: [
      { periodo: '2026-08', plantilla_id: 'q1', persona_id: 'p1', bruto: '100', deducciones: [], confirmado: true },
      { periodo: '2026-08', plantilla_id: 'q1', persona_id: 'p2', bruto: '200', deducciones: [], confirmado: true }
    ]
  });
  assert.equal(A.eventoConfirmado(doc, 'q1', '2026-08'), true);
});

test('el orden de los proyectos se respeta: es la prioridad, no un capricho', () => {
  const doc = armar({
    hogar: {},
    proyectos: [
      { id: 'b', nombre: 'Segundo', orden: 1, creado_en: '2026-01-01', costo_min: '1', costo_max: '1' },
      { id: 'a', nombre: 'Primero', orden: 0, creado_en: '2026-06-01', costo_min: '1', costo_max: '1' }
    ]
  });
  assert.deepEqual(doc.proyectos.map(p => p.nombre), ['Primero', 'Segundo']);
});

test('un hogar recién creado se arma sin reventar', () => {
  const vacio = armar({ hogar: { inicio_mes: 1 } });
  assert.equal(vacio.configurado, false);
  assert.deepEqual(A.faltantes(vacio).map(f => f.k), ['personas', 'ingresos', 'gastos']);
  // Y el núcleo tiene que poder calcular sobre él sin quejarse.
  const r = A.resumenMes(vacio, '2026-08');
  assert.equal(r.neto, 0);
  assert.equal(r.gastos, 0);
  assert.equal(r.disponible, 0);

  const p = A.patrimonio(vacio, '2026-08');
  assert.equal(p.neto, 0);
  assert.equal(p.hayDatos, false);

  // El pulso y la historia de un hogar sin nada tampoco deben reventar.
  // `historia` no rellena huecos: un mes sin ingreso confirmado y sin un
  // solo movimiento no aparece, así que aquí no debe haber ninguna fila.
  assert.deepEqual(A.historia(vacio, '2026-08').filas, []);
  assert.ok(A.pulso(vacio, '2026-08', '2026-08-15'));
});

test('pedir solo una parte de las tablas no rompe el armado', () => {
  // Una vista que solo necesita el resumen no baja los aportes ni
  // los comercios. El armador tiene que tolerarlo.
  const parcial = armar({ hogar: { inicio_mes: 7 }, gastos: filasDeBase.gastos, personas: filasDeBase.personas });
  assert.equal(parcial.gastos.length, 2);
  assert.deepEqual(parcial.proyectos, []);
  assert.deepEqual(parcial.comercios, {});
});
