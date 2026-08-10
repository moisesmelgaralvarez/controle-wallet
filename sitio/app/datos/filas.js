/* ============================================================
   De formulario a fila.

   El camino de vuelta del armador. Aquel toma las filas de la base y
   arma el documento que el núcleo espera; este toma lo que alguien
   escribió en un formulario y arma la fila que la base espera.

   POR QUÉ VIVE APARTE DE LA PANTALLA:

   Aquí se cruza la frontera entre dos idiomas. El formulario habla
   como la gente —`saldoInicial`, `diaCorte`— y la base habla
   `snake_case`. Escribir mal un nombre de columna se siente barato
   porque PostgREST lo rechaza con un 400… pero lo rechaza en la cara
   de quien acaba de darle a Guardar, y solo si alguien probó ESE
   formulario a mano.

   Siendo funciones puras y sin pantalla, hay una prueba que las llama
   a todas y comprueba, contra las migraciones, que cada columna que
   escriben existe de verdad.

   Y hacen algo más: recortan. Cada `check` del esquema tiene aquí su
   recorte, para que un número fuera de rango se convierta en uno
   válido antes de salir y no en un error del servidor.
   ============================================================ */

import { hoyLocal } from '../nucleo/fechas.js';

const entre = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
const noNeg = n => Math.max(0, Number(n) || 0);
const entero = (n, min, max) => entre(Math.round(Number(n) || 0), min, max);

/** ¿Escribieron algo en este campo? El cero SÍ es una respuesta. */
export const dijoAlgo = v => v !== '' && v !== null && v !== undefined;

/**
 * Las anclas de conciliación de una cuenta o una tarjeta.
 *
 * Van solo si las escribieron. Un campo en blanco significa «no lo
 * toqués», que es lo que conserva lo que dejó el importador de
 * estados de cuenta — casi siempre más fresco que la memoria de uno.
 * El cero, en cambio, es un dato: quiere decir «ya no hay nada
 * retenido».
 */
function anclas(d) {
  const f = {};
  if (dijoAlgo(d.retenido)) {
    f.retenido_monto = noNeg(d.retenido);
    f.retenido_fecha = hoyLocal();
  }
  if (dijoAlgo(d.saldoBanco) && d.saldoBancoFecha) {
    f.saldo_banco_monto = noNeg(d.saldoBanco);
    f.saldo_banco_fecha = d.saldoBancoFecha;
  }
  return f;
}

export const FILAS = {

  hogares: d => ({
    nombre: d.nombre,
    moneda: d.moneda,
    // La base solo acepta del 1 al 28: un mes que arranque el 30 no
    // existe en febrero.
    inicio_mes: entero(d.inicioMes || 1, 1, 28)
  }),

  personas: (d, ctx) => ({
    hogar_id: ctx.hogarId,
    nombre: d.nombre,
    cuenta_id: d.cuentaId || null
  }),

  cuentas: (d, ctx) => ({
    hogar_id: ctx.hogarId,
    nombre: d.nombre,
    numero: d.numero || null,
    saldo_inicial: Number(d.saldoInicial) || 0,
    desde_mes: d.desdeMes,
    ...anclas(d)
  }),

  tarjetas: (d, ctx) => ({
    hogar_id: ctx.hogarId,
    nombre: d.nombre,
    numero: d.numero || null,
    tipo: d.tipo || 'credito',
    // La de débito sale de la cuenta en el momento: no tiene ciclo, y
    // exigirle un corte obligaba a inventarse un día para poder
    // guardar. Se limpia al cambiar de tipo para que no arrastre el
    // corte de cuando era de crédito.
    dia_corte: d.tipo === 'debito' ? null : entero(d.diaCorte, 1, 31),
    // En blanco se queda en blanco. Escribir un 0 donde no había nada
    // no cambia ningún cálculo —el armador lo lee como 0 de todos
    // modos— pero rompe la regla que sí importa: guardar un formulario
    // sin tocarlo no puede modificar ni un campo.
    dia_pago: dijoAlgo(d.diaPago) ? entero(d.diaPago, 0, 31) : null,
    paga_con: d.pagaCon || null,
    cuenta_id: d.cuentaId || null,
    saldo_inicial: noNeg(d.saldoInicial),
    desde_mes: d.desdeMes || null,
    paga_total: d.pagaTotal !== 'no',
    tasa_anual: entre(d.tasaAnual, 0, 200),
    ...anclas(d)
  }),

  gastos: (d, ctx) => ({
    hogar_id: ctx.hogarId,
    concepto: d.concepto,
    monto: noNeg(d.monto),
    categoria: d.categoria || 'Otros',
    medio_pago: d.medioPago,
    // En efectivo la tarjeta no pinta nada.
    tarjeta_id: d.medioPago === 'efectivo' ? null : (d.tarjetaId || null),
    crecimiento: entre(d.crecimiento, 0, 20),
    // El orden solo viaja al crear. Mandarlo al editar movería el
    // rubro de sitio cada vez que alguien corrige un monto.
    ...(ctx.orden == null ? {} : { orden: ctx.orden })
  }),

  financiamientos: (d, ctx) => {
    const totales = entero(d.cuotasTotales, 0, 600);
    return {
      hogar_id: ctx.hogarId,
      nombre: d.nombre,
      cuota_mensual: noNeg(d.cuotaMensual),
      cuotas_totales: totales,
      // Más pagadas que totales dejaría cuotas restantes en negativo y
      // un financiamiento que nunca se libera.
      cuotas_pagadas: entero(d.cuotasPagadas, 0, totales)
    };
  },

  plantilla_ingresos: (d, ctx) => ({
    hogar_id: ctx.hogarId,
    nombre: d.nombre,
    dia: entero(d.dia, 1, 31)
  }),

  plantilla_lineas: (l, ctx) => ({
    hogar_id: ctx.hogarId,
    plantilla_id: ctx.plantillaId,
    persona_id: l.personaId,
    bruto: noNeg(l.bruto),
    deducciones: l.deducciones
  }),

  proyectos: (d, ctx) => {
    // Con un solo costo escrito, ese vale por los dos: el rango es una
    // comodidad para cuando no hay cotización firme, no una obligación.
    let min = noNeg(d.costoMin), max = noNeg(d.costoMax);
    if (max <= 0) max = min;
    if (min <= 0) min = max;
    if (min > max) [min, max] = [max, min];

    return {
      hogar_id: ctx.hogarId,
      nombre: d.nombre,
      costo_min: min,
      costo_max: max,
      aporte_mensual: noNeg(d.aporteMensual),
      // El formulario pregunta por un MES y la columna guarda una fecha:
      // se ancla al día 1. `evaluarProyecto` vuelve a recortar a `YYYY-MM`,
      // así que el día no participa de ningún cálculo.
      fecha_objetivo: d.fechaObjetivo ? `${d.fechaObjetivo}-01` : null,
      nota: d.nota || null,
      tipo: d.tipo || 'deseo',
      urgencia: d.urgencia || 'algun_dia',
      consecuencia: d.consecuencia || null,
      ...(ctx.orden == null ? {} : { orden: ctx.orden })
    };
  },

  /**
   * Lo que de verdad entró, para una persona en un pago de un mes.
   *
   * `copiado_de` lleva el mes del que salió la cifra cuando vino del
   * atajo, y va en `null` cuando alguien la confirmó mirándola. Se
   * escribe SIEMPRE —no se omite— porque confirmar a mano encima de
   * una copia tiene que borrar la marca: omitir la columna en un
   * upsert la dejaría puesta, y el pago seguiría diciendo «sin
   * revisar» después de que alguien lo revisó.
   */
  ingresos_mes: (l, ctx) => ({
    hogar_id: ctx.hogarId,
    periodo: ctx.periodo,
    plantilla_id: ctx.plantillaId,
    persona_id: l.personaId,
    bruto: noNeg(l.bruto),
    deducciones: l.deducciones,
    confirmado: true,
    copiado_de: ctx.copiadoDe || null
  }),

  aportes: (d, ctx) => ({
    hogar_id: ctx.hogarId,
    proyecto_id: ctx.proyectoId,
    persona_id: d.personaId || null,
    fecha: d.fecha,
    monto: noNeg(d.monto),
    nota: d.nota || null
  })
};
