/* ============================================================
   Proyección a 60 meses y veredicto de cada proyecto

   Simula mes a mes el disponible real, con los gastos capitalizando y
   los financiamientos muriéndose conforme se acaban. Sobre eso decide
   si un proyecto es viable, ajustado, no viable o ya alcanzado.

   Extraído de asesor.js (1281-1419) sin tocar una línea.
   ============================================================ */

import { HORIZONTE, COLCHON_MIN, num, fmt } from './base.js';
import { sumaMeses, distanciaMeses } from './fechas.js';
import { ingresoMes } from './ingresos.js';
import { cuotasEn, deudaFinanciada, liberaciones } from './financiamientos.js';
import { gastosMes } from './saldos.js';
/* ---------- proyección ---------- */

function proyectar(D, desde, meses = HORIZONTE) {
  const filas = [];
  for (let k = 0; k < meses; k++) {
    const per = sumaMeses(desde, k);
    const ing = ingresoMes(D, per);
    const gas = gastosMes(D, k, per);
    const cuo = cuotasEn(D, k);
    filas.push({
      k, per,
      ingreso: ing.neto,
      confirmado: ing.confirmado,
      corriente: gas.corriente,
      salud: gas.salud,
      cuotas: cuo.total,
      disponible: ing.neto - gas.corriente - gas.salud - cuo.total
    });
  }
  return { filas, liberaciones: liberaciones(D) };
}

/** Foto del mes que se enseña en el resumen. */
function resumenMes(D, per) {
  const ing = ingresoMes(D, per);
  const gas = gastosMes(D, 0, per);
  const cuo = cuotasEn(D, 0);
  const disponible = ing.neto - gas.corriente - gas.salud - cuo.total;

  return {
    bruto: ing.bruto, neto: ing.neto, deducciones: ing.deducciones,
    porPersona: ing.porPersona, porEvento: ing.porEvento,
    confirmado: ing.confirmado, parcial: ing.parcial, pendientes: ing.pendientes,
    corriente: gas.corriente, salud: gas.salud, gastos: gas.total,
    cuotas: cuo.total, financiados: cuo.vivos.length,
    deudaFinanciada: deudaFinanciada(D),
    disponible,
    tasaAhorro: ing.neto > 0 ? disponible / ing.neto : 0
  };
}

/* ---------- evaluación de proyectos ---------- */

const acumulado = p => (p.aportes || []).reduce((s, a) => s + num(a.monto), 0);

function mesesPara(filas, falta, cuota) {
  if (falta <= 0) return 0;
  let junta = 0;
  for (let k = 0; k < filas.length; k++) {
    const aporte = cuota != null ? Math.min(cuota, Math.max(0, filas[k].disponible)) : Math.max(0, filas[k].disponible);
    junta += aporte;
    if (junta >= falta) return k + 1;
  }
  return null;
}

function evaluarProyecto(D, p, desde, otrosCompromisos = 0) {
  const proy = proyectar(D, desde);
  const filas = proy.filas;
  const disponible = filas.length ? filas[0].disponible : 0;

  const min = num(p.costoMin);
  const max = Math.max(num(p.costoMax), min);
  const junta = acumulado(p);
  const faltaMin = Math.max(0, min - junta);
  const faltaMax = Math.max(0, max - junta);

  const mesesMin = mesesPara(filas, faltaMin, null);
  const mesesMax = mesesPara(filas, faltaMax, null);

  let mesesObjetivo = null, cuotaObjetivo = null;
  if (p.fechaObjetivo) {
    mesesObjetivo = Math.max(1, distanciaMeses(desde, p.fechaObjetivo.slice(0, 7)));
    cuotaObjetivo = faltaMax / mesesObjetivo;
  }

  const techoSano = Math.max(0, disponible * (1 - COLCHON_MIN) - otrosCompromisos);
  const manual = num(p.aporteMensual) > 0;
  const cuotaSugerida = manual ? num(p.aporteMensual) : Math.min(techoSano, faltaMax || techoSano);
  const mesesSugerido = cuotaSugerida > 0 ? mesesPara(filas, faltaMax, cuotaSugerida) : null;
  const sinMargen = !manual && cuotaSugerida <= 0 && faltaMax > 0 && disponible > 0;

  const exigida = cuotaObjetivo != null ? cuotaObjetivo : cuotaSugerida;
  const carga = disponible > 0 ? exigida / disponible : Infinity;

  const alertas = [];
  let veredicto = 'viable';

  if (faltaMax <= 0) {
    veredicto = 'logrado';
  } else if (disponible <= 0) {
    veredicto = 'inviable';
    alertas.push({ nivel: 'critical', texto: 'No hay disponible: los gastos y las cuotas de financiamiento consumen todo el ingreso neto. Ningún proyecto avanza hasta liberar flujo.' });
  } else if (cuotaObjetivo != null && cuotaObjetivo > disponible) {
    veredicto = 'inviable';
    alertas.push({ nivel: 'critical', texto: `Para la fecha objetivo harían falta ${fmt(cuotaObjetivo)} al mes, y solo hay ${fmt(disponible)} disponibles. La fecha no se sostiene.` });
  } else if (carga > 1 - COLCHON_MIN) {
    veredicto = 'ajustado';
    alertas.push({ nivel: 'serious', texto: `Comprometería el ${Math.round(carga * 100)}% del disponible y dejaría casi sin colchón para imprevistos.` });
  }

  if (sinMargen) {
    veredicto = 'ajustado';
    alertas.push({ nivel: 'serious', texto: `Los otros proyectos ya reservan ${fmt(otrosCompromisos)} al mes y no queda margen seguro para este. Hay que bajarles el ritmo o esperar a que terminen.` });
  } else if (otrosCompromisos > 0 && exigida + otrosCompromisos > disponible) {
    if (veredicto === 'viable') veredicto = 'ajustado';
    alertas.push({ nivel: 'serious', texto: `Sumado a los otros proyectos se piden ${fmt(exigida + otrosCompromisos)} al mes, por encima de los ${fmt(disponible)} disponibles.` });
  } else if (otrosCompromisos > 0) {
    alertas.push({ nivel: 'warning', texto: `Esta cuota ya descuenta los ${fmt(otrosCompromisos)} al mes que reservan los otros proyectos.` });
  }

  // Un financiamiento que termina pronto libera flujo: eso es accionable.
  const pronto = proy.liberaciones.filter(l => l.enMeses > 0 && l.enMeses <= 12);
  if (pronto.length && faltaMax > 0) {
    const l = pronto[0];
    alertas.push({ nivel: 'warning', texto: `En ${l.enMeses} ${l.enMeses === 1 ? 'mes' : 'meses'} termina "${l.nombre}" y se liberan ${fmt(l.cuota)} al mes; a partir de ahí el plazo se acorta.` });
  }

  const salud0 = filas[0] ? filas[0].salud : 0;
  const salud12 = filas[12] ? filas[12].salud : salud0;
  if (salud12 > salud0 * 1.05 && disponible > 0) {
    alertas.push({ nivel: 'warning', texto: `El gasto de salud pasaría de ${fmt(salud0)} a ${fmt(salud12)} en 12 meses; eso resta ${fmt(salud12 - salud0)} al disponible mensual.` });
  }

  if (mesesMax === null && veredicto !== 'logrado' && veredicto !== 'inviable') {
    veredicto = 'inviable';
    alertas.push({ nivel: 'critical', texto: `Ni destinando todo el disponible se alcanza el costo máximo en ${HORIZONTE / 12} años.` });
  }

  return {
    min, max, junta, faltaMin, faltaMax,
    disponible, mesesMin, mesesMax,
    mesesObjetivo, cuotaObjetivo,
    cuotaSugerida, mesesSugerido, sinMargen,
    quincenal: cuotaSugerida / 2,
    carga, veredicto, alertas, filas
  };
}


export { proyectar, resumenMes, acumulado, mesesPara, evaluarProyecto };
