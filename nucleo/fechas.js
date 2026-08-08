/* ============================================================
   Fechas y el mes del hogar

   Un hogar no siempre vive en meses de calendario: si la tarjeta corta
   el 6, "agosto" va del 7 de agosto al 6 de septiembre. Todo lo que
   dependa de en qué mes cae una fecha pasa por aquí, para que la app,
   el informe y el asesor no lo resuelvan cada uno a su manera.

   Extraído de asesor.js (30-101) sin tocar una línea.
   ============================================================ */

import { num, dosDig } from './base.js';
/* ---------- fechas ---------- */

function sumaMeses(per, n) {
  const [y, m] = per.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}`;
}

function distanciaMeses(desde, hasta) {
  const [y1, m1] = desde.split('-').map(Number);
  const [y2, m2] = hasta.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

const diasDelMes = (y, m) => new Date(y, m, 0).getDate();          // m: 1-12
const iso = (y, m, d) => `${y}-${dosDig(m)}-${dosDig(d)}`;

/**
 * Hoy, en la fecha del teléfono. Nunca con toISOString(): eso da UTC, y en
 * Honduras (UTC−6) a partir de las 6 de la tarde ya devuelve el día siguiente.
 */
const hoyLocal = () => {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

/** Acota un día al último día real del mes (un corte 31 en febrero es el 28/29). */
const diaValido = (y, m, dia) => Math.min(Math.max(1, num(dia) || 1), diasDelMes(y, m));

/* ---------- el mes del hogar ---------- */

/**
 * Muchos hogares no viven en meses de calendario sino en el ciclo de su
 * tarjeta: "agosto" es del 7 de agosto al 6 de septiembre, porque ese es el
 * gasto que paga el ingreso del 6. `inicio` es el día en que arranca el mes.
 *
 * Con inicio 1 se comporta como siempre: mes de calendario.
 */
const inicioMes = D => Math.min(28, Math.max(1, num(D && D.inicioMes) || 1));

/** A qué mes del hogar pertenece una fecha. */
function periodoDe(fecha, inicio) {
  const t = String(fecha || '');
  if (t.length < 10) return t.slice(0, 7);
  const [y, m, d] = t.split('-').map(Number);
  const per = `${y}-${dosDig(m)}`;
  // Antes del día de arranque, la fecha todavía pertenece al mes anterior.
  return d >= Math.max(1, inicio || 1) ? per : sumaMeses(per, -1);
}

/** Primer y último día de un mes del hogar. */
function rangoPeriodo(per, inicio) {
  const ini = Math.max(1, inicio || 1);
  const [y, m] = per.split('-').map(Number);
  if (ini === 1) return { desde: iso(y, m, 1), hasta: iso(y, m, diasDelMes(y, m)) };

  const desdeD = diaValido(y, m, ini);
  const sig = sumaMeses(per, 1);
  const [y2, m2] = sig.split('-').map(Number);
  const finD = diaValido(y2, m2, ini) - 1;

  // Si el arranque cae el día 1 del mes siguiente, el cierre es el último de este.
  if (finD < 1) return { desde: iso(y, m, desdeD), hasta: iso(y, m, diasDelMes(y, m)) };
  return { desde: iso(y, m, desdeD), hasta: iso(y2, m2, finD) };
}

/** Cuántos días dura ese mes del hogar. */
function diasPeriodo(per, inicio) {
  const r = rangoPeriodo(per, inicio);
  return Math.round((Date.parse(r.hasta) - Date.parse(r.desde)) / 86400000) + 1;
}


export { sumaMeses, distanciaMeses, diasDelMes, iso, hoyLocal, diaValido, inicioMes, periodoDe, rangoPeriodo, diasPeriodo };
