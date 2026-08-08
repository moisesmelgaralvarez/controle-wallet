/* ============================================================
   Financiamientos: cuotas, saldo y liberaciones

   A diferencia de la tarjeta, un financiamiento SÍ resta del
   disponible: es un compromiso mensual aparte del gasto corriente.
   Y como se sabe cuántas cuotas faltan, también se sabe cuándo se
   libera ese dinero.

   Extraído de asesor.js (313-342) sin tocar una línea.
   ============================================================ */

import { num } from './base.js';
/* ---------- financiamientos ---------- */

const cuotasRestantes = f => Math.max(0, num(f.cuotasTotales) - num(f.cuotasPagadas));
const activo = f => cuotasRestantes(f) > 0 && num(f.cuotaMensual) > 0;

/** Saldo pendiente: lo que falta por pagar de las cuotas que quedan. */
const saldoFinanciamiento = f => cuotasRestantes(f) * num(f.cuotaMensual);

const deudaFinanciada = D => (D.financiamientos || []).reduce((s, f) => s + saldoFinanciamiento(f), 0);

/**
 * Cuotas vigentes k meses adelante. Los financiamientos se acaban: a los
 * 6 meses una compra a 6 cuotas ya no pesa, y el disponible sube.
 */
function cuotasEn(D, k) {
  let total = 0;
  const vivos = [];
  (D.financiamientos || []).forEach(f => {
    if (!activo(f)) return;
    if (k < cuotasRestantes(f)) { total += num(f.cuotaMensual); vivos.push(f); }
  });
  return { total, vivos };
}

/** Mes (offset) en el que se libera cada financiamiento. */
const liberaciones = D => (D.financiamientos || [])
  .filter(activo)
  .map(f => ({ nombre: f.nombre, enMeses: cuotasRestantes(f), cuota: num(f.cuotaMensual) }))
  .sort((a, b) => a.enMeses - b.enMeses);


export { cuotasRestantes, activo, saldoFinanciamiento, deudaFinanciada, cuotasEn, liberaciones };
