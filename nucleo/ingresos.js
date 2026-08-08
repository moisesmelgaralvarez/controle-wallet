/* ============================================================
   Ingresos: plantilla, confirmación y neto del mes

   La plantilla es una estimación; lo confirmado es un hecho. Esa
   distinción recorre toda la app: un mes sin confirmar se marca como
   estimado en todas partes para que nadie confunda una proyección con
   dinero que de verdad entró.

   Extraído de asesor.js (102-186) sin tocar una línea.
   ============================================================ */

import { num } from './base.js';
/* ---------- ingresos ---------- */

const dedTotal  = l => (l.deducciones || []).reduce((s, d) => s + num(d.monto), 0);
const netoLinea = l => (l ? num(l.bruto) - dedTotal(l) : 0);

/**
 * Línea de ingreso vigente para un mes. Si ese mes ya fue confirmado con
 * lo que realmente entró, manda lo confirmado; si no, se usa la plantilla
 * como estimación.
 */
function lineaDe(D, ev, personaId, per) {
  const mes = D.ingresosMes && D.ingresosMes[per];
  const real = mes && mes.lineas && mes.lineas[ev.id];
  if (real && real[personaId]) return real[personaId];
  return (ev.lineas || []).find(l => l.personaId === personaId);
}

/** El mes confirmado más reciente ANTES de `per` para ese pago. */
function mesConfirmadoPrevio(D, evId, per) {
  const meses = Object.keys(D.ingresosMes || {}).filter(k => {
    const m = D.ingresosMes[k];
    return k < per && m && m.confirmado && m.confirmado[evId] &&
           m.lineas && m.lineas[evId];
  }).sort();
  return meses.length ? meses[meses.length - 1] : null;
}

/**
 * Con qué rellenar el formulario de confirmación, y de dónde salió.
 *
 * El orden importa. La plantilla es lo que alguien tecleó una vez al configurar
 * la app: seis meses después ya no se parece a nada. Lo confirmado el mes
 * pasado sí — el sueldo y las retenciones se mueven poco de un mes a otro. Por
 * eso se copia de ahí y solo se cae a la plantilla si nunca se confirmó nada.
 *
 * Rellenar no es confirmar: la cifra queda propuesta y quien confirma sigue
 * siendo la persona, que es lo único que convierte una estimación en un hecho.
 */
function lineaParaConfirmar(D, ev, personaId, per) {
  const mes = (D.ingresosMes || {})[per];
  const propia = mes && mes.lineas && mes.lineas[ev.id] && mes.lineas[ev.id][personaId];
  if (propia) return { linea: propia, origen: 'mes', desde: per };

  const prev = mesConfirmadoPrevio(D, ev.id, per);
  if (prev) {
    const l = ((D.ingresosMes[prev].lineas || {})[ev.id] || {})[personaId];
    if (l) return { linea: l, origen: 'copia', desde: prev };
  }
  return { linea: (ev.lineas || []).find(l => l.personaId === personaId),
           origen: 'plantilla', desde: null };
}

const eventoConfirmado = (D, evId, per) => Boolean(
  D.ingresosMes && D.ingresosMes[per] && D.ingresosMes[per].confirmado &&
  D.ingresosMes[per].confirmado[evId]
);

/** Ingreso de un mes: real donde se confirmó, estimado donde no. */
function ingresoMes(D, per) {
  let bruto = 0, neto = 0;
  const porPersona = {}, porEvento = {}, pendientes = [];
  (D.personas || []).forEach(p => { porPersona[p.id] = 0; });

  (D.plantillaIngresos || []).forEach(ev => {
    porEvento[ev.id] = 0;
    if (!eventoConfirmado(D, ev.id, per)) pendientes.push(ev);
    (D.personas || []).forEach(p => {
      const l = lineaDe(D, ev, p.id, per);
      if (!l) return;
      const n = netoLinea(l);
      bruto += num(l.bruto);
      neto += n;
      porPersona[p.id] += n;
      porEvento[ev.id] += n;
    });
  });

  const total = (D.plantillaIngresos || []).length;
  return {
    bruto, neto, deducciones: bruto - neto, porPersona, porEvento, pendientes,
    confirmado: total > 0 && pendientes.length === 0,
    parcial: pendientes.length > 0 && pendientes.length < total
  };
}


export { dedTotal, netoLinea, lineaDe, mesConfirmadoPrevio, lineaParaConfirmar, eventoConfirmado, ingresoMes };
