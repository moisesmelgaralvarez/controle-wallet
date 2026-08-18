/* ============================================================
   Pruebas del núcleo financiero.

   Vienen de `pruebas.html`, la suite que acompañó a la app durante
   meses de uso real. Los cuerpos están copiados tal cual: si una
   prueba afirmaba algo, sigue afirmando exactamente lo mismo.

   Qué cambió y por qué:

   - Corren con `node --test`, así que entran en CI y se ejecutan en
     cada Pull Request, no cuando alguien se acuerda de abrir una
     página en el navegador.
   - Apuntan a `nucleo/`, los módulos ES, en vez de a `window.Asesor`.
   - Se quitaron las pruebas de fusión entre teléfonos. No es una
     pérdida de cobertura: es que `sync.js` deja de existir. Con el
     servidor como única fuente de verdad no hay dos copias que
     fundir, y probar una máquina que ya no está sería teatro.
   ============================================================ */

import { grupo, probar, cerca } from './ayuda.js';
import * as A from '../sitio/app/nucleo/index.js';
import * as I from '../sitio/app/nucleo/importar.js';

/* ============ el hogar de prueba ============ */

/**
 * Ingreso neto 20,000 (una quincena). Gastos 10,000, de los cuales 8,000 van
 * con tarjeta y 2,000 son salud pagada en efectivo. Un financiamiento de 500.
 */
const hogar = () => ({
  version: 3, configurado: true,
  personas: [{ id: 'a', nombre: 'A' }],
  plantillaIngresos: [{ id: 'q1', nombre: 'Quincena', dia: 15, lineas: [
    { personaId: 'a', bruto: 25000, deducciones: [{ concepto: 'ISR', monto: 5000 }] }] }],
  ingresosMes: {},
  gastos: [
    { id: 'g1', concepto: 'Comida', monto: 8000, categoria: 'Alimentación', crecimiento: 0, medioPago: 'tarjeta' },
    { id: 'gs', concepto: 'Pediatría', monto: 2000, categoria: 'Salud', crecimiento: 0, medioPago: 'efectivo' }
  ],
  tarjetas: [{ id: 't1', nombre: 'Tarjeta', diaCorte: 6, pagaCon: 'q1' }],
  financiamientos: [{ id: 'f1', nombre: 'Refri', cuotaMensual: 500, cuotasTotales: 12, cuotasPagadas: 0 }],
  proyectos: [], movimientos: [], retiros: []
});

/* ============ el disponible real ============ */
grupo('Disponible real');

probar('El neto sale de bruto menos retenciones', () => {
  const r = A.resumenMes(hogar(), '2026-08');
  return { ok: r.bruto === 25000 && r.neto === 20000 && r.deducciones === 5000,
           det: `bruto ${r.bruto} · neto ${r.neto}` };
});

probar('Disponible = ingreso − gastos − salud − cuotas', () => {
  const r = A.resumenMes(hogar(), '2026-08');
  return { ok: r.disponible === 20000 - 8000 - 2000 - 500,
           det: `20,000 − 8,000 − 2,000 − 500 = ${r.disponible}` };
});

probar('El pago de la tarjeta NO se resta otra vez', () => {
  // Los 8,000 de comida van con tarjeta. Si la tarjeta se restara aparte,
  // el disponible bajaría a 1,500. Este es el doble conteo que hubo que corregir.
  const r = A.resumenMes(hogar(), '2026-08');
  return { ok: r.disponible === 9500,
           det: `disponible ${r.disponible}; con doble conteo habría dado 1,500` };
});

probar('El fondo de salud se separa de los gastos corrientes', () => {
  const r = A.resumenMes(hogar(), '2026-08');
  return { ok: r.salud === 2000 && r.corriente === 8000 && r.gastos === 10000,
           det: `salud ${r.salud} · corriente ${r.corriente}` };
});

/* ============ ingresos mes a mes ============ */
grupo('Ingresos mes a mes');

probar('Sin confirmar, el mes usa el monto típico y se marca estimado', () => {
  const r = A.resumenMes(hogar(), '2026-08');
  return { ok: r.neto === 20000 && r.confirmado === false && r.pendientes.length === 1,
           det: `estimado en ${r.neto}, 1 pago pendiente` };
});

probar('Al confirmar, manda lo que realmente entró', () => {
  const d = hogar();
  d.ingresosMes['2026-08'] = {
    confirmado: { q1: true },
    lineas: { q1: { a: { personaId: 'a', bruto: 30000, deducciones: [{ concepto: 'ISR', monto: 7000 }] } } }
  };
  const r = A.resumenMes(d, '2026-08');
  return { ok: r.neto === 23000 && r.confirmado === true,
           det: `agosto confirmado en ${r.neto}` };
});

probar('Confirmar un mes no contamina los demás', () => {
  const d = hogar();
  d.ingresosMes['2026-09'] = {
    confirmado: { q1: true },
    lineas: { q1: { a: { personaId: 'a', bruto: 30000, deducciones: [{ concepto: 'ISR', monto: 7000 }] } } }
  };
  const ago = A.resumenMes(d, '2026-08').neto;
  const sep = A.resumenMes(d, '2026-09').neto;
  const oct = A.resumenMes(d, '2026-10').neto;
  return { ok: ago === 20000 && sep === 23000 && oct === 20000,
           det: `ago ${ago} · sep ${sep} · oct ${oct}` };
});

/* ============ ciclo de la tarjeta ============ */
grupo('Ciclo de la tarjeta');

probar('El ciclo va del día siguiente al corte anterior hasta el corte', () => {
  const c = A.cicloDe('2026-08', 6);
  return { ok: c.desde === '2026-07-07' && c.hasta === '2026-08-06',
           det: `${c.desde} → ${c.hasta}` };
});

probar('Un corte 31 se acota al último día del mes corto', () => {
  const c = A.cicloDe('2026-03', 31);
  return { ok: c.hasta === '2026-03-31' && c.desde === '2026-03-01',
           det: `febrero no tiene 31: ${c.desde} → ${c.hasta}` };
});

probar('Avisa cuando el ingreso no alcanza a cubrir el corte', () => {
  const d = hogar();
  d.gastos.find(g => g.id === 'g1').monto = 24000;   // más que el ingreso
  const c = A.cicloTarjeta(d, d.tarjetas[0], '2026-08');
  return { ok: c.alcanza === false && cerca(c.cobertura, -4000),
           det: `cargado ${c.aCubrir}, lo paga ${c.ingresoPago}, faltan ${Math.abs(c.cobertura)}` };
});

probar('Solo cuenta lo que se paga con tarjeta, no la salud en efectivo', () => {
  const c = A.cicloTarjeta(hogar(), hogar().tarjetas[0], '2026-08');
  return { ok: c.aCubrir === 8000,
           det: `8,000 de tarjeta; los 2,000 de salud en efectivo quedan fuera` };
});

probar('Los movimientos reales sustituyen al plan', () => {
  const d = hogar();
  d.movimientos = [
    { id: 'm1', monto: 1500, fecha: '2026-07-20', medioPago: 'tarjeta', tarjetaId: 't1', periodo: '2026-07' },
    { id: 'm2', monto: 900,  fecha: '2026-08-03', medioPago: 'tarjeta', tarjetaId: 't1', periodo: '2026-08' },
    { id: 'm3', monto: 700,  fecha: '2026-08-20', medioPago: 'tarjeta', tarjetaId: 't1', periodo: '2026-08' } // fuera del ciclo
  ];
  const c = A.cicloTarjeta(d, d.tarjetas[0], '2026-08');
  return { ok: c.aCubrir === 2400 && c.usandoPlan === false,
           det: `1,500 + 900 dentro del ciclo; los 700 del 20 de agosto caen en el siguiente` };
});

/* ============ financiamientos ============ */
grupo('Financiamientos');

probar('La cuota pesa mientras queden cuotas', () => {
  const d = hogar();
  d.financiamientos[0].cuotasPagadas = 9;   // quedan 3
  const f = A.proyectar(d, '2026-08', 6).filas;
  return { ok: f[0].cuotas === 500 && f[2].cuotas === 500 && f[3].cuotas === 0,
           det: `pesa los meses 0 a 2 y se libera en el 3` };
});

probar('Al liberarse el financiamiento, sube el disponible', () => {
  const d = hogar();
  d.financiamientos[0].cuotasPagadas = 11;  // queda 1
  const f = A.proyectar(d, '2026-08', 4).filas;
  return { ok: f[1].disponible - f[0].disponible === 500,
           det: `${f[0].disponible} → ${f[1].disponible}` };
});

probar('Un financiamiento liquidado ya no cuenta', () => {
  const d = hogar();
  d.financiamientos[0].cuotasPagadas = 12;
  const r = A.resumenMes(d, '2026-08');
  return { ok: r.cuotas === 0 && r.disponible === 10000, det: `disponible ${r.disponible}` };
});

/* ============ asesor de proyectos ============ */
grupo('Asesor de proyectos');

probar('La salud creciente sube mes a mes en la proyección', () => {
  const d = hogar();
  d.gastos.find(g => g.id === 'gs').crecimiento = 3;
  const f = A.proyectar(d, '2026-08', 13).filas;
  return { ok: cerca(f[12].salud, 2000 * Math.pow(1.03, 12), 0.5) && f[12].salud > f[0].salud,
           det: `mes 0: ${f[0].salud.toFixed(2)} → mes 12: ${f[12].salud.toFixed(2)}` };
});

probar('Un proyecto con rango da dos plazos distintos', () => {
  const d = hogar();
  d.proyectos = [{ id: 'p1', nombre: 'Lavadora', costoMin: 9500, costoMax: 28500, aportes: [], aporteMensual: 0 }];
  const ev = A.evaluarCartera(d, '2026-08')['p1'];
  return { ok: ev.mesesMin < ev.mesesMax,
           det: `mínimo ${ev.mesesMin} · máximo ${ev.mesesMax} (a todo el disponible)` };
});

probar('La cuota sugerida deja el colchón del 20%', () => {
  const d = hogar();
  d.proyectos = [{ id: 'p1', nombre: 'Carro', costoMin: 500000, costoMax: 500000, aportes: [], aporteMensual: 0 }];
  const ev = A.evaluarCartera(d, '2026-08')['p1'];
  return { ok: cerca(ev.cuotaSugerida, 9500 * 0.8) && cerca(ev.carga, 0.8),
           det: `disponible 9,500 → cuota ${ev.cuotaSugerida.toFixed(2)} (${Math.round(ev.carga * 100)}%)` };
});

probar('Dos proyectos no reservan el mismo dinero', () => {
  const d = hogar();
  d.proyectos = [
    { id: 'p1', nombre: 'Uno', costoMin: 500000, costoMax: 500000, aportes: [], aporteMensual: 0 },
    { id: 'p2', nombre: 'Dos', costoMin: 500000, costoMax: 500000, aportes: [], aporteMensual: 0 }
  ];
  const c = A.evaluarCartera(d, '2026-08');
  const suma = c['p1'].cuotaSugerida + c['p2'].cuotaSugerida;
  return { ok: suma <= 9500 * 0.8 + 0.01 && c['p2'].sinMargen === true,
           det: `suman ${suma.toFixed(2)} sobre 9,500; el segundo queda en espera` };
});

probar('Una fecha objetivo imposible se marca como no viable', () => {
  const d = hogar();
  d.proyectos = [{ id: 'p1', nombre: 'Casa', costoMin: 900000, costoMax: 900000, aportes: [], aporteMensual: 0, fechaObjetivo: '2026-12' }];
  const ev = A.evaluarCartera(d, '2026-08')['p1'];
  // `flujo` es la capa de "¿alcanza el dinero?"; `veredicto` ya incorpora el mérito.
  return { ok: ev.flujo === 'inviable' && ev.alertas.some(x => x.nivel === 'critical'),
           det: `pide ${Math.round(ev.cuotaObjetivo)} al mes contra ${Math.round(ev.disponible)} disponibles` };
});

probar('Sin disponible, ningún proyecto es viable', () => {
  const d = hogar();
  d.gastos.find(g => g.id === 'g1').monto = 19000;
  d.proyectos = [{ id: 'p1', nombre: 'Algo', costoMin: 5000, costoMax: 5000, aportes: [], aporteMensual: 0 }];
  const ev = A.evaluarCartera(d, '2026-08')['p1'];
  return { ok: ev.disponible < 0 && ev.flujo === 'inviable',
           det: `disponible ${ev.disponible.toFixed(2)}` };
});

probar('Avisa cuando un financiamiento está por liberarse', () => {
  const d = hogar();
  d.financiamientos[0].cuotasPagadas = 9;
  d.proyectos = [{ id: 'p1', nombre: 'Meta', costoMin: 50000, costoMax: 50000, aportes: [], aporteMensual: 0 }];
  const ev = A.evaluarCartera(d, '2026-08')['p1'];
  return { ok: ev.alertas.some(x => /Refri/.test(x.texto)),
           det: 'la alerta menciona el financiamiento que termina' };
});

probar('Un proyecto ya cubierto se marca como alcanzado', () => {
  const d = hogar();
  d.proyectos = [{ id: 'p1', nombre: 'Listo', costoMin: 1000, costoMax: 1000, aporteMensual: 0,
                   aportes: [{ id: 'a1', monto: 1200 }] }];
  const ev = A.evaluarCartera(d, '2026-08')['p1'];
  return { ok: ev.veredicto === 'logrado' && ev.faltaMax === 0, det: 'sobran 200' };
});

/* ============ retiros de efectivo ============ */
grupo('Retiros de efectivo');

probar('Un retiro NO cambia el disponible real', () => {
  // Es un traslado de la cuenta a la cartera, no un gasto. Contarlo como gasto
  // lo restaría dos veces: al sacarlo y al gastarlo.
  const sin = A.resumenMes(hogar(), '2026-08').disponible;
  const d = hogar();
  d.retiros = [{ id: 'r1', monto: 5000, fecha: '2026-08-10', periodo: '2026-08', personaId: 'a' }];
  const con = A.resumenMes(d, '2026-08').disponible;
  return { ok: sin === con && con === 9500, det: `sin retiro ${sin} · con retiro ${con}` };
});

probar('Un retiro tampoco entra al ciclo de la tarjeta', () => {
  const d = hogar();
  d.retiros = [{ id: 'r1', monto: 5000, fecha: '2026-07-20', periodo: '2026-07', personaId: 'a' }];
  const c = A.cicloTarjeta(d, d.tarjetas[0], '2026-08');
  return { ok: c.aCubrir === 8000, det: 'el corte sigue en 8,000, el retiro no lo toca' };
});

probar('El saldo de efectivo es lo retirado menos lo gastado en efectivo', () => {
  const d = hogar();
  d.retiros = [{ id: 'r1', monto: 5000, fecha: '2026-08-02', periodo: '2026-08', personaId: 'a' }];
  d.movimientos = [
    { id: 'm1', monto: 1200, fecha: '2026-08-05', periodo: '2026-08', medioPago: 'efectivo' },
    { id: 'm2', monto: 900,  fecha: '2026-08-07', periodo: '2026-08', medioPago: 'tarjeta' }
  ];
  const e = A.efectivo(d, '2026-08');
  return { ok: e.saldo === 3800 && e.gastadoMes === 1200,
           det: `5,000 − 1,200 = ${e.saldo}; los 900 con tarjeta no cuentan` };
});

probar('El efectivo no se reinicia cada mes', () => {
  const d = hogar();
  d.retiros = [{ id: 'r1', monto: 5000, fecha: '2026-07-02', periodo: '2026-07', personaId: 'a' }];
  d.movimientos = [{ id: 'm1', monto: 1000, fecha: '2026-08-05', periodo: '2026-08', medioPago: 'efectivo' }];
  const e = A.efectivo(d, '2026-08');
  return { ok: e.saldo === 4000 && e.retiradoMes === 0,
           det: `sobra de julio y se gasta en agosto: saldo ${e.saldo}` };
});

probar('Gastar más efectivo del retirado se marca como descuadre', () => {
  const d = hogar();
  d.retiros = [{ id: 'r1', monto: 500, fecha: '2026-08-02', periodo: '2026-08', personaId: 'a' }];
  d.movimientos = [{ id: 'm1', monto: 1200, fecha: '2026-08-05', periodo: '2026-08', medioPago: 'efectivo' }];
  const e = A.efectivo(d, '2026-08');
  return { ok: e.descuadre === true && e.saldo === -700,
           det: `saldo ${e.saldo}: falta registrar un retiro` };
});

probar('Sin retiros ni gastos en efectivo, el bloque no aparece', () => {
  const e = A.efectivo(hogar(), '2026-08');
  return { ok: e.hayDatos === false, det: 'no se muestra hasta que haya algo que mostrar' };
});

/* ============ el mes del hogar ============ */
grupo('El mes del hogar (ciclo 7 → 6)');

probar('Con inicio 1 se comporta como el mes de calendario', () => {
  return { ok: A.periodoDe('2026-08-03', 1) === '2026-08'
             && A.periodoDe('2026-08-31', 1) === '2026-08', det: 'sin cambios' };
});

probar('Con inicio 7, el 3 de agosto todavía es JULIO', () => {
  // Es el caso real: ese gasto entra al corte que cierra el 6 de agosto.
  return { ok: A.periodoDe('2026-08-03', 7) === '2026-07',
           det: '3 ago → ' + A.periodoDe('2026-08-03', 7) };
});

probar('Con inicio 7, el 7 de agosto ya es AGOSTO', () => {
  return { ok: A.periodoDe('2026-08-07', 7) === '2026-08'
             && A.periodoDe('2026-09-06', 7) === '2026-08',
           det: 'agosto va del 7 ago al 6 sep' };
});

probar('El rango del mes se calcula bien', () => {
  const r = A.rangoPeriodo('2026-08', 7);
  return { ok: r.desde === '2026-08-07' && r.hasta === '2026-09-06',
           det: `${r.desde} → ${r.hasta}` };
});

probar('Febrero corto no rompe el ciclo', () => {
  const r = A.rangoPeriodo('2026-02', 7);
  return { ok: r.desde === '2026-02-07' && r.hasta === '2026-03-06',
           det: `${r.desde} → ${r.hasta}` };
});

probar('Los días del ciclo se cuentan completos', () => {
  return { ok: A.diasPeriodo('2026-08', 7) === 31 && A.diasPeriodo('2026-02', 7) === 28,
           det: `agosto ${A.diasPeriodo('2026-08', 7)} · febrero ${A.diasPeriodo('2026-02', 7)}` };
});

probar('El pulso mide el avance del CICLO, no del calendario', () => {
  // El 10 de agosto, con ciclo 7→6, van 4 días corridos de 31, no 10 de 31.
  const d = hogar();
  d.inicioMes = 7;
  const p = A.pulso(d, '2026-08', '2026-08-10');
  return { ok: p.enCurso === true && p.dia === 4 && p.diasMes === 31,
           det: `día ${p.dia} de ${p.diasMes}` };
});

probar('El 3 de agosto el ciclo en curso es el de julio', () => {
  const d = hogar();
  d.inicioMes = 7;
  const ago = A.pulso(d, '2026-08', '2026-08-03');
  const jul = A.pulso(d, '2026-07', '2026-08-03');
  return { ok: ago.enCurso === false && jul.enCurso === true,
           det: 'el 3 de agosto todavía se está viviendo julio' };
});

probar('Un gasto del 3 de agosto no cuenta en el mes de agosto', () => {
  // Sin esto, el gasto del corte de julio inflaba el presupuesto de agosto.
  const d = hogar();
  d.inicioMes = 7;
  d.movimientos = [{ id: 'm1', gastoId: 'g1', monto: 5000, fecha: '2026-08-03',
                     periodo: A.periodoDe('2026-08-03', 7) }];
  const enAgosto = A.porCategoria(d, '2026-08').total;
  const enJulio  = A.porCategoria(d, '2026-07').total;
  return { ok: enAgosto === 0 && enJulio === 5000,
           det: `agosto ${enAgosto} · julio ${enJulio}` };
});

probar('El ciclo de la tarjeta se alinea con el mes del hogar', () => {
  // Con mes que arranca el 7 y corte el 6, "julio" del hogar va del 7 de julio
  // al 6 de agosto: lo cierra el corte de AGOSTO. Sin esto se desfasaba un mes
  // y el informe enseñaba el ciclo equivocado.
  const d = hogar();
  d.inicioMes = 7;
  const c = A.cicloTarjeta(d, d.tarjetas[0], '2026-07');
  return { ok: c.desde === '2026-07-07' && c.hasta === '2026-08-06',
           det: `${c.desde} → ${c.hasta}` };
});

probar('Con mes de calendario el ciclo no cambia', () => {
  const c = A.cicloTarjeta(hogar(), hogar().tarjetas[0], '2026-08');
  return { ok: c.desde === '2026-07-07' && c.hasta === '2026-08-06',
           det: `${c.desde} → ${c.hasta}` };
});

/* ============ saldo de las cuentas ============ */
grupo('Saldo en el banco');

/** Hogar con cuenta propia para cada quien y una tarjeta de débito. */
const conCuentas = () => {
  const d = hogar();
  d.cuentas = [{ id: 'cf', nombre: 'Ficohsa Moisés', saldoInicial: 10000, desdeMes: '2026-08' }];
  d.personas = [{ id: 'a', nombre: 'A', cuentaId: 'cf' }];
  d.tarjetas = [{ id: 't1', nombre: 'BAC', diaCorte: 6, pagaCon: 'q1', tipo: 'credito' },
                { id: 'td', nombre: 'Débito Ficohsa', tipo: 'debito', cuentaId: 'cf' }];
  d.pagosTarjeta = [];
  return d;
};
const saldo = d => A.saldoCuenta(d, d.cuentas[0], '2026-08').saldo;

probar('Sin nada confirmado, el saldo es el que declararon', () => {
  return { ok: saldo(conCuentas()) === 10000, det: 'arranca en 10,000' };
});

probar('Un ingreso confirmado suma al saldo', () => {
  const d = conCuentas();
  d.ingresosMes['2026-08'] = { confirmado: { q1: true }, lineas: { q1: { a: {
    personaId: 'a', bruto: 25000, deducciones: [{ concepto: 'ISR', monto: 5000 }] } } } };
  return { ok: saldo(d) === 30000, det: '10,000 + 20,000 neto = ' + saldo(d) };
});

probar('Lo estimado NO entra: no está en el banco', () => {
  // El pago existe en la plantilla con su monto típico, pero nadie lo confirmó.
  const d = conCuentas();
  return { ok: saldo(d) === 10000, det: 'sigue en 10,000 hasta que lo confirmen' };
});

probar('Comprar con tarjeta de CRÉDITO no toca la cuenta', () => {
  // Este es el doble conteo clásico: el dinero sigue en el banco hasta el pago.
  const d = conCuentas();
  d.movimientos = [{ id: 'm1', gastoId: 'g1', monto: 3000, medioPago: 'tarjeta',
                     tarjetaId: 't1', fecha: '2026-08-05', periodo: '2026-08' }];
  return { ok: saldo(d) === 10000, det: 'el consumo no baja el saldo' };
});

probar('Pagar la tarjeta sí baja el saldo', () => {
  const d = conCuentas();
  d.pagosTarjeta = [{ id: 'p1', tarjetaId: 't1', cuentaId: 'cf', monto: 3000,
                      fecha: '2026-08-10', periodo: '2026-08' }];
  return { ok: saldo(d) === 7000, det: '10,000 − 3,000 = ' + saldo(d) };
});

probar('Comprar con DÉBITO baja el saldo al instante', () => {
  const d = conCuentas();
  d.movimientos = [{ id: 'm1', gastoId: 'g1', monto: 1200, medioPago: 'tarjeta',
                     tarjetaId: 'td', fecha: '2026-08-05', periodo: '2026-08' }];
  return { ok: saldo(d) === 8800, det: '10,000 − 1,200 = ' + saldo(d) };
});

probar('El efectivo se descuenta al sacarlo, no al gastarlo', () => {
  // Si restara las dos veces, el saldo bajaría 3,500 en vez de 2,000.
  const d = conCuentas();
  d.retiros = [{ id: 'r1', monto: 2000, cuentaId: 'cf', fecha: '2026-08-02', periodo: '2026-08' }];
  d.movimientos = [{ id: 'm1', gastoId: 'g1', monto: 1500, medioPago: 'efectivo',
                     fecha: '2026-08-06', periodo: '2026-08' }];
  return { ok: saldo(d) === 8000, det: 'solo resta el retiro: ' + saldo(d) };
});

probar('El ingreso de otra persona no entra en esta cuenta', () => {
  const d = conCuentas();
  d.personas.push({ id: 'b', nombre: 'B', cuentaId: 'otra' });
  d.ingresosMes['2026-08'] = { confirmado: { q1: true }, lineas: { q1: {
    b: { personaId: 'b', bruto: 9000, deducciones: [] } } } };
  return { ok: saldo(d) === 10000, det: 'cada quien a la suya' };
});

probar('Lo anterior al mes de arranque no se vuelve a contar', () => {
  // Ya está dentro del saldo inicial; contarlo otra vez lo duplicaría.
  const d = conCuentas();
  d.retiros = [{ id: 'r1', monto: 5000, cuentaId: 'cf', fecha: '2026-07-20', periodo: '2026-07' }];
  return { ok: saldo(d) === 10000, det: 'julio queda fuera' };
});

probar('El saldo puede quedar en rojo y se avisa', () => {
  const d = conCuentas();
  d.pagosTarjeta = [{ id: 'p1', tarjetaId: 't1', cuentaId: 'cf', monto: 12000,
                      fecha: '2026-08-10', periodo: '2026-08' }];
  const r = A.saldosCuentas(d, '2026-08');
  return { ok: r.total === -2000 && r.enRojo.length === 1, det: 'saldo ' + r.total };
});

probar('El pago de la tarjeta descuenta de lo que falta por saldar', () => {
  const d = conCuentas();
  d.movimientos = [{ id: 'm1', gastoId: 'g1', monto: 5000, medioPago: 'tarjeta',
                     tarjetaId: 't1', fecha: '2026-08-05', periodo: '2026-08' }];
  d.pagosTarjeta = [{ id: 'p1', tarjetaId: 't1', cuentaId: 'cf', monto: 2000,
                      fecha: '2026-08-10', periodo: '2026-08' }];
  const p = A.pagoPendiente(d, d.tarjetas[0], '2026-08');
  return { ok: p.pagado === 2000 && cerca(p.pendiente, 3000) && p.saldado === false,
           det: `pagado ${p.pagado}, faltan ${p.pendiente}` };
});

probar('Una tarjeta de débito no tiene corte que pagar', () => {
  const d = conCuentas();
  return { ok: A.pagoPendiente(d, d.tarjetas[1], '2026-08') === null,
           det: 'no aplica al débito' };
});

probar('El saldo del banco no cambia el disponible del mes', () => {
  // Son dos preguntas distintas: cuánto hay guardado y cuánto sobra este mes.
  const sin = A.resumenMes(hogar(), '2026-08').disponible;
  const con = A.resumenMes(conCuentas(), '2026-08').disponible;
  return { ok: sin === con, det: `${sin} en ambos casos` };
});

/* ============ capital y diagnóstico ============ */
grupo('Capital y diagnóstico');

const conDeuda = () => {
  const d = conCuentas();
  d.tarjetas[0] = { id: 't1', nombre: 'BAC', diaCorte: 6, diaPago: 27, pagaCon: 'q1', tipo: 'credito',
                    saldoInicial: 40000, desdeMes: '2026-08', tasaAnual: 55, pagaTotal: false };
  return d;
};

probar('El capital es lo que hay menos lo que se debe', () => {
  const d = conDeuda();
  // 10,000 en cuenta − 40,000 de tarjeta − 6,000 de financiamiento (500 × 12)
  const p = A.patrimonio(d, '2026-08');
  return { ok: p.activos === 10000 && p.enTarjetas === 40000 && p.neto === -36000,
           det: `activos ${p.activos} − pasivos ${p.pasivos} = ${p.neto}` };
});

probar('Pagar la tarjeta baja la deuda, no solo el saldo', () => {
  const d = conDeuda();
  d.pagosTarjeta = [{ id: 'p1', tarjetaId: 't1', cuentaId: 'cf', monto: 10000,
                      fecha: '2026-08-10', periodo: '2026-08' }];
  const p = A.patrimonio(d, '2026-08');
  // sale 10,000 de la cuenta y baja 10,000 la deuda: el capital NO cambia
  return { ok: p.enTarjetas === 30000 && p.enBanco === 0 && p.neto === -36000,
           det: 'pagar no crea ni destruye capital, solo lo mueve' };
});

probar('Comprar con la tarjeta sí destruye capital', () => {
  const d = conDeuda();
  d.movimientos = [{ id: 'm1', gastoId: 'g1', monto: 3000, medioPago: 'tarjeta',
                     tarjetaId: 't1', fecha: '2026-08-05', periodo: '2026-08' }];
  const p = A.patrimonio(d, '2026-08');
  return { ok: p.enTarjetas === 43000 && p.neto === -39000,
           det: 'la deuda sube 3,000 y el capital baja igual' };
});

probar('La deuda nunca baja de cero', () => {
  const d = conDeuda();
  d.pagosTarjeta = [{ id: 'p1', tarjetaId: 't1', cuentaId: 'cf', monto: 99000,
                      fecha: '2026-08-10', periodo: '2026-08' }];
  return { ok: A.deudaTarjeta(d, d.tarjetas[0], '2026-08').deuda === 0,
           det: 'pagar de más no genera deuda negativa' };
});

probar('El interés mensual sale del saldo y la tasa', () => {
  // 40,000 al 55% anual son 1,833.33 al mes solo de intereses.
  const t = A.deudaTarjeta(conDeuda(), conDeuda().tarjetas[0], '2026-08');
  return { ok: cerca(t.interesMensual, 40000 * 0.55 / 12) && cerca(t.interesAnual, 22000),
           det: `${t.interesMensual.toFixed(2)} al mes · ${t.interesAnual.toFixed(2)} al año` };
});

probar('Una tarjeta de débito no genera deuda', () => {
  return { ok: A.deudaTarjeta(conDeuda(), conDeuda().tarjetas[1], '2026-08') === null,
           det: 'el débito no se debe: ya salió' };
});

probar('El colchón se mide en meses de gasto', () => {
  // 10,000 líquidos contra 10,500 de gasto + cuota: menos de un mes.
  const s = A.saludFinanciera(conCuentas(), '2026-08');
  return { ok: s.mesesColchon < 1 && s.pasos[0].clave === 'colchon',
           det: `${s.mesesColchon.toFixed(2)} meses · primero: ${s.pasos[0].clave}` };
});

probar('Con deuda cara, saldarla va antes que cualquier proyecto', () => {
  const d = conDeuda();
  d.cuentas[0].saldoInicial = 60000;   // colchón resuelto
  const s = A.saludFinanciera(d, '2026-08');
  return { ok: s.pasos[0].clave === 'deuda',
           det: 'el primer paso es la deuda, no las metas' };
});

probar('Sin deuda y con colchón, toca ir por las metas', () => {
  const d = conCuentas();
  d.cuentas[0].saldoInicial = 60000;
  const s = A.saludFinanciera(d, '2026-08');
  return { ok: s.pasos[0].clave === 'metas' && s.interesMensual === 0,
           det: 'base cubierta' };
});

probar('El interés se descuenta del disponible que parece libre', () => {
  const d = conDeuda();
  const s = A.saludFinanciera(d, '2026-08');
  return { ok: cerca(s.disponibleReal, s.disponibleDeclarado - s.interesMensual)
             && s.disponibleReal < s.disponibleDeclarado,
           det: `${s.disponibleDeclarado.toFixed(0)} declarado → ${s.disponibleReal.toFixed(0)} real` };
});

probar('Sin cuentas ni deudas no se inventa un capital', () => {
  const d = hogar();
  d.financiamientos = [];
  return { ok: A.patrimonio(d, '2026-08').hayDatos === false,
           det: 'sin nada que declarar, no enseña cifra' };
});

probar('Un financiamiento solo ya cuenta como capital negativo', () => {
  const p = A.patrimonio(hogar(), '2026-08');
  return { ok: p.hayDatos === true && p.enFinanciamientos === 6000 && p.neto === -6000,
           det: 'deber 6,000 sin tener nada es capital de −6,000' };
});

/* ============ pagar el total no cuesta ============ */
grupo('Período de gracia');

const alDia = () => {
  const d = conDeuda();
  d.tarjetas[0].pagaTotal = true;   // saldan todo antes del 27, siempre
  return d;
};

probar('Pagar el total cada mes NO genera intereses', () => {
  // Aunque el contrato diga 55%: si no se revuelve, no se cobra.
  const t = A.deudaTarjeta(alDia(), alDia().tarjetas[0], '2026-08');
  return { ok: t.deuda === 40000 && t.revolvente === 0 && t.interesMensual === 0,
           det: 'debe 40,000 y paga 0 de interés' };
});

probar('Solo cuesta lo que se deja revolver', () => {
  const t = A.deudaTarjeta(conDeuda(), conDeuda().tarjetas[0], '2026-08');
  return { ok: t.revolvente === 40000 && cerca(t.interesMensual, 40000 * 0.55 / 12),
           det: `revuelve ${t.revolvente}` };
});

probar('Al que paga al día no se le dice que mate la deuda', () => {
  const s = A.saludFinanciera(alDia(), '2026-08');
  return { ok: s.interesMensual === 0 && !s.pasos.some(p => p.clave === 'deuda')
             && s.pasos[0].clave === 'racha',
           det: 'primero: ' + s.pasos.map(p => p.clave).join(' → ') };
});

probar('Al que revuelve sí, y con el número en la mano', () => {
  const s = A.saludFinanciera(conDeuda(), '2026-08');
  return { ok: s.pasos.some(p => p.clave === 'deuda') && s.interesMensual > 0,
           det: 'pasos: ' + s.pasos.map(p => p.clave).join(' → ') };
});

probar('El saldo por pagar sigue restando del capital', () => {
  // Aunque no cueste intereses, ese dinero se debe y va a salir.
  const p = A.patrimonio(alDia(), '2026-08');
  return { ok: p.enTarjetas === 40000 && p.neto === -36000,
           det: 'deber sin interés sigue siendo deber' };
});

probar('Los días de gracia salen del corte y la fecha límite', () => {
  // Corte 6, límite 27: 21 días tras el corte. Comprar justo después del
  // corte estira hasta 51; justo antes, solo 21.
  const t = A.deudaTarjeta(alDia(), alDia().tarjetas[0], '2026-08');
  return { ok: t.graciaMinima === 21 && t.graciaMaxima === 51,
           det: `de ${t.graciaMinima} a ${t.graciaMaxima} días` };
});

probar('Sin fecha límite declarada no se inventan días de gracia', () => {
  const d = alDia();
  delete d.tarjetas[0].diaPago;
  const t = A.deudaTarjeta(d, d.tarjetas[0], '2026-08');
  return { ok: t.graciaMaxima === 0, det: 'no supone lo que no le dijeron' };
});

/* ============ cierre de mes ============ */
grupo('Cierre de mes');

const conCierre = () => {
  const d = hogar();
  d.movimientos = [{ id:'m1', gastoId:'g1', monto:9000, fecha:'2026-07-10', periodo:'2026-07' }];
  d.presupuestoMes = { '2026-07': { montos: { g1: 8000, gs: 2000 }, cerrado: false, notas: {} } };
  return d;
};

probar('Un mes congelado usa SU plan, no el de hoy', () => {
  // El plan vigente dice 8,000 de comida; si mañana se baja a 5,000, julio
  // no puede cambiar. Aquí se congeló en 8,000 y ahí se queda.
  const d = conCierre();
  d.gastos[0].monto = 5000;             // se recorta el plan hoy
  const r = A.resumenMes(d, '2026-07');
  return { ok: r.gastos === 10000, det: `julio sigue en ${r.gastos}, no en 7,000` };
});

probar('El mes sin congelar sí sigue al plan vigente', () => {
  const d = conCierre();
  d.gastos[0].monto = 5000;
  const r = A.resumenMes(d, '2026-08');   // agosto no está congelado
  return { ok: r.gastos === 7000, det: `agosto refleja el recorte: ${r.gastos}` };
});

probar('Un rubro creado después no aparece en un mes ya congelado', () => {
  const d = conCierre();
  d.gastos.push({ id:'nuevo', concepto:'Gimnasio', monto:900, categoria:'Salud', medioPago:'tarjeta' });
  const r = A.resumenMes(d, '2026-07');
  return { ok: r.gastos === 10000, det: 'julio ignora lo que no existía entonces' };
});

probar('El cierre compara plan contra realidad rubro por rubro', () => {
  const c = A.cierreDeMes(conCierre(), '2026-07');
  const comida = c.filas.find(f => f.concepto === 'Comida');
  return { ok: comida.plan === 8000 && comida.real === 9000 && comida.excedido === true
             && cerca(comida.diferencia, 1000),
           det: `plan 8,000 · real 9,000 · se pasaron ${comida.diferencia}` };
});

probar('Un rubro se puede pasar aunque el total quede dentro', () => {
  // 9,000 de 10,000 presupuestados: el total va bien. Pero comida se pasó
  // 1,000. Son dos preguntas distintas y las dos importan.
  const c = A.cierreDeMes(conCierre(), '2026-07');
  return { ok: c.dentro === true && c.excedidos.length === 1 && c.sinJustificar.length === 1,
           det: `total dentro (${c.gastado} de ${c.plan}) pero 1 rubro excedido` };
});

probar('Con la nota puesta, ya no queda pendiente de justificar', () => {
  const d = conCierre();
  d.presupuestoMes['2026-07'].notas = { g1: 'Compra grande de despensa' };
  const c = A.cierreDeMes(d, '2026-07');
  return { ok: c.excedidos.length === 1 && c.sinJustificar.length === 0,
           det: 'sigue excedido pero ya está explicado' };
});

probar('Un mes cerrado se distingue de uno solo congelado', () => {
  const d = conCierre();
  return { ok: A.mesCongelado(d, '2026-07') && !A.mesCerrado(d, '2026-07'),
           det: 'congelado sí, cerrado todavía no' };
});

probar('La foto del plan toma todos los rubros vigentes', () => {
  const f = A.fotoDelPlan(hogar());
  return { ok: f.g1 === 8000 && f.gs === 2000,
           det: Object.keys(f).length + ' rubros retratados' };
});

probar('El gasto sin clasificar aparece en el cierre', () => {
  const d = conCierre();
  d.movimientos.push({ id:'m2', gastoId:'otros', monto:400, fecha:'2026-07-12', periodo:'2026-07' });
  const c = A.cierreDeMes(d, '2026-07');
  const otros = c.filas.find(f => f.gastoId === 'otros');
  return { ok: Boolean(otros) && otros.real === 400 && c.gastado === 9400,
           det: 'no se pierde nada al cerrar' };
});

/* ============ pulso del mes ============ */
grupo('Pulso del mes');

probar('Gastar el 20% el día 3 marca que van adelantados', () => {
  // El plan son 10,000. Llevan 2,000 el día 3 de 31: el mes va por el 10%
  // y el gasto por el 20%. Ese desfase es toda la señal.
  const d = hogar();
  d.movimientos = [{ id: 'm1', monto: 2000, fecha: '2026-08-03', periodo: '2026-08', medioPago: 'efectivo' }];
  const p = A.pulso(d, '2026-08', '2026-08-03');
  return { ok: p.adelantado === true && cerca(p.avanceMes, 3 / 31) && cerca(p.avanceGasto, 0.2),
           det: `mes ${Math.round(p.avanceMes * 100)}% · gasto ${Math.round(p.avanceGasto * 100)}%` };
});

probar('El mismo gasto el día 25 ya no es alarma', () => {
  const d = hogar();
  d.movimientos = [{ id: 'm1', monto: 2000, fecha: '2026-08-25', periodo: '2026-08', medioPago: 'efectivo' }];
  const p = A.pulso(d, '2026-08', '2026-08-25');
  return { ok: p.adelantado === false, det: 'el calendario ya alcanzó al gasto' };
});

probar('La proyección de cierre sale del ritmo diario', () => {
  // 2,000 en 4 días son 500 al día; a 31 días, 15,500 contra un plan de 10,000.
  const d = hogar();
  d.movimientos = [{ id: 'm1', monto: 2000, fecha: '2026-08-04', periodo: '2026-08', medioPago: 'efectivo' }];
  const p = A.pulso(d, '2026-08', '2026-08-04');
  return { ok: cerca(p.ritmoDiario, 500) && cerca(p.proyeccion, 15500) && cerca(p.desvio, 5500),
           det: `500/día → cierra en ${p.proyeccion.toFixed(0)}` };
});

probar('Lo que queda se reparte entre los días que faltan', () => {
  // Quedan 8,000 de plan y 27 días de mes: 296.30 al día.
  const d = hogar();
  d.movimientos = [{ id: 'm1', monto: 2000, fecha: '2026-08-04', periodo: '2026-08', medioPago: 'efectivo' }];
  const p = A.pulso(d, '2026-08', '2026-08-04');
  return { ok: p.diasRestantes === 27 && cerca(p.porDia, 8000 / 27),
           det: `${p.diasRestantes} días · ${p.porDia.toFixed(2)} al día` };
});

probar('Avisa cuándo entra el próximo pago y cuándo corta la tarjeta', () => {
  // Quincena el 15 y corte el 6: desde el día 4, faltan 11 y 2 días.
  const p = A.pulso(hogar(), '2026-08', '2026-08-04');
  return { ok: p.proximoIngreso.enDias === 11 && p.proximoCorte.enDias === 2,
           det: `pago en ${p.proximoIngreso.enDias} · corte en ${p.proximoCorte.enDias}` };
});

probar('Un corte ya pasado se cuenta hasta el mes siguiente', () => {
  // Día 10 con corte el 6: el próximo es el 6 de septiembre, 27 días después.
  const p = A.pulso(hogar(), '2026-08', '2026-08-10');
  return { ok: p.proximoCorte.enDias === 27, det: `${p.proximoCorte.enDias} días` };
});

probar('En un mes que no es el actual no hay ritmo que medir', () => {
  const p = A.pulso(hogar(), '2026-06', '2026-08-04');
  return { ok: p.enCurso === false && p.proximoIngreso === null,
           det: 'un mes cerrado tiene resultado, no ritmo' };
});

/* ============ en qué se fue ============ */
grupo('Reparto por categoría');

probar('Cada movimiento hereda la categoría de su rubro', () => {
  // g1 es Alimentación y gs es Salud: el movimiento no lleva categoría propia.
  const d = hogar();
  d.movimientos = [
    { id: 'm1', gastoId: 'g1', monto: 3000, fecha: '2026-08-02', periodo: '2026-08' },
    { id: 'm2', gastoId: 'gs', monto: 1000, fecha: '2026-08-03', periodo: '2026-08' }];
  const c = A.porCategoria(d, '2026-08');
  const alim = c.filas.find(f => f.categoria === 'Alimentación');
  return { ok: c.total === 4000 && alim.monto === 3000 && cerca(alim.pct, 0.75),
           det: `Alimentación ${alim.monto} (${Math.round(alim.pct * 100)}%)` };
});

probar('Varios gastos de la misma categoría se suman', () => {
  const d = hogar();
  d.gastos.push({ id: 'g2', concepto: 'Cena', monto: 0, categoria: 'Alimentación', medioPago: 'tarjeta' });
  d.movimientos = [
    { id: 'm1', gastoId: 'g1', monto: 3000, fecha: '2026-08-02', periodo: '2026-08' },
    { id: 'm2', gastoId: 'g2', monto: 500,  fecha: '2026-08-03', periodo: '2026-08' }];
  const c = A.porCategoria(d, '2026-08');
  return { ok: c.filas.length === 1 && c.filas[0].monto === 3500 && c.filas[0].movimientos === 2,
           det: 'una sola fila de 3,500 con 2 registros' };
});

probar('Lo que quedó sin rubro cae en Otros', () => {
  // Es lo que pasa con un gasto cuyo rubro se borró: no se pierde, se reagrupa.
  const d = hogar();
  d.movimientos = [
    { id: 'm1', gastoId: 'otros',    monto: 800, fecha: '2026-08-02', periodo: '2026-08' },
    { id: 'm2', gastoId: 'borrado',  monto: 200, fecha: '2026-08-03', periodo: '2026-08' }];
  const c = A.porCategoria(d, '2026-08');
  return { ok: c.filas.length === 1 && c.filas[0].categoria === 'Otros' && c.filas[0].monto === 1000,
           det: 'los 1,000 siguen contando' };
});

probar('Las categorías salen de mayor a menor', () => {
  const d = hogar();
  d.movimientos = [
    { id: 'm1', gastoId: 'gs', monto: 5000, fecha: '2026-08-02', periodo: '2026-08' },
    { id: 'm2', gastoId: 'g1', monto: 900,  fecha: '2026-08-03', periodo: '2026-08' }];
  const c = A.porCategoria(d, '2026-08');
  return { ok: c.filas[0].categoria === 'Salud' && c.mayor.categoria === 'Salud',
           det: 'manda ' + c.mayor.categoria };
});

probar('Un mes sin movimientos no reparte nada', () => {
  return { ok: A.porCategoria(hogar(), '2026-08').total === 0, det: 'no hay nada que repartir' };
});

probar('El reparto no mezcla meses', () => {
  const d = hogar();
  d.movimientos = [
    { id: 'm1', gastoId: 'g1', monto: 3000, fecha: '2026-07-02', periodo: '2026-07' },
    { id: 'm2', gastoId: 'g1', monto: 500,  fecha: '2026-08-03', periodo: '2026-08' }];
  return { ok: A.porCategoria(d, '2026-08').total === 500,
           det: 'agosto solo cuenta lo de agosto' };
});

/* ============ historia ============ */
grupo('Historia');

probar('Solo aparecen los meses con algo registrado', () => {
  // Sin confirmar ingresos y sin movimientos, no hay nada que contar.
  const d = hogar();
  d.movimientos = [{ id: 'm1', monto: 500, fecha: '2026-07-10', periodo: '2026-07', medioPago: 'efectivo' }];
  const h = A.historia(d, '2026-08', 6);
  return { ok: h.meses === 1 && h.filas[0].per === '2026-07',
           det: 'un solo mes con datos: ' + h.filas.map(f => f.per).join(', ') };
});

probar('Lo que queda es el ingreso menos lo realmente gastado', () => {
  const d = hogar();
  d.ingresosMes['2026-07'] = { confirmado: { q1: true }, lineas: { q1: { a: {
    personaId: 'a', bruto: 25000, deducciones: [{ concepto: 'ISR', monto: 5000 }] } } } };
  d.movimientos = [{ id: 'm1', monto: 12000, fecha: '2026-07-10', periodo: '2026-07', medioPago: 'efectivo' }];
  const f = A.historia(d, '2026-08', 6).filas[0];
  return { ok: f.ingreso === 20000 && f.gastado === 12000 && f.quedo === 8000,
           det: `20,000 − 12,000 = ${f.quedo}` };
});

/** Meses confirmados con el mismo ingreso neto de 20,000. */
const conMeses = (d, pers) => {
  pers.forEach(p => {
    d.ingresosMes[p] = { confirmado: { q1: true }, lineas: { q1: { a: {
      personaId: 'a', bruto: 25000, deducciones: [{ concepto: 'ISR', monto: 5000 }] } } } };
  });
  return d;
};

probar('El promedio solo cuenta los meses en que hubo ingreso', () => {
  // Junio y julio confirmados; el de junio se gastó entero y el de julio no.
  const d = conMeses(hogar(), ['2026-06', '2026-07']);
  d.movimientos = [
    { id: 'm1', monto: 20000, fecha: '2026-06-10', periodo: '2026-06', medioPago: 'efectivo' },
    { id: 'm2', monto: 12000, fecha: '2026-07-10', periodo: '2026-07', medioPago: 'efectivo' }];
  const h = A.historia(d, '2026-08', 6);
  return { ok: h.mesesCerrados === 2 && cerca(h.promedio, (0 + 8000) / 2),
           det: `${h.mesesCerrados} meses cerrados · promedio ${h.promedio.toFixed(2)}` };
});

probar('El mes en curso no entra en el promedio', () => {
  // Agosto lleva 4 días: compararlo con meses enteros inflaría la cifra.
  const d = conMeses(hogar(), ['2026-07', '2026-08']);
  d.movimientos = [
    { id: 'm1', monto: 12000, fecha: '2026-07-10', periodo: '2026-07', medioPago: 'efectivo' },
    { id: 'm2', monto: 300,   fecha: '2026-08-02', periodo: '2026-08', medioPago: 'efectivo' }];
  const h = A.historia(d, '2026-08', 6);
  return { ok: h.meses === 2 && h.mesesCerrados === 1 && cerca(h.promedio, 8000),
           det: `sale en la lista (${h.meses}) pero no en el promedio (${h.promedio.toFixed(0)})` };
});

probar('El mes en curso tampoco puede ser el "mejor mes"', () => {
  // Con 4 días de gasto siempre ganaría, y sería un récord falso.
  const d = conMeses(hogar(), ['2026-06', '2026-07', '2026-08']);
  d.movimientos = [
    { id: 'm1', monto: 5000,  fecha: '2026-06-10', periodo: '2026-06', medioPago: 'efectivo' },
    { id: 'm2', monto: 18000, fecha: '2026-07-10', periodo: '2026-07', medioPago: 'efectivo' },
    { id: 'm3', monto: 100,   fecha: '2026-08-02', periodo: '2026-08', medioPago: 'efectivo' }];
  const h = A.historia(d, '2026-08', 6);
  return { ok: h.mejor.per === '2026-06' && h.peor.per === '2026-07',
           det: `mejor ${h.mejor.per} · peor ${h.peor.per}; agosto queda fuera` };
});

probar('Sin meses cerrados no se inventa un promedio', () => {
  const d = conMeses(hogar(), ['2026-08']);
  d.movimientos = [{ id: 'm1', monto: 300, fecha: '2026-08-02', periodo: '2026-08', medioPago: 'efectivo' }];
  const h = A.historia(d, '2026-08', 6);
  return { ok: h.meses === 1 && h.mesesCerrados === 0 && h.promedio === 0 && h.mejor === null,
           det: 'hay un mes en curso, pero nada que promediar todavía' };
});

probar('Un hogar recién configurado no tiene historia que enseñar', () => {
  return { ok: A.historia(hogar(), '2026-08', 12).meses === 0,
           det: 'no inventa meses vacíos' };
});

/* ============ arranque vacío ============ */
grupo('Arranque vacío');

probar('Un documento nuevo no inventa números', () => {
  const vacioDoc = { version: 3, configurado: false, personas: [], plantillaIngresos: [],
                     gastos: [], tarjetas: [], financiamientos: [], proyectos: [],
                     movimientos: [], ingresosMes: {} };
  const r = A.resumenMes(vacioDoc, '2026-08');
  return { ok: r.neto === 0 && r.gastos === 0 && r.disponible === 0,
           det: 'todo en cero hasta que el usuario lo registre' };
});

probar('Dice qué falta por configurar', () => {
  const vacioDoc = { version: 3, personas: [], plantillaIngresos: [], gastos: [],
                     tarjetas: [], financiamientos: [], proyectos: [], movimientos: [], ingresosMes: {} };
  const f = A.faltantes(vacioDoc);
  return { ok: f.length === 3, det: f.map(x => x.t).join(' · ') };
});

/* ============ el ciclo cuenta solo lo que es de esa tarjeta ============ */
grupo('A qué tarjeta pertenece cada consumo');

probar('Una compra que salió de la cuenta no entra en el corte de la tarjeta', () => {
  // Lo que importa el banco desde una CUENTA no lleva tarjeta. Antes se le
  // achacaba a la primera de la lista e inflaba lo que había que pagar.
  const d = hogar();
  // Dentro del ciclo que cierra el 6 de septiembre: del 7 de agosto en adelante.
  d.movimientos = [
    { id: 'm1', fecha: '2026-08-10', periodo: '2026-08', monto: 1000,
      medioPago: 'tarjeta', tarjetaId: 't1', gastoId: 'g1' },
    { id: 'm2', fecha: '2026-08-11', periodo: '2026-08', monto: 4000,
      medioPago: 'tarjeta', tarjetaId: null, gastoId: 'g1',
      origen: 'import', fuente: 'cuenta:c1' }
  ];
  const c = A.cicloTarjeta(d, d.tarjetas[0], '2026-09');
  return { ok: c.cargado === 1000,
           det: `cargado ${c.cargado}; antes daba 5,000 metiendo la compra de la cuenta` };
});

probar('El corte y la deuda de la tarjeta cuentan lo mismo', () => {
  const d = hogar();
  d.tarjetas[0].desdeMes = '2026-08';
  d.tarjetas[0].saldoInicial = 0;
  d.movimientos = [
    { id: 'm1', fecha: '2026-08-10', periodo: '2026-08', monto: 1200,
      medioPago: 'tarjeta', tarjetaId: 't1', gastoId: 'g1' },
    { id: 'm2', fecha: '2026-08-11', periodo: '2026-08', monto: 900,
      medioPago: 'tarjeta', tarjetaId: null, gastoId: 'g1' }
  ];
  const c = A.cicloTarjeta(d, d.tarjetas[0], '2026-09');
  const deuda = A.deudaTarjeta(d, d.tarjetas[0], '2026-08');
  return { ok: c.cargado === deuda.cargado && c.cargado === 1200,
           det: `ciclo ${c.cargado} · deuda ${deuda.cargado}` };
});

probar('La tarjeta de débito no se anuncia como próximo corte', () => {
  const d = hogar();
  d.tarjetas = [{ id: 'td', nombre: 'Débito', tipo: 'debito', diaCorte: 6 }];
  const p = A.pulso(d, A.periodoDe('2026-08-10', 1), '2026-08-10');
  return { ok: p.proximoCorte === null,
           det: 'la de débito sale de la cuenta al instante: no tiene corte' };
});

/* ============ el mes congelado manda hacia atrás ============ */
grupo('Meses congelados');

probar('Bajar hoy un rubro no reescribe el plan de un mes ya congelado', () => {
  const d = hogar();
  d.presupuestoMes = { '2026-07': { montos: { g1: 8000, gs: 2000 }, cerrado: true } };
  d.gastos[0].monto = 3000;                       // se recorta el plan hoy
  const jul = A.gastosMes(d, 0, '2026-07');
  const ago = A.gastosMes(d, 0, '2026-08');
  return { ok: jul.total === 10000 && ago.total === 5000,
           det: `julio congelado en ${jul.total}, agosto vive con ${ago.total}` };
});

probar('Un rubro creado después no aparece con presupuesto en un mes viejo', () => {
  const d = hogar();
  d.presupuestoMes = { '2026-07': { montos: { g1: 8000, gs: 2000 }, cerrado: true } };
  d.gastos.push({ id: 'gn', concepto: 'Nuevo', monto: 4000, categoria: 'Hogar', crecimiento: 0 });
  const fila = A.gastosMes(d, 0, '2026-07').detalle.find(g => g.id === 'gn');
  return { ok: fila.monto === 0 && A.gastosMes(d, 0, '2026-07').total === 10000,
           det: 'el rubro existe pero con 0 en julio' };
});

/* ============ a qué mes pertenece un registro ============ */
grupo('El mes de cada registro');

probar('Un movimiento viejo sin periodo se cuenta por su fecha', () => {
  const d = hogar();
  d.movimientos = [{ id: 'm1', fecha: '2026-08-09', monto: 700, gastoId: 'g1', medioPago: 'efectivo' }];
  const c = A.porCategoria(d, '2026-08');
  return { ok: A.perDe(d.movimientos[0]) === '2026-08' && c.total === 700,
           det: 'la app y el informe usan esta misma regla' };
});

probar('El saldo del banco de un mes pasado no se come lo de después', () => {
  const d = hogar();
  d.cuentas = [{ id: 'c1', nombre: 'Cuenta', saldoInicial: 0, desdeMes: '2026-08',
                 saldoBanco: { monto: 5000, fecha: '2026-08-15' } }];
  d.retiros = [{ id: 'r1', cuentaId: 'c1', monto: 2000, fecha: '2026-09-05', periodo: '2026-09' }];
  const agosto = A.saldoCuenta(d, d.cuentas[0], '2026-08');
  const sept   = A.saldoCuenta(d, d.cuentas[0], '2026-09');
  return { ok: agosto.saldo === 5000 && sept.saldo === 3000,
           det: `agosto ${agosto.saldo} · septiembre ${sept.saldo}` };
});

/* ============ del estado de cuenta al plan ============ */
grupo('Del estado de cuenta al plan');

/** Hogar con gasto SOLO en el mes en curso, como queda tras la primera importación. */
const reciénImportado = () => {
  const d = hogar();
  const hoy = A.periodoDe(A.hoyLocal(), 1);
  d.gastos = [{ id: 'g1', concepto: 'Supermercado', monto: 0, categoria: 'Alimentación', crecimiento: 0, medioPago: 'tarjeta' },
              { id: 'g2', concepto: 'Combustible', monto: 0, categoria: 'Transporte', crecimiento: 0, medioPago: 'tarjeta' }];
  d.movimientos = [
    { id: 'm1', periodo: hoy, fecha: hoy + '-10', monto: 1500, gastoId: 'g1', origen: 'import' },
    { id: 'm2', periodo: hoy, fecha: hoy + '-12', monto: 900,  gastoId: 'g2', origen: 'import' }
  ];
  return { d, hoy };
};

probar('Tras importar el primer estado de cuenta ya se puede proponer presupuesto', () => {
  // Antes se exigía un mes CERRADO: recién importado no había ninguno y el aviso
  // decía "importa tus estados de cuenta y vuelve", que era lo que se acababa de hacer.
  const { d, hoy } = reciénImportado();
  const p = A.presupuestoSugerido(d, hoy, 12);
  return { ok: p.hayDatos === true && p.parcial === true,
           det: p.hayDatos ? 'usa el mes en curso y lo marca como parcial' : 'sigue sin datos' };
});

probar('Lo propuesto es lo que de verdad se gastó en cada rubro', () => {
  const { d, hoy } = reciénImportado();
  const p = A.presupuestoSugerido(d, hoy, 12);
  const m = {};
  p.recurrentes.forEach(f => { m[f.concepto] = f.sugerido; });
  return { ok: m['Supermercado'] === 1500 && m['Combustible'] === 900 && p.sumaSugerida === 2400,
           det: `Supermercado ${m['Supermercado']} · Combustible ${m['Combustible']}` };
});

probar('Con un solo mes no se clasifica nada como fijo ni puntual', () => {
  const { d, hoy } = reciénImportado();
  const p = A.presupuestoSugerido(d, hoy, 12);
  return { ok: p.unSoloMes === true && p.recurrentes.every(f => f.clase === 'unico'),
           det: 'hace falta más de un mes para saber qué se repite' };
});

probar('Con meses cerrados, el mes en curso vuelve a quedar fuera', () => {
  // La excepción es solo para el arranque: en cuanto hay un mes cerrado, un mes
  // a medias volvería a bajar la mediana y no debe contar.
  const { d, hoy } = reciénImportado();
  const anterior = A.sumaMeses(hoy, -1);
  d.movimientos.push({ id: 'm3', periodo: anterior, fecha: anterior + '-10', monto: 3000, gastoId: 'g1' });
  const p = A.presupuestoSugerido(d, hoy, 12);
  return { ok: p.parcial === false && p.periodos.length === 1 && p.periodos[0] === anterior,
           det: 'periodos usados: ' + p.periodos.join(', ') };
});

probar('Sin un solo movimiento sigue sin haber nada que proponer', () => {
  const p = A.presupuestoSugerido(hogar(), '2026-08', 12);
  return { ok: p.hayDatos === false && p.recurrentes.length === 0,
           det: 'no se inventa un presupuesto de la nada' };
});

/* ============ el plan sin montos ============ */
grupo('Cuando el plan está sin montos');

/** Rubros creados por la importación (todos en 0) y gasto real encima. */
const sinMontos = () => {
  const d = hogar();
  d.gastos = [{ id: 'g1', concepto: 'Supermercado', monto: 0, categoria: 'Alimentación', crecimiento: 0, medioPago: 'tarjeta' },
              { id: 'g2', concepto: 'Comida fuera', monto: 0, categoria: 'Alimentación', crecimiento: 0, medioPago: 'tarjeta' }];
  d.financiamientos = [];
  d.cuentas = [{ id: 'c1', nombre: 'Banco', saldoInicial: 662.74, desdeMes: '2026-07' }];
  d.movimientos = [
    { id: 'm1', periodo: '2026-07', fecha: '2026-07-10', monto: 30000, gastoId: 'g1' },
    { id: 'm2', periodo: '2026-07', fecha: '2026-07-20', monto: 24997.75, gastoId: 'g2' },
    { id: 'm3', periodo: '2026-08', fecha: '2026-08-03', monto: 2001.37, gastoId: 'g1' }
  ];
  return d;
};

probar('Se detecta que el plan está sin llenar', () => {
  const p = A.planIncompleto(sinMontos(), '2026-08');
  return { ok: p.hay === true && p.sinMonto === 2 && p.plan === 0,
           det: `${p.sinMonto} rubros sin monto y ${p.gastado} gastados` };
});

probar('Con el plan lleno deja de avisar', () => {
  const d = sinMontos();
  d.gastos[0].monto = 8000;
  return { ok: A.planIncompleto(d, '2026-08').hay === false,
           det: 'el aviso solo sale mientras no haya ni un monto' };
});

probar('El colchón no desaparece por no haber plan', () => {
  // Este era el fallo grave: gastoMensual salía 0, mesesColchon quedaba null y
  // TODO el diagnóstico se esfumaba, dejando solo un "van bien" con el banco vacío.
  const s = A.saludFinanciera(sinMontos(), '2026-08');
  return { ok: s.mesesColchon !== null && s.baseReal === true && s.gastoMensual > 50000,
           det: `colchón ${s.mesesColchon === null ? 'null' : s.mesesColchon.toFixed(3)} meses ` +
                `sobre ${Math.round(s.gastoMensual)} de gasto real` };
});

probar('Y avisa de que el colchón no alcanza ni una semana', () => {
  const s = A.saludFinanciera(sinMontos(), '2026-08');
  return { ok: s.pasos.some(x => x.clave === 'colchon'),
           det: 'pasos: ' + s.pasos.map(x => x.clave).join(', ') };
});

probar('Con plan de verdad, el colchón se mide contra el plan', () => {
  const d = hogar();
  d.cuentas = [{ id: 'c1', nombre: 'Banco', saldoInicial: 30000, desdeMes: '2026-07' }];
  const s = A.saludFinanciera(d, '2026-08');
  return { ok: s.baseReal === false && s.gastoMensual === 10500,
           det: `gasto mensual ${s.gastoMensual} = 10,000 de gastos + 500 de cuota` };
});

/* ============ el PDF "Transacciones del mes" de Ficohsa ============ */
grupo('Estado de cuenta de Ficohsa');

/** Los renglones tal como los devuelve renglonesPdf para ese PDF. */
const ficohsa = () => ([
  ['Transacciones del mes'],
  ['MOISES ARMANDO MELGAR ALVAREZ'],
  ['Cuenta:', '753077681'],
  ['Moneda:', 'LPS'],
  ['Balance de la cuenta'],
  ['Fecha desde:', '01/07/2026', 'Fecha hasta:', '31/07/2026'],
  ['Moneda', 'Saldo en libros*', 'Retenidos y diferidos', 'Saldo disponible'],
  ['LPS', '0.00', '0.00', '0.00'],
  ['Fecha', 'Referencia', 'Codigó', 'Descripción', 'Debito', 'Créditos', 'Balance'],
  ['06/07/2026', '280876850', 'TF', 'Pago/MOISES ARMAND', '0.00', '42,618.40', '42,646.12'],
  ['06/07/2026', '88915', 'DB', 'PAGO 5140-00**-****-894', '42,645.83', '0.00', '0.29'],
  // Encajado en medio viene el resumen del estado, con sus propias filas.
  ['Resumen de estado de cuenta'],
  ['Código Movimiento', 'Débitos', 'Créditos'],
  ['TF', 'Transferencia de Fondos', '0', '0.00', '3', '51,795.85'],
  ['Totales', '3', '51823.57', '3', '51795.85'],
  ['22/07/2026', '280897010', 'TF', 'Pago/MOISES ARMAND', '0.00', '1,126.37', '1,126.66'],
  ['22/07/2026', '56605', 'DB', 'SUPERMERCADO LA COLONIA', '1,126.66', '0.00', '0.00']
]);

probar('Se reconoce el formato y sale la cuenta', () => {
  const l = I.adaptadorFicohsa(ficohsa());
  return { ok: Boolean(l) && l.banco === 'Ficohsa' && l.tipo === 'cuenta' && l.cuenta === '753077681',
           det: l ? `${l.banco} · cuenta ${l.cuenta} · titular ${l.titular}` : 'no lo reconoció' };
});

probar('El resumen encajado en la página no se cuela como movimiento', () => {
  const l = I.adaptadorFicohsa(ficohsa());
  return { ok: l.movs.length === 4,
           det: `${l.movs.length} movimientos; las filas de "Totales" y "TF" quedan fuera` };
});

probar('Débito sale negativo y crédito positivo', () => {
  const l = I.adaptadorFicohsa(ficohsa());
  return { ok: cerca(l.movs[0].monto, 42618.40) && cerca(l.movs[1].monto, -42645.83),
           det: `${l.movs[0].monto} y ${l.movs[1].monto}` };
});

probar('La referencia no se cuela en el concepto', () => {
  const l = I.adaptadorFicohsa(ficohsa());
  return { ok: !/280876850/.test(l.movs[0].concepto),
           det: 'concepto: ' + l.movs[0].concepto };
});

probar('El saldo inicial se deduce del balance de la primera fila', () => {
  // Ficohsa no lo imprime, pero 42,646.12 − 42,618.40 = 27.72.
  const l = I.adaptadorFicohsa(ficohsa());
  return { ok: cerca(l.saldoIni, 27.72), det: 'saldo inicial deducido: ' + l.saldoIni };
});

probar('Una cuenta que queda en cero SÍ se verifica', () => {
  // Con `!saldoFin` el cero daba falsy y se saltaba la comprobación entera.
  const l = I.adaptadorFicohsa(ficohsa());
  l.desde = '2026-07-01'; l.hasta = '2026-07-31';
  const v = I.verificar(l);
  return { ok: v !== null && v.cuadra === true,
           det: v ? `esperado ${v.esperado.toFixed(2)} · diferencia ${v.diferencia}` : 'no se verificó' };
});

probar('Manda el rango que declara el archivo, no el de sus movimientos', () => {
  const l = I.adaptadorFicohsa(ficohsa());
  return { ok: l.desdeDecl === '2026-07-01' && l.hastaDecl === '2026-07-31',
           det: `${l.desdeDecl} → ${l.hastaDecl} (los movimientos van del 6 al 22)` };
});

/* ============ pagar la tarjeta no es un gasto ============ */
grupo('Pagos de tarjeta desde la cuenta');

const conTarjeta = { personas: [{ id: 'p1', nombre: 'MOISES ARMANDO MELGAR ALVAREZ' }],
                     tarjetas: [{ id: 't1', numero: '5140-00**-****-8941' }] };

probar('"PAGO 5140-..." desde la cuenta es pago de tarjeta, no gasto', () => {
  // Si entra como gasto se cuenta dos veces todo el consumo de la tarjeta:
  // una por cada compra del estado y otra por el giro que las paga.
  const t = I.clasificar({ concepto: 'DB PAGO 5140-00**-****-894', monto: -42645.83 },
                         conTarjeta, { tipo: 'cuenta' });
  return { ok: t === 'pagoTarjeta', det: 'clasificado como: ' + t };
});

probar('Reconoce la tarjeta aunque el banco recorte los últimos dígitos', () => {
  return { ok: I.esPagoDeTarjeta('pago 5140-00**-****-894', conTarjeta) === true,
           det: 'basta con que coincidan los cuatro primeros' };
});

probar('Un pago que no es de ninguna tarjeta suya sigue siendo gasto', () => {
  const t = I.clasificar({ concepto: 'PAGO SERVICIO DE AGUA 9911', monto: -800 },
                         conTarjeta, { tipo: 'cuenta' });
  return { ok: t === 'gasto', det: 'clasificado como: ' + t };
});

probar('Un cargo positivo nunca se toma por pago de tarjeta', () => {
  const t = I.clasificar({ concepto: 'PAGO 5140-00**-****-894', monto: 500 },
                         conTarjeta, { tipo: 'cuenta' });
  return { ok: t !== 'pagoTarjeta', det: 'entrar dinero no es saldar la tarjeta; salió: ' + t };
});

/* ============ que cuadre al centavo ============ */
grupo('Cierre que cuadra');

/**
 * Hogar del criterio de aceptación: corte el 6, apertura declarada, consumos
 * dentro del ciclo 7 jul – 6 ago y los tres anclas del banco puestos.
 */
const hogarCuadrado = () => ({
  version: 6, configurado: true, inicioMes: 1,
  personas: [{ id:'p1', nombre:'Moisés', cuentaId:'c1' }],
  cuentas: [{ id:'c1', nombre:'Ficohsa', saldoInicial:0, desdeMes:'2026-07',
              saldoBanco:{ monto:32000, fecha:'2026-08-31' } }],
  plantillaIngresos: [{ id:'q1', nombre:'Comisiones', dia:6,
                        lineas:[{ personaId:'p1', bruto:42000, deducciones:[] }] }],
  ingresosMes: { '2026-08': { confirmado:{ q1:true },
    lineas:{ q1:{ p1:{ personaId:'p1', bruto:42000, deducciones:[] } } }, _upd:'2026-08-06T00:00:00Z' } },
  gastos: [{ id:'g1', concepto:'Comida', monto:12000, categoria:'Alimentación', crecimiento:0, medioPago:'tarjeta', tarjetaId:'t1' }],
  tarjetas: [{ id:'t1', nombre:'BAC', tipo:'credito', diaCorte:6, diaPago:27, pagaCon:'q1',
               pagaTotal:true, tasaAnual:55, desdeMes:'2026-07', saldoInicial:0,
               saldoBanco:{ monto:12000, fecha:'2026-08-06' } }],
  financiamientos: [], proyectos: [],
  movimientos: [
    { id:'m1', periodo:'2026-08', fecha:'2026-07-20', monto:13000, gastoId:'g1', medioPago:'tarjeta', tarjetaId:'t1' },
    { id:'m2', periodo:'2026-08', fecha:'2026-08-04', monto:3000,  gastoId:'g1', medioPago:'tarjeta', tarjetaId:'t1' },
    { id:'m3', periodo:'2026-08', fecha:'2026-08-15', monto:1500,  gastoId:'g1', medioPago:'efectivo' }
  ],
  retiros: [{ id:'r1', periodo:'2026-08', fecha:'2026-08-14', monto:2000, cuentaId:'c1' }],
  pagosTarjeta: [{ id:'pt1', periodo:'2026-08', fecha:'2026-07-27', monto:9000, tarjetaId:'t1', cuentaId:'c1' }],
  comercios: {},
  presupuestoMes: { '2026-08': { montos:{ g1:12000 }, efectivoContado: 500,
    notas: { g1: 'compra grande de despensa' },
    apertura: { fecha:'2026-08-01', cuentas:{ c1:1000 }, tarjetas:{ t1:5000 }, efectivo:0, financiamientos:{} } } }
});

probar('El ciclo de la tarjeta va del 7 de julio al 6 de agosto', () => {
  const e = A.estadoTarjeta(hogarCuadrado(), hogarCuadrado().tarjetas[0], '2026-08');
  return { ok: e.desde === '2026-07-07' && e.hasta === '2026-08-06',
           det: `${e.desde} al ${e.hasta}` };
});

probar('Consumido, abonado y adeudado son tres cifras distintas', () => {
  const d = hogarCuadrado();
  const e = A.estadoTarjeta(d, d.tarjetas[0], '2026-08');
  return { ok: e.consumido === 16000 && e.abonado === 9000 && e.deuda === 12000,
           det: `consumido ${e.consumido} · abonado ${e.abonado} · deuda ${e.deuda}` };
});

probar('Pagar el total antes del límite significa cero intereses', () => {
  const d = hogarCuadrado();
  const e = A.estadoTarjeta(d, d.tarjetas[0], '2026-08');
  return { ok: e.pagaTotal === true && e.interesMensual === 0,
           det: 'debe 12,000 al 55% y no paga un lempira: es crédito gratis' };
});

probar('Las tres conciliaciones dan 0.00 con datos correctos', () => {
  const c = A.conciliaciones(hogarCuadrado(), '2026-08');
  return { ok: c.todas.every(x => x.cuadra),
           det: c.todas.map(x => `${x.nombre}: ${x.diferencia}`).join(' · ') };
});

probar('Cada conciliación dice con qué ventana se hizo', () => {
  const c = A.conciliaciones(hogarCuadrado(), '2026-08');
  return { ok: c.tarjetas[0].desde === '2026-07-07' && c.cuentas[0].desde === '2026-08-01',
           det: `crédito ${c.tarjetas[0].ventana}, débito ${c.cuentas[0].ventana}` };
});

probar('Con todo cuadrado y justificado, el mes se puede cerrar', () => {
  const c = A.cierreDeMes(hogarCuadrado(), '2026-08');
  return { ok: c.puedeCerrar === true && c.bloqueos.length === 0,
           det: 'sin bloqueos' };
});

probar('Una diferencia sin explicar bloquea el cierre', () => {
  const d = hogarCuadrado();
  d.tarjetas[0].saldoBanco.monto = 12500;        // el banco dice otra cosa
  const c = A.cierreDeMes(d, '2026-08');
  return { ok: !c.puedeCerrar && c.bloqueos.some(b => b.tipo === 'conciliacion'),
           det: c.bloqueos.map(b => b.texto).join(' | ') };
});

probar('Un ajuste con nota desbloquea; sin nota no', () => {
  const base = hogarCuadrado();
  base.tarjetas[0].saldoBanco.monto = 12500;
  const sinNota = JSON.parse(JSON.stringify(base));
  sinNota.presupuestoMes['2026-08'].ajustes = { 'tarjeta:t1': { monto: -500, nota: '' } };
  const conNota = JSON.parse(JSON.stringify(base));
  conNota.presupuestoMes['2026-08'].ajustes = { 'tarjeta:t1': { monto: -500, nota: 'cargo del banco que no había llegado' } };
  return { ok: !A.cierreDeMes(sinNota, '2026-08').puedeCerrar && A.cierreDeMes(conNota, '2026-08').puedeCerrar,
           det: 'la nota es lo que convierte un descuadre en historia' };
});

probar('Un exceso sin justificar bloquea el cierre', () => {
  const d = hogarCuadrado();
  delete d.presupuestoMes['2026-08'].notas;
  const c = A.cierreDeMes(d, '2026-08');
  return { ok: !c.puedeCerrar && c.bloqueos.some(b => b.tipo === 'exceso'),
           det: c.bloqueos.filter(b => b.tipo === 'exceso').map(b => b.texto).join(' | ') };
});

probar('Falta contar el efectivo y no deja cerrar', () => {
  const d = hogarCuadrado();
  delete d.presupuestoMes['2026-08'].efectivoContado;
  return { ok: !A.cierreDeMes(d, '2026-08').puedeCerrar,
           det: 'sin contar la cartera no hay contra qué cuadrar' };
});

probar('Una bolsa de efectivo negativa se detecta', () => {
  const d = hogarCuadrado();
  d.retiros = [];                                 // gastaron efectivo sin retirar
  const c = A.conciliaciones(d, '2026-08');
  return { ok: c.efectivo.imposible === true,
           det: `efectivo calculado en ${c.efectivo.calculado}` };
});

probar('La apertura del mes siguiente hereda el cierre del anterior', () => {
  const d = hogarCuadrado();
  const saldos = A.saldosCierre(d, '2026-08');
  d.presupuestoMes['2026-09'] = { apertura: Object.assign({}, saldos, { fecha: '2026-09-01' }) };
  const ap = A.aperturaDe(d, '2026-09');
  return { ok: ap.derivada === false && ap.cuentas.c1 === saldos.cuentas.c1 && ap.tarjetas.t1 === saldos.tarjetas.t1,
           det: `cuenta ${ap.cuentas.c1} · tarjeta ${ap.tarjetas.t1} · efectivo ${ap.efectivo}` };
});

probar('Sin apertura sembrada se deduce del cierre anterior, y se dice', () => {
  const ap = A.aperturaDe(hogarCuadrado(), '2026-09');
  return { ok: ap.derivada === true,
           det: 'no se hace pasar por declarado algo que se dedujo' };
});

probar('El efectivo CONTADO manda sobre el calculado al cerrar', () => {
  /* La app calcula 500 con lo anotado; la persona contó 380. La cifra
     contada es un hecho medido y la calculada una deducción a partir de
     lo que se anotó — y lo que no se anotó no existe para la app.
     Arrancar el mes siguiente con 500 sería empezar con un número que
     ya sabemos equivocado, y arrastrarlo. Es el mismo criterio con el
     que el saldo declarado por el banco manda en `saldoCuenta`. */
  const d = hogarCuadrado();
  const calculado = A.saldosCierre(d, '2026-08').efectivo;
  d.presupuestoMes['2026-08'].efectivoContado = 380;
  const s = A.saldosCierre(d, '2026-08');
  return { ok: calculado === 500 && s.efectivo === 380,
           det: `la app calculaba ${calculado} y se contaron 380 → arranca con ${s.efectivo}` };
});

probar('Contar cero SÍ es contar: no se cae al calculado', () => {
  const d = hogarCuadrado();
  d.presupuestoMes['2026-08'].efectivoContado = 0;
  return { ok: A.saldosCierre(d, '2026-08').efectivo === 0,
           det: '«conté y no había nada» es una respuesta, no una ausencia' };
});

probar('Sin contar nada, manda lo calculado', () => {
  const d = hogarCuadrado();
  delete d.presupuestoMes['2026-08'].efectivoContado;
  return { ok: A.saldosCierre(d, '2026-08').efectivo === 500,
           det: 'sin dato medido, la deducción es lo mejor que hay' };
});

probar('La diferencia no se pierde: queda en el ajuste con su nota', () => {
  // Que lo contado mande no significa taparlo. El descuadre sigue
  // bloqueando el cierre hasta que alguien lo explique.
  const d = hogarCuadrado();
  d.presupuestoMes['2026-08'].efectivoContado = 380;
  const c = A.conciliaciones(d, '2026-08');
  return { ok: c.efectivo.declarado === 380 && cerca(c.efectivo.diferencia, 120) && c.efectivo.resuelta === false,
           det: `declarado ${c.efectivo.declarado} · diferencia ${c.efectivo.diferencia}` };
});

/* ============ el asesor decide, no solo cuenta ============ */
grupo('Priorizar por mérito');

const carteraMixta = (liquido) => {
  const d = hogarCuadrado();
  d.cuentas[0].saldoBanco = { monto: liquido, fecha: '2026-08-31' };
  d.proyectos = [
    { id:'ip', nombre:'iPhone', costoMin:25000, costoMax:25000, aportes:[], aporteMensual:0,
      tipo:'deseo', urgencia:'ya', consecuencia:'nada, es un gusto' },
    { id:'mu', nombre:'Endodoncia', costoMin:9000, costoMax:9000, aportes:[], aporteMensual:0,
      tipo:'salud', urgencia:'ya', consecuencia:'empeora y cuesta más' },
    { id:'fr', nombre:'Frenos', costoMin:6000, costoMax:6000, aportes:[], aporteMensual:0,
      tipo:'seguridad', urgencia:'este_ano', consecuencia:'puedo chocar' }
  ];
  return d;
};

probar('Salud le gana a un deseo aunque el deseo esté primero en la lista', () => {
  const pri = A.priorizar(carteraMixta(5000), '2026-08');
  return { ok: pri.filas[0].p.id === 'mu' && pri.filas[2].p.id === 'ip',
           det: pri.filas.map(f => f.p.nombre).join(' → ') };
});

probar('Con el colchón bajo un mes, un deseo baja a Reconsideralo', () => {
  const pri = A.priorizar(carteraMixta(5000), '2026-08');
  const ip = pri.porId['ip'];
  return { ok: pri.colchonFlaco === true && ip.veredicto === 'reconsiderar',
           det: ip.porque.join('; ') };
});

probar('Y el motivo trae el número que falta para el colchón', () => {
  const ip = A.priorizar(carteraMixta(5000), '2026-08').porId['ip'];
  return { ok: ip.porque.some(x => /colchón/.test(x) && /L\s/.test(x)),
           det: ip.porque[0] };
});

probar('Una deuda cara le gana a un deseo con flujo de sobra', () => {
  const d = carteraMixta(200000);                 // colchón de sobra
  d.tarjetas[0].pagaTotal = false;                // ahora sí revuelve saldo
  const pri = A.priorizar(d, '2026-08');
  const ip = pri.porId['ip'];
  return { ok: pri.deudaCara === true && ip.veredicto === 'reconsiderar' && ip.ev.veredicto !== 'inviable',
           det: `flujo ${ip.flujo || ip.ev.veredicto} pero mérito ${ip.veredicto}: ${ip.porque.join('; ')}` };
});

probar('Salud urgente sale "Hazlo ya" aunque no haya ahorro', () => {
  const mu = A.priorizar(carteraMixta(5000), '2026-08').porId['mu'];
  return { ok: mu.veredicto === 'hazlo_ya',
           det: 'con el motor viejo una urgencia sin ahorro salía "No viable"' };
});

probar('El disponible se reparte en orden de mérito, no de lista', () => {
  const pri = A.priorizar(carteraMixta(5000), '2026-08');
  // El primero por mérito reserva antes: el iPhone recibe lo que sobra.
  return { ok: pri.porId['mu'].ev.cuotaSugerida >= pri.porId['ip'].ev.cuotaSugerida,
           det: `endodoncia ${Math.round(pri.porId['mu'].ev.cuotaSugerida)} vs iPhone ${Math.round(pri.porId['ip'].ev.cuotaSugerida)}` };
});

/* ============ la carta ============ */
grupo('La carta del asesor');

probar('Se arma sin reventar con la cartera vacía', () => {
  const c = A.cartaAsesor(hogarCuadrado(), '2026-08');
  return { ok: c.parrafos.length >= 3 && c.parrafos.every(p => p.titulo && p.texto),
           det: c.parrafos.map(p => p.titulo).join(' · ') };
});

probar('Se arma con un hogar recién creado, sin nada registrado', () => {
  const vacio = { version:6, configurado:false, personas:[], cuentas:[], plantillaIngresos:[],
                  ingresosMes:{}, gastos:[], tarjetas:[], financiamientos:[], proyectos:[],
                  movimientos:[], retiros:[], pagosTarjeta:[], comercios:{}, presupuestoMes:{} };
  const c = A.cartaAsesor(vacio, '2026-08');
  return { ok: c.parrafos.length >= 2, det: 'no revienta con todo en cero' };
});

probar('La carta pospone el deseo con el número y el motivo', () => {
  const c = A.cartaAsesor(carteraMixta(5000), '2026-08');
  const t = c.parrafos.map(p => p.texto).join(' ');
  return { ok: /iPhone/.test(t) && /reconsideralo/i.test(t) && /colchón/.test(t),
           det: 'la carta nombra el proyecto, el veredicto y la razón' };
});

probar('La carta cierra con una acción concreta', () => {
  const c = A.cartaAsesor(carteraMixta(5000), '2026-08');
  const ultima = c.parrafos[c.parrafos.length - 1];
  return { ok: /acción/i.test(ultima.titulo) && ultima.texto.length > 20,
           det: ultima.texto.slice(0, 90) };
});

/* ============ cuadre contra los archivos del banco ============ */
grupo('Conciliación con el banco');

const loteCsv = () => I.adaptadorCsv(
  ['Cuenta:,753077681', 'Saldo inicial:,5000.00', 'Saldo final:,3100.00', '',
   'Fecha,Descripcion,Debito,Credito,Balance',
   '10/07/2026,SUPER TDAS PAIZ,1500.00,,3500.00',
   '18/07/2026,PUMA MIRAMONTES,400.00,,3100.00'].join('\n'));

probar('Una cuenta de 9 dígitos también se reconoce', () => {
  // Exigir 10 o más dejaba fuera a Ficohsa y el archivo se quedaba sin destino
  // aunque la cuenta estuviera registrada con su número.
  return { ok: loteCsv().cuenta === '753077681', det: 'cuenta leída: ' + loteCsv().cuenta };
});

probar('Enseña los renglones del banco que la app no tiene', () => {
  const d = { cuentas: [{ id:'c1', nombre:'Ficohsa', numero:'753077681' }], tarjetas: [],
              movimientos: [], retiros: [], pagosTarjeta: [] };
  const l = loteCsv();
  l.desde = '2026-07-10'; l.hasta = '2026-07-18';
  const k = I.conciliarConApp(d, l, I.destinoDe(l, d));
  return { ok: k.soloBanco.length === 2 && k.soloApp.length === 0,
           det: `${k.soloBanco.length} del banco sin contraparte` };
});

probar('Y los registros de la app que el banco no trae', () => {
  const d = { cuentas: [{ id:'c1', nombre:'Ficohsa', numero:'753077681' }], tarjetas: [],
              movimientos: [{ id:'x1', fecha:'2026-07-14', monto:333, fuente:'cuenta:c1', concepto:'A mano' }],
              retiros: [], pagosTarjeta: [] };
  const l = loteCsv();
  l.desde = '2026-07-10'; l.hasta = '2026-07-18';
  const k = I.conciliarConApp(d, l, I.destinoDe(l, d));
  return { ok: k.soloApp.length === 1 && k.soloApp[0].manual === true && cerca(k.diferencia, 1567),
           det: `sobra ${k.soloApp[0].concepto} · diferencia ${k.diferencia}` };
});

probar('Lo que ya coincide no se reporta como descuadre', () => {
  const d = { cuentas: [{ id:'c1', nombre:'Ficohsa', numero:'753077681' }], tarjetas: [],
              movimientos: [{ id:'a', fecha:'2026-07-10', monto:1500, fuente:'cuenta:c1' },
                            { id:'b', fecha:'2026-07-18', monto:400,  fuente:'cuenta:c1' }],
              retiros: [], pagosTarjeta: [] };
  const l = loteCsv();
  l.desde = '2026-07-10'; l.hasta = '2026-07-18';
  const k = I.conciliarConApp(d, l, I.destinoDe(l, d));
  return { ok: k.cuadra === true && k.diferencia === 0, det: 'renglón por renglón' };
});

probar('La tarjeta cuadra: saldo anterior + consumos − pagos = saldo al corte', () => {
  const lote = { tipo: 'tarjeta', saldoAnterior: 5000, saldoCorte: 12000,
                 movs: [{ monto: 16000 }, { monto: -9000 }] };
  const v = I.verificarTarjeta(lote);
  return { ok: v.cuadra === true && v.esperado === 12000, det: `esperado ${v.esperado}` };
});

probar('Sin saldo anterior la tarjeta no se da por cuadrada', () => {
  const v = I.verificarTarjeta({ tipo:'tarjeta', saldoCorte: 12000, movs: [{ monto: 16000 }] });
  return { ok: v === null, det: 'prefiere no decir nada a inventar un cuadre' };
});

/* ============ lo ya gastado que todavía no sale ============ */
grupo('Retenidos: gastado pero sin salir');

/** Cuenta con L 10,000 en libros, de los cuales 4,000 son compras sin cobrar. */
const conRetenido = (monto) => {
  const d = hogar();
  d.gastos = [{ id:'g1', concepto:'Comida', monto:5000, categoria:'Alimentación', crecimiento:0, medioPago:'tarjeta' }];
  d.financiamientos = [];
  d.tarjetas = [];
  d.cuentas = [{ id:'c1', nombre:'Banco', saldoInicial:10000, desdeMes:'2026-07',
                 retenido: monto == null ? undefined : { monto, fecha:'2026-08-05' } }];
  return d;
};

probar('El disponible descuenta lo retenido; el saldo en libros no', () => {
  const d = conRetenido(4000);
  const f = A.saldoCuenta(d, d.cuentas[0], '2026-08');
  return { ok: f.saldo === 10000 && f.retenido === 4000 && f.disponible === 6000,
           det: `libros ${f.saldo} · retenido ${f.retenido} · disponible ${f.disponible}` };
});

probar('El capital NO cuenta lo retenido: ese dinero ya se gastó', () => {
  const conRet = A.patrimonio(conRetenido(4000), '2026-08');
  const sinRet = A.patrimonio(conRetenido(0), '2026-08');
  return { ok: conRet.enBanco === 6000 && sinRet.enBanco === 10000 && conRet.neto === sinRet.neto - 4000,
           det: `capital ${conRet.neto} contra ${sinRet.neto} si no hubiera retenido` };
});

probar('Y el saldo en libros sigue disponible aparte, para poder cuadrar', () => {
  const p = A.patrimonio(conRetenido(4000), '2026-08');
  return { ok: p.enLibros === 10000 && p.retenidoBanco === 4000,
           det: 'el cierre cuadra contra libros; el capital se mide con lo disponible' };
});

probar('El colchón tampoco cuenta lo retenido', () => {
  // Una compra ya hecha no puede cubrir una emergencia: no está.
  const conRet = A.saludFinanciera(conRetenido(4000), '2026-08');
  const sinRet = A.saludFinanciera(conRetenido(0), '2026-08');
  return { ok: conRet.liquido === 6000 && sinRet.liquido === 10000 && conRet.mesesColchon < sinRet.mesesColchon,
           det: `${conRet.mesesColchon.toFixed(2)} meses contra ${sinRet.mesesColchon.toFixed(2)}` };
});

probar('Lo autorizado en la tarjeta suma a la deuda, no al capital', () => {
  const d = hogar();
  d.cuentas = [];
  d.financiamientos = [];
  d.tarjetas = [{ id:'t1', nombre:'BAC', tipo:'credito', diaCorte:6, desdeMes:'2026-07',
                  saldoInicial:5000, pagaTotal:true, retenido:{ monto:1200, fecha:'2026-08-05' } }];
  const t = A.deudaTarjeta(d, d.tarjetas[0], '2026-08');
  const p = A.patrimonio(d, '2026-08');
  return { ok: t.deuda === 5000 && t.retenido === 1200 && t.deudaTotal === 6200 && p.pasivos === 6200,
           det: `corte ${t.deuda} + autorizado ${t.retenido} = ${t.deudaTotal} de deuda real` };
});

probar('Sin retenido declarado, nada cambia', () => {
  const d = conRetenido(null);
  const f = A.saldoCuenta(d, d.cuentas[0], '2026-08');
  return { ok: f.retenido === 0 && f.disponible === f.saldo,
           det: 'quien no lo use no nota diferencia' };
});

probar('El PDF de Ficohsa trae retenido y disponible, y se leen', () => {
  const r = ficohsa();
  r[7] = ['LPS', '10,000.00', '4,000.00', '6,000.00'];   // libros | retenidos | disponible
  const l = I.adaptadorFicohsa(r);
  return { ok: l.retenido === 4000 && l.disponible === 6000,
           det: `retenido ${l.retenido} · disponible ${l.disponible}` };
});

/* ============ copiar los ingresos del mes anterior ============ */
grupo('Copiar ingresos de un mes a otro');

const lin = (bruto, isr) => ({ personaId:'a', bruto, deducciones:[{ concepto:'ISR', monto:isr }] });

const conHistorial = () => {
  const d = hogar();                                    // plantilla: 25,000 − 5,000
  d.ingresosMes = {
    '2026-06': { confirmado:{ q1:true }, lineas:{ q1:{ a: lin(42000, 5000) } }, _upd:'2026-06-20T00:00:00Z' },
    '2026-07': { confirmado:{ q1:true }, lineas:{ q1:{ a: lin(43100, 5210) } }, _upd:'2026-07-20T00:00:00Z' }
  };
  return d;
};

probar('Encuentra el último mes confirmado antes del que se está viendo', () => {
  return { ok: A.mesConfirmadoPrevio(conHistorial(), 'q1', '2026-08') === '2026-07' &&
               A.mesConfirmadoPrevio(conHistorial(), 'q1', '2026-07') === '2026-06',
           det: 'toma el más reciente, no el primero' };
});

probar('El formulario se rellena con lo último confirmado, no con la plantilla', () => {
  // La plantilla es lo que alguien tecleó al configurar la app; seis meses
  // después ya no se parece a nada.
  const d = conHistorial();
  const f = A.lineaParaConfirmar(d, d.plantillaIngresos[0], 'a', '2026-08');
  return { ok: f.origen === 'copia' && f.desde === '2026-07' && f.linea.bruto === 43100,
           det: `viene de ${f.desde} con ${f.linea.bruto}, no los 25,000 de la plantilla` };
});

probar('Se copian también las retenciones', () => {
  const d = conHistorial();
  const f = A.lineaParaConfirmar(d, d.plantillaIngresos[0], 'a', '2026-08');
  return { ok: A.dedTotal(f.linea) === 5210, det: 'ISR copiado: ' + A.dedTotal(f.linea) };
});

probar('Lo ya guardado de ese mes manda sobre la copia', () => {
  const d = conHistorial();
  d.ingresosMes['2026-08'] = { confirmado:{}, lineas:{ q1:{ a: lin(50000, 6000) } } };
  const f = A.lineaParaConfirmar(d, d.plantillaIngresos[0], 'a', '2026-08');
  return { ok: f.origen === 'mes' && f.linea.bruto === 50000,
           det: 'no pisa lo que ya se había escrito' };
});

probar('Sin nada confirmado antes, se cae a la plantilla', () => {
  const d = hogar();
  const f = A.lineaParaConfirmar(d, d.plantillaIngresos[0], 'a', '2026-08');
  return { ok: f.origen === 'plantilla' && f.linea.bruto === 25000,
           det: 'el primer mes no tiene de dónde copiar' };
});

probar('Lo copiado se puede editar: no queda congelado', () => {
  // El atajo guarda una copia, pero es un valor normal y corriente: se abre,
  // se corrige y se guarda encima como cualquier otro mes.
  const d = conHistorial();
  d.ingresosMes['2026-08'] = { confirmado:{ q1:true }, lineas:{ q1:{ a: lin(43100, 5210) } },
                               copiado:{ q1:'2026-07' } };
  // así lo reescribe fmConfirmar al guardar
  d.ingresosMes['2026-08'].lineas.q1 = { a: lin(50000, 6100) };
  delete d.ingresosMes['2026-08'].copiado.q1;
  const l = A.lineaDe(d, d.plantillaIngresos[0], 'a', '2026-08');
  return { ok: l.bruto === 50000 && A.dedTotal(l) === 6100 &&
               !Object.keys(d.ingresosMes['2026-08'].copiado).length,
           det: 'corregido a 50,000 y deja de estar "sin revisar"' };
});

probar('Una copia sin revisar se distingue de un confirmado de verdad', () => {
  // "Confirmado" quiere decir que alguien miró lo que entró. Una copia a ciegas
  // no puede decir eso hasta que la revisen.
  const d = conHistorial();
  d.ingresosMes['2026-08'] = { confirmado:{ q1:true }, lineas:{ q1:{ a: lin(43100, 5210) } },
                               copiado:{ q1:'2026-07' } };
  return { ok: d.ingresosMes['2026-08'].copiado.q1 === '2026-07' &&
               A.eventoConfirmado(d, 'q1', '2026-08') === true,
           det: 'cuenta para los cálculos, pero se marca como copiado en pantalla' };
});

probar('Rellenar NO es confirmar', () => {
  // Lo que separa una estimación de un hecho es que alguien lo confirme. Que el
  // formulario venga lleno no puede saltarse ese paso.
  const d = conHistorial();
  return { ok: A.eventoConfirmado(d, 'q1', '2026-08') === false &&
               A.ingresoMes(d, '2026-08').confirmado === false,
           det: 'agosto sigue en estimado hasta que la persona confirme' };
});

/* ============ salida ============ */

/* ============================================================
   UN PAGO MAYOR A LA DEUDA CONOCIDA SE REPORTA, NO SE REDONDEA

   Se encontró con datos reales: un hogar había pagado L 44,920.58 a una
   tarjeta cuyo saldo inicial era 0 y sin un solo consumo registrado. El
   `Math.max(0, …)` de la deuda lo redondeaba a cero y la pantalla decía
   «Sobra L 33,675.40» sobre una tarjeta recién pagada.

   Que alguien pague más de lo que la app cree que debe es la señal más
   fuerte de que a esa tarjeta le falta su saldo. Borrarla es borrar el
   único dato que lo dice.
   ============================================================ */

grupo('Un pago mayor a la deuda conocida');

probar('lo que se pagó de más sobrevive al redondeo', () => {
  const D = {
    tarjetas: [{ id: 'T', nombre: 'Walmart', tipo: 'credito', diaCorte: 6, saldoInicial: 0 }],
    movimientos: [],
    pagosTarjeta: [{ id: 'p1', tarjetaId: 'T', fecha: '2026-08-06', periodo: '2026-08', monto: 44920.58 }]
  };
  const [t] = A.deudaTarjetas(D, '2026-08');
  return { ok: t.deuda === 0 && cerca(t.pagadoDeMas, 44920.58),
           det: `deuda ${t.deuda} · pagado de más ${t.pagadoDeMas}` };
});

probar('con el saldo declarado por el banco ya no hay nada que denunciar', () => {
  const D = {
    tarjetas: [{ id: 'T', nombre: 'Walmart', tipo: 'credito', diaCorte: 6, saldoInicial: 0,
                 saldoBanco: { monto: 20741.20, fecha: '2026-08-18' } }],
    movimientos: [],
    pagosTarjeta: [{ id: 'p1', tarjetaId: 'T', fecha: '2026-08-06', periodo: '2026-08', monto: 44920.58 }]
  };
  const [t] = A.deudaTarjetas(D, '2026-08');
  return { ok: cerca(t.deuda, 20741.20) && t.pagadoDeMas === 0,
           det: `deuda ${t.deuda} · pagado de más ${t.pagadoDeMas}` };
});
