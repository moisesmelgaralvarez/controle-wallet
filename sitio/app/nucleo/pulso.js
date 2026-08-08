/* ============================================================
   Pulso del mes, reparto por categoría e historia

   Gastar el 26% del presupuesto es normal el día 20 y es una alarma el
   día 4. Toda esta parte existe para hacer esa comparación —ritmo de
   gasto contra ritmo de calendario— y para guardar la memoria de los
   meses ya vividos sin rellenar huecos que nadie registró.

   Extraído de asesor.js (1138-1280) sin tocar una línea.
   ============================================================ */

import { num, perDe, sumaMontos } from './base.js';
import { diaValido, diasDelMes, diasPeriodo, hoyLocal, inicioMes, periodoDe, rangoPeriodo, sumaMeses } from './fechas.js';
import { ingresoMes } from './ingresos.js';
import { gastosMes } from './saldos.js';
import { acumulado } from './proyeccion.js';
/* ---------- pulso del mes ---------- */

/** Días desde el día `dia` de `per` hasta la próxima vez que caiga `objetivo`. */
function diasHasta(per, dia, objetivo) {
  const [y, m] = per.split('-').map(Number);
  const esteMes = diaValido(y, m, objetivo);
  if (esteMes >= dia) return esteMes - dia;
  const [y2, m2] = sumaMeses(per, 1).split('-').map(Number);
  return (diasDelMes(y, m) - dia) + diaValido(y2, m2, objetivo);
}

/**
 * Cómo va el mes que se está viviendo: si el gasto lleva el ritmo del
 * calendario o va por delante, cuánto queda por día y qué viene después.
 *
 * La comparación que importa no es "cuánto llevo gastado" sino "cuánto llevo
 * gastado FRENTE a qué tan avanzado va el mes". Gastar el 60% del presupuesto
 * es normal el día 20 y es una alarma el día 5.
 */
function pulso(D, per, hoy) {
  const hoyStr = hoy || hoyLocal();
  const ini = inicioMes(D);
  const rango = rangoPeriodo(per, ini);
  const diasMes = diasPeriodo(per, ini);

  // Un mes pasado no tiene "ritmo": tiene resultado. Uno futuro, nada aún.
  const hoyPer = periodoDe(hoyStr, ini);
  const enCurso = hoyPer === per;
  // Días corridos DEL CICLO, que con inicio 7 no coinciden con el día del mes.
  const corridos = Math.round((Date.parse(hoyStr) - Date.parse(rango.desde)) / 86400000) + 1;
  const dia = enCurso ? Math.min(diasMes, Math.max(0, corridos)) : (hoyPer > per ? diasMes : 0);
  const diasRestantes = Math.max(0, diasMes - dia);

  const presupuesto = gastosMes(D, 0, per).total;
  const gastado = sumaMontos((D.movimientos || []).filter(x => perDe(x) === per));

  const avanceMes = diasMes > 0 ? dia / diasMes : 0;
  const avanceGasto = presupuesto > 0 ? gastado / presupuesto : 0;

  const ritmoDiario = dia > 0 ? gastado / dia : 0;
  const proyeccion = ritmoDiario * diasMes;
  const desvio = proyeccion - presupuesto;
  const restante = presupuesto - gastado;
  const porDia = diasRestantes > 0 ? restante / diasRestantes : restante;

  const diaHoy = enCurso ? Number(hoyStr.slice(8, 10)) : 1;
  const perHoy = hoyStr.slice(0, 7);
  const proximo = (arr, campoDia) => (arr || [])
    .filter(x => num(x[campoDia]) > 0)
    .map(x => ({ nombre: x.nombre, dia: num(x[campoDia]),
                 enDias: diasHasta(perHoy, diaHoy, x[campoDia]) }))
    .sort((a, b) => a.enDias - b.enDias)[0] || null;

  return {
    enCurso, dia, diasMes, diasRestantes, desde: rango.desde, hasta: rango.hasta,
    presupuesto, gastado, restante,
    avanceMes, avanceGasto,
    ritmoDiario, proyeccion, desvio, porDia,
    // Se adelanta al calendario: gasta más rápido de lo que corre el mes.
    adelantado: presupuesto > 0 && avanceGasto > avanceMes,
    hayPlan: presupuesto > 0,
    proximoIngreso: enCurso ? proximo(D.plantillaIngresos, 'dia') : null,
    // Solo las de crédito tienen corte: la de débito sale de la cuenta al
    // instante y anunciar su "corte" no significa nada.
    proximoCorte:   enCurso ? proximo((D.tarjetas || [])
                      .filter(t => (t.tipo || 'credito') === 'credito'), 'diaCorte') : null
  };
}

/* ---------- en qué se fue ---------- */

/**
 * Reparte lo realmente gastado en un mes entre las categorías del plan.
 * La categoría no vive en el movimiento sino en el gasto al que apunta:
 * así, recategorizar un rubro reordena también todo el histórico.
 */
function porCategoria(D, per) {
  const deGasto = {};
  (D.gastos || []).forEach(g => { deGasto[g.id] = g.categoria || 'Otros'; });

  const acumulado = {};
  let total = 0;
  (D.movimientos || []).filter(x => perDe(x) === per).forEach(x => {
    // Un movimiento sin rubro —o cuyo rubro se borró— cae en "Otros".
    const cat = deGasto[x.gastoId] || 'Otros';
    const monto = num(x.monto);
    acumulado[cat] = acumulado[cat] || { categoria: cat, monto: 0, movimientos: 0 };
    acumulado[cat].monto += monto;
    acumulado[cat].movimientos++;
    total += monto;
  });

  const filas = Object.keys(acumulado)
    .map(k => Object.assign({ pct: total > 0 ? acumulado[k].monto / total : 0 }, acumulado[k]))
    .sort((a, b) => b.monto - a.monto);

  return { filas, total, mayor: filas[0] || null };
}

/* ---------- historia ---------- */

/**
 * Los meses que ya tienen algo real que contar. No rellena huecos: un mes sin
 * ingreso confirmado y sin un solo movimiento no aparece, porque no hay nada
 * que enseñar más que un número inventado.
 */
function historia(D, hasta, meses = 12) {
  const filas = [];
  for (let k = meses - 1; k >= 0; k--) {
    const per = sumaMeses(hasta, -k);
    const ing = ingresoMes(D, per);
    const movs = (D.movimientos || []).filter(x => perDe(x) === per);
    if (!ing.confirmado && !ing.parcial && !movs.length) continue;

    const gastado = sumaMontos(movs);
    filas.push({
      per, ingreso: ing.neto, confirmado: ing.confirmado,
      gastado, movimientos: movs.length,
      quedo: ing.neto - gastado,
      tasa: ing.neto > 0 ? (ing.neto - gastado) / ing.neto : 0,
      enCurso: per === hasta
    });
  }

  // El mes en curso queda fuera de promedios y récords: lleva unos días de
  // gasto contra meses enteros, así que siempre saldría ganando. Compararlos
  // sería darse una palmada en la espalda por no haber terminado el mes.
  const cerrados = filas.filter(f => !f.enCurso);
  const conIngreso = cerrados.filter(f => f.ingreso > 0);
  const suma = conIngreso.reduce((s, f) => s + f.quedo, 0);
  const ordenados = conIngreso.slice().sort((a, b) => b.quedo - a.quedo);

  return {
    filas,
    meses: filas.length,
    mesesCerrados: conIngreso.length,
    total: suma,
    promedio: conIngreso.length ? suma / conIngreso.length : 0,
    mejor: ordenados[0] || null,
    peor: ordenados.length > 1 ? ordenados[ordenados.length - 1] : null
  };
}


export { diasHasta, pulso, porCategoria, historia };
