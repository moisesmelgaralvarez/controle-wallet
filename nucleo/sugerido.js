/* ============================================================
   Presupuesto sugerido a partir de lo ya vivido

   Propone montos mirando lo que de verdad se gastó, con mediana en vez
   de promedio: un mes con una compra grande no debe arrastrar la
   sugerencia de todos los demás.

   Extraído de asesor.js (1016-1137) sin tocar una línea.
   ============================================================ */

import { num, perDe } from './base.js';
import { diasPeriodo, hoyLocal, inicioMes, periodoDe, rangoPeriodo } from './fechas.js';
/* ---------- presupuesto sugerido por el histórico ---------- */

const mediana = a => {
  if (!a.length) return 0;
  const o = a.slice().sort((x, y) => x - y), m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/**
 * Propone cuánto presupuestar al mes, a partir de lo que de verdad se gastó.
 *
 * Usa MEDIANA, no promedio. Un mes con una compra de L 8,800 arrastra el
 * promedio hacia arriba y el presupuesto saldría inflado; la mediana ignora
 * ese golpe y describe el mes típico, que es lo que hay que presupuestar.
 *
 * Separa lo recurrente de lo puntual por presencia: un rubro que aparece casi
 * todos los meses es un costo fijo; uno que aparece una vez fue un evento y no
 * debe entrar al presupuesto mensual.
 *
 * Solo mira el mes CERRADO hacia atrás: el mes en curso va a medias y bajaría
 * la mediana sin motivo.
 */
function presupuestoSugerido(D, hasta, meses = 12) {
  const ini = inicioMes(D);
  const hoy = periodoDe(hoyLocal(), ini);
  const rubro = {};
  (D.gastos || []).forEach(g => { rubro[g.id] = g; });

  // Totales por periodo y por rubro. El futuro nunca cuenta.
  const porMes = {};
  (D.movimientos || []).forEach(m => {
    const per = perDe(m);
    if (!per || per > hoy) return;
    if (hasta && per > hasta) return;
    porMes[per] = porMes[per] || {};
    const k = m.gastoId || 'otros';
    porMes[per][k] = (porMes[per][k] || 0) + num(m.monto);
  });

  // El mes en curso va a medias y bajaría la mediana, así que se deja fuera.
  // Salvo que sea lo único que hay: negarse entonces dejaba sin salida a quien
  // acababa de importar su primer estado de cuenta —el aviso hasta le decía
  // "importa tus estados de cuenta y vuelve", que era justo lo que había hecho.
  // Se usa, pero avisando de que el mes no ha terminado.
  const cerrados = Object.keys(porMes).filter(p => p < hoy).sort();
  const parcial = !cerrados.length && Boolean(porMes[hoy]);
  const periodos = (parcial ? [hoy] : cerrados).slice(-meses);
  if (!periodos.length) {
    return { hayDatos: false, parcial: false, periodos: [], filas: [],
             recurrentes: [], puntuales: [], total: 0 };
  }

  // Con un solo mes no se puede decir si un rubro es fijo o fue un evento:
  // hace falta más de un mes para que "aparece casi siempre" signifique algo.
  const unSoloMes = periodos.length < 2;
  // Cuánto lleva corrido el mes en curso, para poder decir contra qué se mide.
  const avance = parcial
    ? Math.min(1, Math.max(0,
        (Math.round((Date.parse(hoyLocal()) - Date.parse(rangoPeriodo(hoy, ini).desde)) / 86400000) + 1)
        / diasPeriodo(hoy, ini)))
    : 1;

  const claves = new Set();
  periodos.forEach(p => Object.keys(porMes[p]).forEach(k => claves.add(k)));

  const filas = Array.from(claves).map(k => {
    // Un rubro ausente un mes cuenta como cero: si no se gastó, no se gastó.
    const serie = periodos.map(p => porMes[p][k] || 0);
    const presentes = serie.filter(v => v > 0).length;
    const med = mediana(serie);
    const g = rubro[k];
    return {
      gastoId: k,
      concepto: g ? g.concepto : (k === 'otros' ? 'Sin clasificar' : 'Rubro borrado'),
      categoria: g ? (g.categoria || 'Otros') : 'Otros',
      actual: g ? num(g.monto) : 0,
      sugerido: Math.round(med),
      mediana: med,
      promedio: serie.reduce((a, b) => a + b, 0) / serie.length,
      maximo: Math.max(...serie),
      presentes, deMeses: periodos.length,
      // Casi todos los meses = costo fijo. Uno o dos = evento, no presupuesto.
      clase: unSoloMes ? 'unico'
           : presentes >= periodos.length * 0.7 ? 'fijo'
           : presentes <= 1 ? 'puntual' : 'variable',
      serie
    };
  }).sort((a, b) => b.mediana - a.mediana);

  const totalesMes = periodos.map(p =>
    Object.keys(porMes[p]).reduce((s, k) => s + porMes[p][k], 0));

  const recurrentes = filas.filter(f => f.clase !== 'puntual');
  return {
    hayDatos: true,
    // `parcial`: lo sugerido sale de un mes que todavía no termina, así que es
    // un piso y no el gasto de un mes completo. Quien lo pinte debe decirlo.
    parcial, avance, unSoloMes,
    periodos, totalesMes,
    filas, recurrentes,
    // La suma de medianas y la mediana de los totales NO coinciden: la mediana
    // no es aditiva. Se enseñan las dos y se explica, en vez de esconderlo.
    sumaSugerida: recurrentes.reduce((s, f) => s + f.sugerido, 0),
    medianaTotal: mediana(totalesMes),
    promedioTotal: totalesMes.reduce((a, b) => a + b, 0) / totalesMes.length,
    puntuales: filas.filter(f => f.clase === 'puntual'),
    planActual: (D.gastos || []).reduce((s, g) => s + num(g.monto), 0)
  };
}

/** Hasta qué fecha hay datos del banco para cada cuenta o tarjeta. */
function coberturaImportada(D) {
  const out = {};
  const anota = (ref, fecha) => {
    if (!ref || !fecha) return;
    if (!out[ref] || fecha > out[ref].hasta) out[ref] = { hasta: fecha };
  };
  ['movimientos', 'retiros', 'pagosTarjeta'].forEach(col =>
    (D[col] || []).forEach(x => { if (x.origen === 'import') anota(x.fuente, x.fecha); }));
  return out;
}


export { mediana, presupuestoSugerido, coberturaImportada };
