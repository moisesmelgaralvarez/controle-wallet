/* ============================================================
   La carta del asesor

   Junta todo lo anterior y lo dice en prosa, como lo diría alguien que
   entiende de dinero y le habla a alguien que no. Es la única parte
   del núcleo que produce texto en vez de números.

   Extraído de asesor.js (1578-1687) sin tocar una línea.
   ============================================================ */

import { fmt, nf0 } from './base.js';
import { conciliaciones } from './saldos.js';
import { resumenMes } from './proyeccion.js';
import { MESES_COLCHON, planIncompleto, saludFinanciera } from './patrimonio.js';
import { ETIQUETA_URGENCIA, TIPOS_PROYECTO, VEREDICTOS, fugasRecurrentes, priorizar } from './prioridad.js';
/* ---------- la carta del asesor ---------- */

const plural2 = (n, s, p) => `${nf0.format(n)} ${n === 1 ? s : p}`;

/**
 * Lo que escribiría un consultor caro al final del mes: dónde están parados,
 * qué hacer con el dinero de este mes, qué pasa con cada meta y una sola acción
 * concreta. Devuelve texto ya redactado —no tablas— porque el valor está en la
 * frase que ordena, no en el dato suelto, que ya está en el resto del informe.
 *
 * Cada cifra sale de lo registrado. Nada se inventa: eso es exactamente lo que
 * hace que valga tanto como el consultor y no cueste nada.
 */
function cartaAsesor(D, per) {
  const s = saludFinanciera(D, per);
  const r = resumenMes(D, per);
  const pri = priorizar(D, per);
  const fugas = fugasRecurrentes(D, per);
  const inc = planIncompleto(D, per);
  const parrafos = [];

  /* 1. Dónde están parados */
  const colchon = s.mesesColchon === null
    ? 'Todavía no puedo medirles el colchón: falta decir en qué se va el dinero.'
    : s.mesesColchon < 1
      ? `El colchón no llega ni a un mes: tienen ${fmt(s.liquido)} líquido contra ` +
        `${fmt(s.gastoMensual)} de gasto mensual. Un imprevisto entra directo a la tarjeta.`
      : `Tienen ${s.mesesColchon.toFixed(1)} meses de gastos guardados ` +
        `(${fmt(s.liquido)} contra ${fmt(s.gastoMensual)} al mes).`;

  const deuda = s.caras.length
    ? `Están revolviendo ${fmt(s.caras[0].revolvente)} en ${s.caras[0].nombre} al ` +
      `${nf0.format(s.caras[0].tasa)}% anual: ${fmt(s.interesMensual)} al mes que se van sin comprar nada.`
    : s.porPagar > 0
      ? `Deben ${fmt(s.porPagar)} en tarjetas, pero como saldan el total antes de la fecha ` +
        `límite no pagan intereses. Eso es crédito gratis y está bien usado.`
      : 'No tienen deuda cara encima.';

  parrafos.push({ titulo: 'Dónde están parados', texto:
    `${colchon} ${deuda} El disponible del mes es ${fmt(r.disponible)}` +
    (inc.hay ? ', aunque con el plan sin montos esa cifra es el ingreso entero y no significa gran cosa.' : '.') });

  /* 2. Qué hacer con el dinero de este mes */
  const pasos = [];
  if (s.caras.length) {
    pasos.push(`abonar a ${s.caras[0].nombre} todo lo que puedan: cada lempira ahí rinde ` +
               `${nf0.format(s.caras[0].tasa)}% garantizado`);
  }
  if (s.mesesColchon !== null && s.mesesColchon < MESES_COLCHON) {
    pasos.push(`llevar el colchón a ${MESES_COLCHON} meses, que son ${fmt(s.metaColchon)}; ` +
               `hoy faltan ${fmt(Math.max(0, s.metaColchon - s.liquido))}`);
  }
  const primera = pri.filas.find(f => f.veredicto === 'hazlo_ya' || f.veredicto === 'programado');
  if (primera) {
    pasos.push(`apartar ${fmt(primera.ev.cuotaSugerida)} al mes ` +
               `(${fmt(primera.ev.quincenal)} por quincena) para ${primera.p.nombre}`);
  }
  parrafos.push({ titulo: 'Qué hacer con el dinero de este mes', texto:
    pasos.length
      ? 'En este orden: ' + pasos.map((x, i) => `${i + 1}) ${x}`).join('; ') + '.'
      : 'Con la base cubierta y sin metas pendientes, lo que sobre va al colchón o a adelantar financiamientos.' });

  /* 3. El veredicto de cada proyecto, en prosa */
  if (pri.filas.length) {
    const frases = pri.filas.map(f => {
      const t = TIPOS_PROYECTO[f.tipo].etiqueta.toLowerCase();
      const plazo = f.ev.mesesSugerido === null ? 'no se alcanza en cinco años'
        : f.ev.mesesSugerido === 0 ? 'ya está'
        : `entra en ${plural2(f.ev.mesesSugerido, 'mes', 'meses')} apartando ${fmt(f.ev.cuotaSugerida)} al mes`;
      const motivo = f.porque.length ? ` — ${f.porque[0]} —` : ' —';
      const conse = f.p.consecuencia ? ` Si no se hace: ${f.p.consecuencia}.` : '';
      return `${f.p.nombre} (${t}, ${ETIQUETA_URGENCIA[f.urgencia]}): ` +
             `${VEREDICTOS[f.veredicto].toLowerCase()}${motivo} ${plazo}.${conse}`;
    });
    parrafos.push({ titulo: 'Qué toca y qué no', texto: frases.join(' ') });
  }

  /* 4. Las fugas del cierre alimentan el mes siguiente */
  if (fugas.length) {
    const f = fugas[0];
    parrafos.push({ titulo: 'Un rubro que se sale del plan todos los meses', texto:
      `${f.concepto} se pasó del plan ${plural2(f.veces, 'mes', 'meses')} seguidos, ` +
      `${fmt(f.excesoMedio)} de más en promedio. A la tercera ya no es un descuido: ` +
      `o el plan está mal puesto o hay una fuga. Subilo a ${fmt(f.sugerido)}, que es lo ` +
      `que de verdad gastan, o córtalo — pero no lo dejen como está.` });
  }

  /* 5. Una sola acción concreta */
  let accion;
  if (inc.hay) {
    accion = `Ponerle monto a los ${plural2(inc.sinMonto, 'rubro', 'rubros')} del plan que están en cero. ` +
             `Sin eso ninguna cifra de esta app significa nada.`;
  } else if (!pri.salud.mesesColchon && pri.salud.mesesColchon !== 0) {
    accion = 'Registrar los saldos de las cuentas para poder medir el colchón.';
  } else if (s.caras.length) {
    accion = `Abonar ${fmt(Math.min(r.disponible > 0 ? r.disponible : s.caras[0].revolvente, s.caras[0].revolvente))} ` +
             `a ${s.caras[0].nombre} este mes.`;
  } else if (s.mesesColchon !== null && s.mesesColchon < 1) {
    accion = `Apartar ${fmt(Math.max(0, s.gastoMensual - s.liquido))} para llegar al primer mes de colchón ` +
             `antes de comprometer nada más.`;
  } else if (primera) {
    accion = `Abrir una transferencia automática de ${fmt(primera.ev.quincenal)} por quincena para ${primera.p.nombre}.`;
  } else {
    accion = `Cerrar ${per} con las tres conciliaciones en cero y dejar sembrada la apertura del mes que viene.`;
  }
  parrafos.push({ titulo: 'La acción de este mes', texto: accion });

  return { per, parrafos, prioridades: pri.filas, salud: s, fugas, planIncompleto: inc };
}


export { cartaAsesor };
