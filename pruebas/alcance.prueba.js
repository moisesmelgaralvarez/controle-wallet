/* ============================================================
   Un veredicto solo se da cuando se puede dar.

   El navegador baja la configuración entera del hogar pero solo el
   MES EN CURSO de lo que pasó. `saldoCuenta`, `deudaTarjeta` y
   `efectivo` recorren todo el histórico, y de ellas cuelga el
   veredicto de un proyecto. Calculado con un mes, sale mal y no
   avisa.

   Estas pruebas fijan las dos mitades de esa historia:

     1. SIN ANCLA, un mes NO alcanza — y se demuestra con el veredicto
        dándose vuelta, no con una opinión sobre el riesgo.

     2. CON EL ANCLA dentro del mes cargado, un mes da EXACTAMENTE lo
        mismo que doce. Esa igualdad es la que autoriza a la pantalla
        a mostrar el veredicto, y por eso se comprueba aquí y no se
        deja escrita en un comentario.

   El hogar de las dos es el mismo: entran 30,000, se retiran 25,000
   para el gasto en efectivo, se ahorran 5,000 al mes. El proyecto es
   un deseo, que es lo que el colchón flaco castiga.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../sitio/app/nucleo/index.js';
import { alcanzaParaPatrimonio } from '../sitio/app/datos/alcance.js';

const MESES = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
               '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
const AHORA = '2026-08';

const ingresoDe = per => ({ [per]: { lineas: { q1: { p1: { bruto: 30000, deducciones: [] } } },
                                     confirmado: { q1: true } } });
const gastoDe = per => ({ id: 'm' + per, fecha: per + '-15', periodo: per, monto: 25000,
                          concepto: '', gastoId: 'g1', personaId: 'p1',
                          medioPago: 'efectivo', tarjetaId: null, origen: 'manual', fuente: '' });
const retiroDe = per => ({ id: 'r' + per, fecha: per + '-14', periodo: per, monto: 25000,
                           cuentaId: 'c1', personaId: 'p1', nota: '' });

function hogar(meses, ancla) {
  return {
    inicioMes: 1, moneda: 'HNL', configurado: true,
    personas: [{ id: 'p1', nombre: 'Moisés', cuentaId: 'c1' }],
    cuentas: [{ id: 'c1', nombre: 'Ficohsa', numero: '', saldoInicial: 0, desdeMes: '2025-09',
                ...(ancla ? { saldoBanco: ancla } : {}) }],
    tarjetas: [],
    gastos: [{ id: 'g1', concepto: 'Comida', monto: 25000, categoria: 'Alimentación',
               medioPago: 'efectivo', tarjetaId: null, crecimiento: 0 }],
    financiamientos: [],
    plantillaIngresos: [{ id: 'q1', nombre: 'Sueldo', dia: 1,
                          lineas: [{ personaId: 'p1', bruto: 30000, deducciones: [] }] }],
    ingresosMes: Object.assign({}, ...meses.map(ingresoDe)),
    proyectos: [{ id: 'x1', nombre: 'Televisor', costoMin: 15000, costoMax: 15000,
                  aporteMensual: 0, fechaObjetivo: '', nota: '', tipo: 'deseo',
                  urgencia: 'algun_dia', consecuencia: '', aportes: [] }],
    movimientos: meses.map(gastoDe), retiros: meses.map(retiroDe),
    pagosTarjeta: [], presupuestoMes: {}, comercios: {}
  };
}

/** Lo que la pantalla enseñaría de ese proyecto. */
const juicio = D => {
  const s = A.saludFinanciera(D, AHORA);
  const f = A.priorizar(D, AHORA).filas[0];
  return { liquido: s.liquido, mesesColchon: s.mesesColchon,
           puntaje: f.puntaje, veredicto: f.veredicto };
};

/* ------------------------------------------------------------
   1. Sin ancla, un mes no alcanza
   ------------------------------------------------------------ */

test('sin ancla, el veredicto se da vuelta cuando falta histórico', () => {
  const conTodo = juicio(hogar(MESES));
  const conUnMes = juicio(hogar([AHORA]));

  // Con todo lo que pasó: doce meses ahorrando 5,000 son 60,000
  // líquidos, 2.4 meses de colchón, y el gusto se puede programar.
  assert.equal(conTodo.liquido, 60000);
  assert.equal(conTodo.veredicto, 'programado');

  // Con un mes: parece que solo tienen 5,000 y que no hay colchón.
  assert.equal(conUnMes.liquido, 5000);
  assert.equal(conUnMes.veredicto, 'reconsiderar');

  // Y no es un matiz: son 600 puntos de castigo por un colchón que sí
  // existe. Esto es lo que la pantalla NO puede enseñar.
  assert.notEqual(conTodo.veredicto, conUnMes.veredicto);
  assert.equal(conTodo.puntaje - conUnMes.puntaje, 600);
});

test('y el alcance lo dice antes, con el nombre de lo que falta', () => {
  const a = alcanzaParaPatrimonio(hogar([AHORA]), AHORA);
  assert.equal(a.exacto, false);
  assert.deepEqual(a.faltan.map(x => x.nombre), ['Ficohsa']);
});

/* ------------------------------------------------------------
   2. Con el ancla, un mes basta — y es exacto, no aproximado
   ------------------------------------------------------------ */

const ANCLA = { monto: 55000, fecha: '2026-08-01' };

test('con el ancla dentro del mes cargado, un mes da lo mismo que doce', () => {
  const conTodo = juicio(hogar(MESES, ANCLA));
  const conUnMes = juicio(hogar([AHORA], ANCLA));

  // La igualdad es la que autoriza a la pantalla a dar el veredicto.
  // Si algún día el núcleo dejara de partir del ancla, esto se rompe
  // aquí y no en la pantalla de alguien.
  assert.deepEqual(conUnMes, conTodo);
  assert.equal(conUnMes.veredicto, 'programado');
});

test('con el ancla al día, el alcance da permiso', () => {
  const a = alcanzaParaPatrimonio(hogar([AHORA], ANCLA), AHORA);
  assert.equal(a.exacto, true);
  assert.deepEqual(a.faltan, []);
});

test('un ancla vieja no sirve: le faltarían movimientos por sumar', () => {
  // El núcleo suma al ancla lo posterior a su fecha, y de eso solo
  // está cargado el mes en curso. Un ancla de julio dejaría fuera
  // todo julio.
  const vieja = alcanzaParaPatrimonio(hogar([AHORA], { monto: 55000, fecha: '2026-07-20' }), AHORA);
  assert.equal(vieja.exacto, false);

  // El primer día del mes sí cuenta: ahí empieza lo que está cargado.
  const justa = alcanzaParaPatrimonio(hogar([AHORA], { monto: 55000, fecha: '2026-08-01' }), AHORA);
  assert.equal(justa.exacto, true);
});

test('el arranque del mes del hogar manda, no el del calendario', () => {
  // Con arranque el 7, el mes de agosto va del 7 de agosto al 6 de
  // septiembre: un ancla del 3 de agosto queda FUERA y no sirve.
  const D = hogar([AHORA], { monto: 55000, fecha: '2026-08-03' });
  D.inicioMes = 7;
  const a = alcanzaParaPatrimonio(D, AHORA);
  assert.equal(a.desde, '2026-08-07');
  assert.equal(a.exacto, false);
});

test('sin una sola cuenta declarada no se juzga nada', () => {
  // El líquido saldría cero y el diagnóstico entero se apoyaría en una
  // cifra que nadie escribió.
  const D = hogar([AHORA], ANCLA);
  D.cuentas = [];
  const a = alcanzaParaPatrimonio(D, AHORA);
  assert.equal(a.hayCuentas, false);
  assert.equal(a.exacto, false);
});

test('una tarjeta de crédito sin ancla también frena el veredicto', () => {
  // Arrastra deuda por su cuenta, y la deuda cara es el otro castigo
  // del orden por mérito.
  const D = hogar([AHORA], ANCLA);
  D.tarjetas = [{ id: 't1', nombre: 'BAC', tipo: 'credito', diaCorte: 6, saldoInicial: 0,
                  desdeMes: '2026-08', pagaTotal: false, tasaAnual: 54 }];
  assert.equal(alcanzaParaPatrimonio(D, AHORA).exacto, false);
  assert.deepEqual(alcanzaParaPatrimonio(D, AHORA).faltan.map(x => x.nombre), ['BAC']);

  // La de débito no: lo que se gasta con ella sale de la cuenta, y esa
  // ya tiene su ancla.
  D.tarjetas = [{ id: 't2', nombre: 'Débito', tipo: 'debito', cuentaId: 'c1', saldoInicial: 0 }];
  assert.equal(alcanzaParaPatrimonio(D, AHORA).exacto, true);
});
