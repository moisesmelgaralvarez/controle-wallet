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
import { FILAS } from '../sitio/app/datos/filas.js';

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

const ctx = { hogarId: 'h1', orden: 3, plantillaId: 'ev1', proyectoId: 'x1' };

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
  aportes: { personaId: 'p1', monto: 2000, fecha: '2026-08-09', nota: 'Del aguinaldo' }
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
