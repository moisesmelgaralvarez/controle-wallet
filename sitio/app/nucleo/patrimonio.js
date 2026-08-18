/* ============================================================
   Patrimonio y salud financiera

   Cuánto se tiene de verdad —lo que hay menos lo que se debe— y el
   diagnóstico que sale de ahí. Es la pregunta distinta de "cuánto
   sobra este mes".

   Extraído de asesor.js (831-1015) sin tocar una línea.
   ============================================================ */

import { perDe, sumaMontos, fmt, nf0 } from './base.js';
import { deudaFinanciada } from './financiamientos.js';
import { cent, deudaTarjetas, efectivo, saldosCuentas, gastosMes } from './saldos.js';
import { presupuestoSugerido } from './sugerido.js';
import { resumenMes } from './proyeccion.js';
/* ---------- patrimonio ---------- */

/**
 * El capital total del hogar: lo que tienen menos lo que deben.
 *
 * Es la única cifra que no se puede maquillar. El disponible del mes sube y
 * baja, el saldo de una cuenta puede verse bien con la tarjeta reventada;
 * esto junta las dos caras y dice si el hogar avanza o retrocede.
 *
 * Los aportes a proyectos NO se cuentan aparte: ese dinero, si existe, ya
 * está dentro del saldo de alguna cuenta. Sumarlo sería contarlo dos veces.
 */
function patrimonio(D, per) {
  const cuentas = saldosCuentas(D, per);
  const ef = efectivo(D, per);
  // El capital se mide con el DISPONIBLE, no con el saldo en libros. Lo retenido
  // es una compra ya hecha esperando que el comercio la cobre: ese dinero ya no
  // es de ustedes, solo no ha salido todavía. Sumarlo al capital sería contar
  // como propio algo que ya se gastó.
  const enBanco = cuentas.totalDisponible;
  const enLibros = cuentas.total;
  const retenidoBanco = cuentas.totalRetenido;
  const enMano = Math.max(0, ef.saldo);

  const tarjetas = deudaTarjetas(D, per);
  const enTarjetas = tarjetas.reduce((s, t) => s + t.deuda, 0);
  const retenidoTarjetas = tarjetas.reduce((s, t) => s + t.retenido, 0);
  const enFinanciamientos = deudaFinanciada(D);

  const activos = enBanco + enMano;
  // Lo autorizado en la tarjeta también se debe aunque no esté en el corte.
  const pasivos = enTarjetas + retenidoTarjetas + enFinanciamientos;

  return {
    enBanco, enLibros, retenidoBanco, enMano, activos,
    enTarjetas, retenidoTarjetas, enFinanciamientos, pasivos,
    retenidoTotal: cent(retenidoBanco + retenidoTarjetas),
    neto: activos - pasivos,
    tarjetas,
    // Sin cuentas declaradas la cifra no significa nada y hay que decirlo.
    hayDatos: cuentas.hayDatos || ef.hayDatos || pasivos > 0,
    faltanCuentas: !cuentas.hayDatos,
    faltanSaldosTarjeta: tarjetas.some(t => !t.declarada)
  };
}

/* ---------- salud financiera ---------- */

const MESES_COLCHON = 3;   // el mínimo que recomienda cualquier manual serio

/**
 * El plan existe pero está sin llenar: hay rubros creados y gasto real
 * registrado, y ni un solo monto presupuestado. Es como queda el hogar justo
 * después de importar el primer estado de cuenta.
 *
 * Mientras eso pase, media app miente sin querer: el "disponible real" es el
 * ingreso entero, cualquier gasto "se pasa" de un presupuesto de cero, y las
 * barras de plan contra realidad salen llenas. Hay que detectarlo y decirlo,
 * no seguir dando cifras con cara de firmes.
 */
function planIncompleto(D, per) {
  const gas = gastosMes(D, 0, per);
  const gastado = sumaMontos((D.movimientos || []).filter(x => perDe(x) === per));
  return {
    hay: (D.gastos || []).length > 0 && gas.total <= 0 && gastado > 0,
    rubros: gas.detalle.length,
    sinMonto: gas.detalle.filter(g => g.monto <= 0).length,
    plan: gas.total, gastado
  };
}

/**
 * El diagnóstico que un asesor daría en la primera cita, y en el orden en
 * que lo daría. No es opinión: es aritmética.
 *
 * El orden importa más que cualquier consejo suelto. Apartar dinero para un
 * proyecto mientras se revuelve una tarjeta al 50% anual es perder dinero
 * todos los meses, por muy disciplinado que se sienta.
 */
function saludFinanciera(D, per) {
  const p = patrimonio(D, per);
  const r = resumenMes(D, per);

  // Con el plan sin montos —lo normal justo después de importar— esto daba 0,
  // el colchón salía null y TODO el diagnóstico desaparecía: quedaba un "van
  // bien" solitario con el banco en 662 lempiras. Si no hay plan pero sí hay
  // gasto real, se mide contra lo que de verdad gastan, que es más honesto que
  // callarse.
  let gastoMensual = r.gastos + r.cuotas;
  let baseReal = false;
  if (gastoMensual <= 0) {
    const real = presupuestoSugerido(D, per, 12).medianaTotal || 0;
    if (real > 0) { gastoMensual = real + r.cuotas; baseReal = true; }
  }

  const liquido = p.enBanco + p.enMano;
  const mesesColchon = gastoMensual > 0 ? liquido / gastoMensual : null;

  // Solo cuesta lo que se revuelve. Un saldo que se salda completo cada mes
  // no paga intereses por muy alta que sea la tasa del contrato.
  const caras = p.tarjetas.filter(t => t.revolvente > 0 && t.tasa > 0)
    .sort((a, b) => b.tasa - a.tasa);
  const interesMensual = caras.reduce((s, t) => s + t.interesMensual, 0);

  const alContado = p.tarjetas.filter(t => t.pagaTotal && t.deuda > 0);
  const porPagar = alContado.reduce((s, t) => s + t.deuda, 0);

  const disponibleReal = r.disponible - interesMensual;
  const pasos = [];

  // Cuando se paga el total, el riesgo no es el interés: es el mes en que el
  // ingreso no alcance el corte. Ahí se rompe la racha y empieza a costar.
  const cubreElCorte = liquido + r.neto >= porPagar;

  /* LAS TARJETAS QUE DICEN PAGARSE AL CONTADO Y DEBEN MÁS DE LO QUE ESO
     EXPLICA.

     `deudaTarjeta` compara la deuda de hoy contra dos meses de consumo
     típico de esa misma tarjeta. Lo que sobra no lo explica la ventana de
     gracia: quedó revolviendo. Es una sospecha con número, no un hecho, y
     por eso NO entra en `interesMensual` —que sigue midiendo solo lo
     declarado— sino en su propio renglón.

     Mientras haya una racha en duda, la app deja de decir «no pagan un
     lempira de interés». Esa frase es la afirmación más fuerte de todo el
     diagnóstico y no puede salir de una casilla marcada una vez. */
  const rachaRota = p.tarjetas
    .filter(t => t.arrastreSinDeclarar > 0 && t.tasa > 0)
    .sort((a, b) => b.interesLatente - a.interesLatente);
  const interesLatente = rachaRota.reduce((s, t) => s + t.interesLatente, 0);

  if (rachaRota.length) {
    const t = rachaRota[0];
    pasos.push({
      orden: pasos.length + 1, clave: 'racha-rota', nivel: 'critical',
      titulo: `Revisen el estado de cuenta de ${t.nombre}`,
      texto: `Está marcada como «se paga completa cada mes», pero deben ${fmt(t.deuda)} ` +
             `y en esa tarjeta se cargan ${fmt(t.cargoMensual)} en un mes típico. ` +
             `Sobran ${fmt(t.arrastreSinDeclarar)} que la ventana de gracia no explica: ` +
             `o falta registrar un pago, o ese saldo se quedó revolviendo. Si se quedó, ` +
             `al ${nf0.format(t.tasa)}% cuesta ${fmt(t.interesLatente)} al mes ` +
             `—${fmt(t.interesLatente * 12)} al año— y esta app lo está contando como cero. ` +
             `Compruébenlo en el estado de cuenta antes que cualquier otra cosa de esta lista.`
    });
  }

  if (porPagar > 0 && !caras.length && !rachaRota.length) {
    pasos.push({
      orden: pasos.length + 1, clave: 'racha', nivel: 'good',
      titulo: 'Van bien: la tarjeta no les cuesta nada',
      texto: `Deben ${fmt(porPagar)}, pero al saldar el total antes de la fecha límite ` +
             `no pagan un lempira de interés. Eso es crédito gratis y es exactamente ` +
             `como debe usarse. Lo que hay que cuidar es la racha: el mes que el ingreso ` +
             `no alcance el corte, empieza a correr la tasa sobre todo el saldo.`
    });
  }

  if (mesesColchon !== null && mesesColchon < 1) {
    pasos.push({
      orden: pasos.length + 1, clave: 'colchon', nivel: porPagar > 0 ? 'critical' : 'serious',
      titulo: porPagar > 0 ? 'Lo que protege esa racha es el colchón'
                           : 'Primero: un mes de gastos guardado',
      texto: `Hoy tienen ${fmt(liquido)} líquido contra ${fmt(gastoMensual)} de gasto mensual: ` +
             `${mesesColchon < 0.05 ? 'menos de una semana' : Math.round(mesesColchon * 30) + ' días'} de margen. ` +
             (porPagar > 0
               ? `Si un mes las comisiones bajan y no cubren el corte, tocaría revolver ` +
                 `${fmt(porPagar)} y ahí sí empieza el interés. Juntar ${fmt(Math.max(0, gastoMensual - liquido))} ` +
                 `más es lo que compra esa tranquilidad.`
               : `Antes que cualquier proyecto, junten ${fmt(Math.max(0, gastoMensual - liquido))} más.`)
    });
  }

  if (caras.length) {
    const t = caras[0];
    pasos.push({
      orden: pasos.length + 1, clave: 'deuda', nivel: 'critical',
      titulo: `Saldar lo que revuelve en ${t.nombre}`,
      texto: `Revuelven ${fmt(t.revolvente)} al ${nf0.format(t.tasa)}% anual: ${fmt(t.interesMensual)} ` +
             `al mes —${fmt(t.interesAnual)} al año— sin comprar nada. Cada lempira que abonen ahí ` +
             `rinde ${nf0.format(t.tasa)}% garantizado, más que cualquier proyecto.`
    });
  }

  if (mesesColchon !== null && mesesColchon >= 1 && mesesColchon < MESES_COLCHON) {
    pasos.push({
      orden: pasos.length + 1, clave: 'colchon3', nivel: 'serious',
      titulo: `Llegar a ${MESES_COLCHON} meses de colchón`,
      texto: `Tienen ${mesesColchon.toFixed(1)} meses cubiertos. Para llegar a ${MESES_COLCHON} ` +
             `faltan ${fmt(gastoMensual * MESES_COLCHON - liquido)}. Es lo que separa un susto ` +
             `de una crisis.`
    });
  }

  if (!pasos.length && r.disponible > 0) {
    pasos.push({
      orden: 1, clave: 'metas', nivel: 'good',
      titulo: 'Base cubierta: ahora sí, los proyectos',
      texto: `Tienen ${mesesColchon === null ? 'colchón' : mesesColchon.toFixed(1) + ' meses de gastos'} ` +
             `guardados y sin deuda cara encima. Este es el momento de comprometer el disponible ` +
             `en metas, que es para lo que sirve.`
    });
  }

  return {
    liquido, gastoMensual, mesesColchon,
    // `baseReal`: el gasto mensual no salió del plan sino de lo gastado de
    // verdad, porque el plan está sin montos. Hay que decirlo al pintarlo.
    baseReal,
    metaColchon: gastoMensual * MESES_COLCHON,
    caras, interesMensual, interesAnual: interesMensual * 12,
    /* Las que dicen pagarse al contado y deben más de lo que eso explica, y
       lo que costaría al mes si de verdad se quedó revolviendo. Va aparte
       de `interesMensual` a propósito: una sospecha bien fundada no es un
       hecho, y mezclarlas convertiría el diagnóstico en una adivinanza. */
    rachaRota, interesLatente,
    alContado, porPagar, cubreElCorte,
    disponibleReal, disponibleDeclarado: r.disponible,
    mordidaInteres: r.disponible > 0 ? interesMensual / r.disponible : 0,
    pasos, patrimonio: p
  };
}


export { patrimonio, MESES_COLCHON, planIncompleto, saludFinanciera };
