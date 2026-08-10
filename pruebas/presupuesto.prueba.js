/* ============================================================
   El editor del presupuesto escribe en columnas que existen.

   Es la prueba que más barato sale y más caro habría costado no
   tener. Al guardar, cada formulario arma una fila con nombres de
   columna en `snake_case`; el resto de la app habla `camelCase`. Un
   `saldoInicial` donde iba `saldo_inicial` no revienta aquí: revienta
   con un 400 de PostgREST en la cara de quien acaba de darle a
   Guardar, y solo si alguien probó ESE formulario a mano.

   Así que las columnas no se revisan a ojo: se leen de las
   migraciones —la única autoridad sobre qué existe— y se comparan
   contra lo que los armadores devuelven de verdad.

   Lo segundo que se comprueba es que los montos y los días salgan ya
   dentro de lo que la base acepta. Cada `check` del esquema tiene
   aquí su recorte: un número fuera de rango tiene que volverse un
   número válido en el navegador, no un error del servidor.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { FILAS, filaApertura } from '../sitio/app/datos/filas.js';
import { montosDeMes, mesCongelado, cierreDeMes } from '../sitio/app/nucleo/saldos.js';

/* ------------------------------------------------------------
   Qué columnas existen, según las migraciones
   ------------------------------------------------------------ */

const CARPETA = new URL('../supabase/migrations/', import.meta.url);

const sql = readdirSync(CARPETA)
  .filter(n => n.endsWith('.sql')).sort()
  .map(n => readFileSync(new URL(n, CARPETA), 'utf8'))
  .join('\n');

/* Lo que abre una línea de definición y NO es una columna. */
const NO_ES_COLUMNA = new Set(['constraint', 'unique', 'primary', 'foreign', 'check', 'exclude']);

function columnasDeLasMigraciones(texto) {
  const tablas = {};
  const guardar = (tabla, columna) => {
    (tablas[tabla] || (tablas[tabla] = new Set())).add(columna);
  };

  // `create table public.x ( ... );` — el cierre es un `);` al principio
  // de la línea, que es como están escritas todas las migraciones.
  const crear = /create table public\.(\w+)\s*\(([\s\S]*?)\n\);/g;
  for (const [, tabla, cuerpo] of texto.matchAll(crear)) {
    for (const linea of cuerpo.split('\n')) {
      const m = linea.match(/^\s{2}(\w+)\s/);
      if (m && !NO_ES_COLUMNA.has(m[1])) guardar(tabla, m[1]);
    }
  }

  // `alter table public.x add column y ...` — así llegaron las anclas
  // de conciliación, y así llegará todo lo aditivo de aquí en adelante.
  const alterar = /alter table public\.(\w+)([\s\S]*?);/g;
  for (const [, tabla, cuerpo] of texto.matchAll(alterar)) {
    for (const [, columna] of cuerpo.matchAll(/add column\s+(\w+)/g)) guardar(tabla, columna);
  }

  return tablas;
}

const COLUMNAS = columnasDeLasMigraciones(sql);

test('el lector de migraciones encuentra las tablas y sus columnas', () => {
  // Si esto falla, el resto de las pruebas de abajo pasarían en verde
  // sin comprobar nada: una comprobación que no puede fallar no está
  // comprobando nada.
  for (const tabla of Object.keys(FILAS)) {
    assert.ok(COLUMNAS[tabla], `no se encontró la tabla ${tabla} en las migraciones`);
  }
  assert.ok(COLUMNAS.tarjetas.has('saldo_banco_monto'),
    'no se leyeron las columnas que agregó un `alter table`');
  assert.ok(COLUMNAS.gastos.has('crecimiento') && COLUMNAS.gastos.has('orden'));
  assert.ok(!COLUMNAS.tarjetas.has('constraint'), 'se coló una restricción como si fuera columna');
});

/* ------------------------------------------------------------
   Un formulario lleno de cada cosa
   ------------------------------------------------------------ */

const ctx = { hogarId: 'h1', orden: 3, plantillaId: 'ev1', proyectoId: 'x1',
              periodo: '2026-08', copiadoDe: null };

const FORMULARIOS = {
  hogares: { nombre: 'Casa', moneda: 'HNL', inicioMes: 7 },
  personas: { nombre: 'Moisés', cuentaId: 'c1' },
  cuentas: {
    nombre: 'Ficohsa', numero: '200012610911', saldoInicial: 30000, desdeMes: '2026-08',
    retenido: 450, saldoBanco: 28750.25, saldoBancoFecha: '2026-08-03'
  },
  tarjetas: {
    nombre: 'BAC', numero: '8941', tipo: 'credito', diaCorte: 6, diaPago: 27,
    pagaCon: 'ev1', cuentaId: 'c1', saldoInicial: 19101, desdeMes: '2026-08',
    pagaTotal: 'si', tasaAnual: 54, retenido: 120,
    saldoBanco: 19101, saldoBancoFecha: '2026-08-06'
  },
  gastos: {
    concepto: 'Supermercado', monto: 8000, categoria: 'Alimentación',
    medioPago: 'tarjeta', tarjetaId: 't1', crecimiento: 2
  },
  financiamientos: { nombre: 'Refrigeradora', cuotaMensual: 1200, cuotasTotales: 12, cuotasPagadas: 4 },
  plantilla_ingresos: { nombre: 'Comisiones', dia: 6 },
  plantilla_lineas: { personaId: 'p1', bruto: 25000, deducciones: [{ concepto: 'ISR', monto: 5000 }] },
  proyectos: {
    nombre: 'Lavadora', costoMin: 12000, costoMax: 18000, aporteMensual: 1500,
    fechaObjetivo: '2027-03', nota: 'La de ahora ya no centrifuga',
    tipo: 'esencial', urgencia: 'este_ano', consecuencia: 'Seguir pagando lavandería'
  },
  aportes: { personaId: 'p1', monto: 2000, fecha: '2026-08-09', nota: 'Del aguinaldo' },
  ingresos_mes: { personaId: 'p1', bruto: 27400, deducciones: [{ concepto: 'ISR', monto: 6200 }] },
  presupuesto_mes: {
    montos: { g1: 8000, g2: 2400 },
    notas: { g1: 'Se adelantó la compra del mes' },
    ajustes: { 'cuenta:c1': { monto: -125.5, nota: 'Comisión que no anotamos' } },
    efectivoContado: 1450
  }
};

test('cada columna que escribe el editor existe en su tabla', () => {
  const inventadas = [];
  for (const [tabla, armar] of Object.entries(FILAS)) {
    for (const columna of Object.keys(armar(FORMULARIOS[tabla], ctx))) {
      if (!COLUMNAS[tabla].has(columna)) inventadas.push(`${tabla}.${columna}`);
    }
  }
  assert.deepEqual(inventadas, [], `columnas que no existen: ${inventadas.join(', ')}`);
});

test('ningún formulario deja fuera lo que la tabla exige', () => {
  // `hogar_id` es lo que amarra cada fila a su inquilino. Una fila sin
  // él la rechaza la base, pero el error sería "no válido" a secas.
  for (const tabla of Object.keys(FILAS)) {
    if (tabla === 'hogares') continue;   // el hogar es el inquilino, no cuelga de otro
    const f = FILAS[tabla](FORMULARIOS[tabla], ctx);
    assert.equal(f.hogar_id, 'h1', `${tabla} se guardaría sin hogar`);
  }
});

/* ------------------------------------------------------------
   Los recortes: cada `check` del esquema, respetado desde aquí
   ------------------------------------------------------------ */

test('el día de arranque del mes se queda entre 1 y 28', () => {
  assert.equal(FILAS.hogares({ inicioMes: 31 }).inicio_mes, 28);
  assert.equal(FILAS.hogares({ inicioMes: 0 }).inicio_mes, 1);
  assert.equal(FILAS.hogares({ inicioMes: 7 }).inicio_mes, 7);
});

test('el crecimiento de un gasto se queda entre 0 y 20', () => {
  assert.equal(FILAS.gastos({ ...FORMULARIOS.gastos, crecimiento: 50 }, ctx).crecimiento, 20);
  assert.equal(FILAS.gastos({ ...FORMULARIOS.gastos, crecimiento: -3 }, ctx).crecimiento, 0);
});

test('los días de la tarjeta se quedan dentro del mes', () => {
  const t = FILAS.tarjetas({ ...FORMULARIOS.tarjetas, diaCorte: 99, diaPago: 99 }, ctx);
  assert.equal(t.dia_corte, 31);
  assert.equal(t.dia_pago, 31);
  assert.equal(FILAS.tarjetas({ ...FORMULARIOS.tarjetas, diaPago: 0 }, ctx).dia_pago, 0);
});

test('lo que va en blanco se queda en blanco, no se vuelve cero', () => {
  // Salió probando contra la base: abrir una tarjeta y guardarla sin
  // tocar nada le escribía un 0 donde había un nulo. Ese caso no
  // cambia ningún cálculo, pero el de al lado sí —`desde_mes`— y la
  // regla tiene que valer entera: guardar sin tocar no modifica nada.
  const t = FILAS.tarjetas({ ...FORMULARIOS.tarjetas, diaPago: null, desdeMes: '' }, ctx);
  assert.equal(t.dia_pago, null);
  assert.equal(t.desde_mes, null);
});

test('no quedan más cuotas pagadas que cuotas totales', () => {
  const f = FILAS.financiamientos({ ...FORMULARIOS.financiamientos, cuotasPagadas: 20 }, ctx);
  assert.equal(f.cuotas_pagadas, 12);
  assert.equal(f.cuotas_totales, 12);
});

test('la tasa de interés no se va de 200', () => {
  assert.equal(FILAS.tarjetas({ ...FORMULARIOS.tarjetas, tasaAnual: 900 }, ctx).tasa_anual, 200);
});

/* ------------------------------------------------------------
   Las decisiones que el formulario toma por su cuenta
   ------------------------------------------------------------ */

test('una tarjeta de débito no lleva día de corte', () => {
  // La base lo impone con un `check`, pero al revés: la de crédito lo
  // exige. Lo que se comprueba aquí es que cambiar el tipo limpie el
  // campo en vez de arrastrar el corte de cuando era de crédito.
  const t = FILAS.tarjetas({ ...FORMULARIOS.tarjetas, tipo: 'debito' }, ctx);
  assert.equal(t.dia_corte, null);
});

test('un gasto en efectivo no arrastra tarjeta', () => {
  const g = FILAS.gastos({ ...FORMULARIOS.gastos, medioPago: 'efectivo', tarjetaId: 't1' }, ctx);
  assert.equal(g.tarjeta_id, null);
});

test('«cualquiera» se guarda como sin tarjeta, no como cadena vacía', () => {
  // Una cadena vacía en una columna `uuid` es un 400; y el núcleo lee
  // el nulo como "cuenta en el corte de todas".
  assert.equal(FILAS.gastos({ ...FORMULARIOS.gastos, tarjetaId: '' }, ctx).tarjeta_id, null);
  assert.equal(FILAS.personas({ nombre: 'A', cuentaId: '' }, ctx).cuenta_id, null);
  assert.equal(FILAS.tarjetas({ ...FORMULARIOS.tarjetas, pagaCon: '' }, ctx).paga_con, null);
});

test('el orden de un gasto solo viaja cuando se está creando', () => {
  // Al editar no se manda: mandarlo con el valor de la pantalla lo
  // movería de sitio cada vez que alguien corrige un monto.
  assert.equal(FILAS.gastos(FORMULARIOS.gastos, { hogarId: 'h1', orden: 3 }).orden, 3);
  assert.ok(!('orden' in FILAS.gastos(FORMULARIOS.gastos, { hogarId: 'h1', orden: null })));
});

/* ------------------------------------------------------------
   Proyectos
   ------------------------------------------------------------ */

test('un costo suelto vale por los dos extremos del rango', () => {
  // El rango es una comodidad para cuando no hay cotización firme, no
  // una obligación. Con un solo número, mínimo y máximo son ese número:
  // si uno quedara en cero, `evaluarProyecto` daría la meta por
  // alcanzada desde el primer día.
  const soloMin = FILAS.proyectos({ ...FORMULARIOS.proyectos, costoMax: null }, ctx);
  assert.equal(soloMin.costo_min, 12000);
  assert.equal(soloMin.costo_max, 12000);

  const soloMax = FILAS.proyectos({ ...FORMULARIOS.proyectos, costoMin: null }, ctx);
  assert.equal(soloMax.costo_min, 18000);
  assert.equal(soloMax.costo_max, 18000);
});

test('un rango al revés se endereza en vez de rechazarse', () => {
  const p = FILAS.proyectos({ ...FORMULARIOS.proyectos, costoMin: 18000, costoMax: 12000 }, ctx);
  assert.equal(p.costo_min, 12000);
  assert.equal(p.costo_max, 18000);
});

test('la fecha objetivo se guarda como fecha, aunque se pregunte por mes', () => {
  // La columna es `date` y el campo es `type="month"`. Sin el día, la
  // base lo rechaza con un 400.
  assert.equal(FILAS.proyectos(FORMULARIOS.proyectos, ctx).fecha_objetivo, '2027-03-01');
  assert.equal(FILAS.proyectos({ ...FORMULARIOS.proyectos, fechaObjetivo: '' }, ctx).fecha_objetivo, null);
});

test('un proyecto sin clasificar es un deseo que puede esperar', () => {
  // Son los valores por omisión de la base, y los que hacen que el
  // orden por mérito no premie a un proyecto por no contestar.
  const p = FILAS.proyectos({ nombre: 'X', costoMin: 100 }, ctx);
  assert.equal(p.tipo, 'deseo');
  assert.equal(p.urgencia, 'algun_dia');
});

test('un aporte cuelga de su proyecto y puede no tener persona', () => {
  const a = FILAS.aportes(FORMULARIOS.aportes, ctx);
  assert.equal(a.proyecto_id, 'x1');
  assert.equal(typeof a.monto, 'number');
  assert.equal(FILAS.aportes({ ...FORMULARIOS.aportes, personaId: '' }, ctx).persona_id, null);
});

/* ------------------------------------------------------------
   Confirmar lo que entró
   ------------------------------------------------------------ */

test('confirmar a mano borra la marca de copiado', () => {
  // El upsert manda todas las columnas del cuerpo. Si `copiado_de` se
  // omitiera cuando es nulo, la marca de la copia anterior quedaría
  // puesta y el pago seguiría diciendo «sin revisar» DESPUÉS de que
  // alguien lo revisó.
  const f = FILAS.ingresos_mes(FORMULARIOS.ingresos_mes, ctx);
  assert.ok('copiado_de' in f, 'la columna tiene que viajar siempre');
  assert.equal(f.copiado_de, null);
  assert.equal(f.confirmado, true);
});

test('el atajo deja anotado de qué mes copió', () => {
  const f = FILAS.ingresos_mes(FORMULARIOS.ingresos_mes, { ...ctx, copiadoDe: '2026-07' });
  assert.equal(f.copiado_de, '2026-07');
  // Cuenta para los cálculos igual: lo que cambia es que nadie lo miró.
  assert.equal(f.confirmado, true);
});

/* ------------------------------------------------------------
   Cerrar el mes
   ------------------------------------------------------------ */

test('guardar a medias no escribe una fecha de cierre', () => {
  // Decir que un mes se cerró el día tal cuando nadie lo cerró es
  // inventarse un hecho, y encima uno que la pantalla enseña.
  const a = FILAS.presupuesto_mes(FORMULARIOS.presupuesto_mes, { ...ctx, cerrar: false });
  assert.equal(a.cerrado, false);
  assert.ok(!('cerrado_el' in a), 'sin cerrar no hay fecha de cierre');

  const b = FILAS.presupuesto_mes(FORMULARIOS.presupuesto_mes, { ...ctx, cerrar: true });
  assert.equal(b.cerrado, true);
  assert.ok(b.cerrado_el, 'al cerrar sí queda constancia de cuándo');
});

test('el efectivo contado distingue el cero de la ausencia', () => {
  // «Conté y no había nada» resuelve la conciliación; «nadie ha
  // contado» la deja bloqueando el cierre, que es lo correcto.
  const cero = FILAS.presupuesto_mes({ ...FORMULARIOS.presupuesto_mes, efectivoContado: 0 }, ctx);
  assert.equal(cero.efectivo_contado, 0);

  for (const vacio of ['', null, undefined]) {
    const f = FILAS.presupuesto_mes({ ...FORMULARIOS.presupuesto_mes, efectivoContado: vacio }, ctx);
    assert.equal(f.efectivo_contado, null, `${JSON.stringify(vacio)} debería quedar sin contar`);
  }
});

test('la apertura que se le siembra al mes siguiente lleva tres columnas y nada más', () => {
  // Es lo que impide que sembrar la apertura le borre al mes siguiente
  // la foto de su plan: el upsert solo toca las columnas que viajan.
  const f = filaApertura(
    { fecha: '2026-09-07', cuentas: { c1: 28750.25 }, tarjetas: { t1: 19101 },
      financiamientos: { f1: 9600 }, efectivo: 1450 },
    { hogarId: 'h1', periodo: '2026-09' });

  assert.deepEqual(Object.keys(f).sort(), ['apertura', 'hogar_id', 'periodo']);
  for (const columna of Object.keys(f)) {
    assert.ok(COLUMNAS.presupuesto_mes.has(columna), `presupuesto_mes.${columna} no existe`);
  }
  assert.equal(f.periodo, '2026-09');
  assert.equal(f.apertura.cuentas.c1, 28750.25);
});

test('un efectivo imposible se siembra tal cual, sin recortar a cero', () => {
  // Recortarlo convertiría un error —un retiro sin anotar— en un
  // arranque creíble, y entonces ya nadie lo encuentra.
  const f = filaApertura({ fecha: '2026-09-07', efectivo: -320 }, { hogarId: 'h1', periodo: '2026-09' });
  assert.equal(f.apertura.efectivo, -320);
});

test('la apertura no guarda que es declarada: serlo es estar guardada', () => {
  const f = filaApertura({ fecha: '2026-09-07', efectivo: 0 }, { hogarId: 'h1', periodo: '2026-09' });
  assert.ok(!('derivada' in f.apertura),
    'guardar un `derivada` dejaría que alguien convierta un hecho en una deducción');
});

test('una foto vacía del plan no es una foto', () => {
  /* La columna `montos` es `not null default '{}'`, así que TODA fila
     de `presupuesto_mes` trae `{}` — incluida la que se crea solo para
     sembrarle la apertura al mes siguiente. Leyendo ese `{}` como foto
     del plan, ese mes saldría con todos sus rubros en cero y la app
     diría que se pasaron en todo. En la app anterior no podía pasar
     porque ahí la propiedad simplemente no existía. */
  const sembrado = { presupuestoMes: { '2026-09': { montos: {}, apertura: { efectivo: 0 } } } };
  assert.equal(montosDeMes(sembrado, '2026-09'), null);
  assert.equal(mesCongelado(sembrado, '2026-09'), false);

  const congelado = { presupuestoMes: { '2026-09': { montos: { g1: 8000 } } } };
  assert.deepEqual(montosDeMes(congelado, '2026-09'), { g1: 8000 });
  assert.equal(mesCongelado(congelado, '2026-09'), true);
});

test('al efectivo no se le pide el saldo del banco: se le pide contarlo', () => {
  /* El efectivo es la única de las tres conciliaciones sin banco que la
     declare — por eso se cuenta a mano. Pedirle «lo que dice el banco»
     manda a buscar un dato que no existe, y un mensaje tiene que decir
     qué hacer. Venía así de la app anterior. */
  const D = {
    inicioMes: 1, personas: [], cuentas: [], tarjetas: [], gastos: [],
    financiamientos: [], proyectos: [], plantillaIngresos: [], ingresosMes: {},
    movimientos: [], retiros: [], pagosTarjeta: [], comercios: {},
    presupuestoMes: { '2026-08': { montos: { g1: 100 } } }
  };
  const b = cierreDeMes(D, '2026-08').bloqueos.find(x => x.clave === 'efectivo');
  assert.ok(b, 'el efectivo sin contar tiene que bloquear el cierre');
  assert.equal(b.texto, 'Falta contar cuánto hay en efectivo.');
  assert.doesNotMatch(b.texto, /banco/, 'el efectivo no tiene banco que lo declare');
});

/* ------------------------------------------------------------
   Las anclas de conciliación
   ------------------------------------------------------------ */

test('un ancla en blanco no se toca: la deja como la dejó el importador', () => {
  const c = FILAS.cuentas({ ...FORMULARIOS.cuentas, retenido: null, saldoBanco: null, saldoBancoFecha: '' }, ctx);
  assert.ok(!('retenido_monto' in c));
  assert.ok(!('saldo_banco_monto' in c));
});

test('un ancla en cero SÍ es una respuesta: ya no hay nada retenido', () => {
  const c = FILAS.cuentas({ ...FORMULARIOS.cuentas, retenido: 0 }, ctx);
  assert.equal(c.retenido_monto, 0);
  assert.ok(c.retenido_fecha, 'un retenido sin fecha no sirve para conciliar');
});

test('el saldo del banco no se guarda sin su fecha', () => {
  const c = FILAS.cuentas({ ...FORMULARIOS.cuentas, saldoBancoFecha: '' }, ctx);
  assert.ok(!('saldo_banco_monto' in c));
  assert.ok(!('saldo_banco_fecha' in c));
});

/* ------------------------------------------------------------
   Los montos son números, no texto
   ------------------------------------------------------------ */

test('todo monto sale como número', () => {
  // El camino de vuelta ya tiene su prueba: PostgREST devuelve los
  // `numeric` como texto y el armador los convierte. Este es el de
  // ida — un monto que salga como cadena se guarda igual, pero llega
  // de vuelta convertido y la diferencia aparece tres pantallas
  // después.
  const numericos = {
    cuentas: ['saldo_inicial', 'retenido_monto', 'saldo_banco_monto'],
    tarjetas: ['saldo_inicial', 'tasa_anual', 'retenido_monto', 'saldo_banco_monto'],
    gastos: ['monto', 'crecimiento'],
    financiamientos: ['cuota_mensual', 'cuotas_totales', 'cuotas_pagadas'],
    plantilla_lineas: ['bruto']
  };
  for (const [tabla, columnas] of Object.entries(numericos)) {
    const f = FILAS[tabla](FORMULARIOS[tabla], ctx);
    for (const c of columnas) {
      assert.equal(typeof f[c], 'number', `${tabla}.${c} salió como ${typeof f[c]}`);
      assert.ok(Number.isFinite(f[c]), `${tabla}.${c} no es un número usable`);
    }
  }
});
