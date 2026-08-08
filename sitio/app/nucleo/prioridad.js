/* ============================================================
   Priorizar por mérito, no por flujo de caja

   Sin saber qué tan necesario es un proyecto, ningún motor puede
   ordenarlos por otra cosa que si el dinero alcanza. Aquí entra el
   juicio: tipo, urgencia y consecuencia de no hacerlo. También salen
   las fugas recurrentes — lo que se va mes a mes sin que nadie lo
   haya decidido.

   Extraído de asesor.js (1420-1577) sin tocar una línea.
   ============================================================ */

import { num, fmt, nf0 } from './base.js';
import { sumaMeses } from './fechas.js';
import { cent, cierreDeMes, mesCongelado } from './saldos.js';
import { mediana } from './sugerido.js';
import { evaluarProyecto } from './proyeccion.js';
import { saludFinanciera } from './patrimonio.js';
/* ---------- priorizar por mérito, no por flujo ---------- */

/**
 * El tipo de necesidad ancla la prioridad, y los pesos son deliberados:
 * la distancia entre `salud` y `deseo` es tan grande que ninguna combinación
 * de urgencia puede saltarla. Ese es justo el punto — con el motor viejo, un
 * iPhone con el dinero suelto salía "Viable" y una urgencia dental sin ahorro
 * salía "No viable", que es exactamente al revés de lo que diría un asesor.
 */
const TIPOS_PROYECTO = {
  salud:      { peso: 1000, etiqueta: 'Salud' },
  seguridad:  { peso: 800,  etiqueta: 'Seguridad' },
  esencial:   { peso: 500,  etiqueta: 'Esencial' },
  productivo: { peso: 350,  etiqueta: 'Productivo' },
  deseo:      { peso: 100,  etiqueta: 'Deseo' }
};
const URGENCIAS = { ya: 200, este_ano: 80, algun_dia: 0 };
const ETIQUETA_URGENCIA = { ya: 'no puede esperar', este_ano: 'este año', algun_dia: 'algún día' };

const tipoDe = p => TIPOS_PROYECTO[p.tipo] ? p.tipo : 'deseo';
const urgenciaDe = p => URGENCIAS[p.urgencia] != null ? p.urgencia : 'algun_dia';
const esNecesidad = p => tipoDe(p) === 'salud' || tipoDe(p) === 'seguridad';

/**
 * Ordena la cartera por MÉRITO y reparte el disponible en ese orden.
 *
 * Las penalizaciones son grandes a propósito: no se trata de matizar un poco
 * el orden, sino de que un gusto no pueda adelantarse a la base. Un `deseo` con
 * el colchón vacío cae 600 puntos, que lo deja por debajo de cualquier cosa
 * esencial aunque tenga el dinero junto y la otra no.
 */
function priorizar(D, per) {
  const s = saludFinanciera(D, per);
  const colchonFlaco = s.mesesColchon !== null && s.mesesColchon < 1;
  const deudaCara = s.caras.length > 0;

  const puntuados = (D.proyectos || []).map((p, orden) => {
    const tipo = tipoDe(p), urgencia = urgenciaDe(p);
    let puntaje = TIPOS_PROYECTO[tipo].peso + URGENCIAS[urgencia];
    const porque = [];

    if (esNecesidad(p)) {
      porque.push(`${TIPOS_PROYECTO[tipo].etiqueta.toLowerCase()}: va antes que cualquier gusto`);
    }
    if (tipo === 'deseo' && colchonFlaco) {
      puntaje -= 600;
      porque.push(`es un gusto y no hay ni un mes de colchón (faltan ${fmt(Math.max(0, s.gastoMensual - s.liquido))})`);
    }
    if (!esNecesidad(p) && deudaCara) {
      puntaje -= 400;
      const t = s.caras[0];
      porque.push(`abonar a ${t.nombre} rinde ${nf0.format(t.tasa)}% garantizado (${fmt(t.interesMensual)} al mes)`);
    }
    if (urgencia === 'ya' && !esNecesidad(p)) {
      porque.push('marcado como urgente, pero no es salud ni seguridad');
    }
    return { p, tipo, urgencia, puntaje, porque, orden };
  });

  // A igual mérito manda la urgencia y después el costo menor: terminar antes
  // una meta barata libera la cola para la siguiente.
  puntuados.sort((a, b) =>
    b.puntaje - a.puntaje ||
    URGENCIAS[b.urgencia] - URGENCIAS[a.urgencia] ||
    (num(a.p.costoMax) || num(a.p.costoMin)) - (num(b.p.costoMax) || num(b.p.costoMin)) ||
    a.orden - b.orden);

  // La cascada reparte en el orden de MÉRITO, no en el de la lista, para que lo
  // que de verdad va primero reserve primero.
  let comprometido = 0;
  const filas = puntuados.map((x, i) => {
    const ev = evaluarProyecto(D, x.p, per, comprometido);
    if (ev.faltaMax > 0) {
      comprometido += num(x.p.aporteMensual) > 0 ? num(x.p.aporteMensual) : ev.cuotaSugerida;
    }
    const veredicto = veredictoDe(x, ev, i, colchonFlaco, deudaCara);
    return Object.assign({}, x, { ev, veredicto, posicion: i + 1 });
  });

  return {
    filas, porId: filas.reduce((m, f) => { m[f.p.id] = f; return m; }, {}),
    colchonFlaco, deudaCara, salud: s
  };
}

const VEREDICTOS = {
  hazlo_ya:      'Hazlo ya',
  programado:    'Programado',
  puede_esperar: 'Puede esperar',
  reconsiderar:  'Reconsideralo',
  logrado:       'Alcanzado'
};

function veredictoDe(x, ev, i, colchonFlaco, deudaCara) {
  if (ev.faltaMax <= 0) return 'logrado';
  // Un gusto con la base sin cubrir se reconsidera aunque el flujo diera de sobra:
  // el trueque —lo que cuesta postergarlo contra lo que cuesta no tener colchón—
  // no lo gana nunca.
  if (x.tipo === 'deseo' && (colchonFlaco || deudaCara)) return 'reconsiderar';
  if (esNecesidad(x.p) && x.urgencia === 'ya') return 'hazlo_ya';
  if (ev.disponible <= 0 || ev.sinMargen || ev.mesesSugerido === null) return 'puede_esperar';
  if (i === 0 || ev.cuotaSugerida > 0) return 'programado';
  return 'puede_esperar';
}

/**
 * Evalúa TODOS los proyectos repartiendo el disponible en cascada. El orden ya
 * no es el de la lista sino el de mérito, que es el que decide priorizar().
 */
function evaluarCartera(D, desde) {
  const out = {};
  priorizar(D, desde).filas.forEach(f => {
    out[f.p.id] = Object.assign({}, f.ev, {
      // Dos capas que conviene no confundir: `flujo` dice si el dinero alcanza
      // (lo que siempre calculó evaluarProyecto) y `veredicto` dice si además
      // conviene hacerlo ahora. Un deseo puede tener flujo "viable" y veredicto
      // "reconsiderar" al mismo tiempo, y esa tensión es justo la información.
      flujo: f.ev.veredicto,
      veredicto: f.veredicto, puntaje: f.puntaje, porque: f.porque,
      posicion: f.posicion, tipo: f.tipo, urgencia: f.urgencia
    });
  });
  return out;
}

/**
 * Rubros que se pasan del plan mes tras mes. A la tercera deja de ser un
 * descuido: o el plan está mal puesto o hay una fuga, y las dos cosas se
 * arreglan, pero no solas.
 */
function fugasRecurrentes(D, per, minimo = 3) {
  const meses = [];
  for (let k = 1; k <= 6 && meses.length < 6; k++) {
    const p = sumaMeses(per, -k);
    if (mesCongelado(D, p)) meses.push(p);
  }
  if (!meses.length) return [];

  const racha = {};
  meses.forEach(p => {
    cierreDeMes(D, p).filas.forEach(f => {
      if (f.gastoId === 'otros') return;
      racha[f.gastoId] = racha[f.gastoId] || { gastoId: f.gastoId, concepto: f.concepto, veces: 0, exceso: 0, real: [] };
      if (f.excedido) { racha[f.gastoId].veces++; racha[f.gastoId].exceso += f.diferencia; }
      racha[f.gastoId].real.push(f.real);
    });
  });

  return Object.values(racha)
    .filter(x => x.veces >= minimo)
    .map(x => Object.assign(x, {
      // Lo que de verdad gastan, para poder decir a cuánto subir el plan.
      sugerido: Math.round(mediana(x.real)),
      excesoMedio: cent(x.exceso / x.veces)
    }))
    .sort((a, b) => b.exceso - a.exceso);
}


export { TIPOS_PROYECTO, URGENCIAS, VEREDICTOS, ETIQUETA_URGENCIA, tipoDe, urgenciaDe, priorizar, evaluarCartera, fugasRecurrentes };
