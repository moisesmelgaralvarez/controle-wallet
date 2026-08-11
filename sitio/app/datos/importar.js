/* ============================================================
   Importar un estado de cuenta contra el servidor.

   El motor entero —leer el PDF cifrado de BAC, el CSV, clasificar
   cada renglón, decidir el rubro— vive en `nucleo/importar.js` y está
   probado desde la app anterior. Aquí no se reimplementa nada de eso.

   CÓMO SE REUSA EL MOTOR SIN COPIARLO

   `aplicarLote` está escrito para el mundo viejo: recibe el documento
   del hogar y lo MUTA, borrando de los arreglos e insertando. Traducir
   eso a la base podría hacerse reescribiendo la clasificación aquí,
   pero entonces habría dos aritméticas y tarde o temprano darían dos
   respuestas distintas.

   Así que se le da una COPIA del documento, se le deja hacer su
   trabajo, y después se mira qué apareció. Lo que el motor decidió es
   exactamente lo que se escribe: él sigue siendo la única autoridad
   sobre qué es un gasto, qué es un retiro y a qué rubro va cada cosa.

   QUÉ SE ESCRIBE, Y EN QUÉ ORDEN

   1. Los RUBROS NUEVOS que el motor inventó al clasificar. Van
      primero porque los movimientos apuntan a ellos.
   2. Los COMERCIOS aprendidos: comercio → rubro, para que la próxima
      vez no haya que adivinar.
   3. El DINERO —movimientos, retiros, pagos— en una sola transacción,
      con `importar_lote`.

   Los dos primeros van sueltos a propósito. Son aditivos e inofensivos
   si el tercero falla: quedaría un rubro vacío y un comercio aprendido,
   los dos visibles y editables, y reimportar los reutiliza. El dinero
   NO puede quedar a medias, y por eso es el único que va dentro de una
   transacción. Ver el encabezado de la migración.
   ============================================================ */

import * as A from '../nucleo/index.js';
import { periodoDe } from '../nucleo/fechas.js';
import { FILAS } from './filas.js';
import * as api from './api.js';
import { crearVarias, fusionar, actualizar } from './escribir.js';
import { invalidarConfiguracion } from './hogar.js';
import { olvidarHistorico } from './historico.js';

/** Copia con los arreglos aparte: el motor va a mutarlos. */
const copiar = D => ({
  ...D,
  gastos: [...(D.gastos || [])],
  movimientos: [...(D.movimientos || [])],
  retiros: [...(D.retiros || [])],
  pagosTarjeta: [...(D.pagosTarjeta || [])],
  comercios: { ...(D.comercios || {}) }
});

/**
 * Lo que el motor necesita del mundo exterior.
 *
 * El núcleo es puro: no sabe de relojes ni de generadores de
 * identificadores. Se los damos aquí, que es la frontera.
 */
const ayudaPara = D => ({
  uid: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
  periodoDe: fecha => periodoDe(fecha, A.inicioMes(D)),
  // Con qué tarjeta de débito se gasta desde esta cuenta, para que un
  // consumo del estado de cuenta quede colgado de la tarjeta correcta.
  debitoDe: cuentaId => ((D.tarjetas || [])
    .find(t => t.tipo === 'debito' && t.cuentaId === cuentaId) || {}).id || null,
  tarjetaCredito: () => (D.tarjetas || [])
    .find(t => (t.tipo || 'credito') === 'credito') || null
});

/** Las filas que el motor agregó a una colección, por su lote. */
const nuevasDe = (despues, antes, archivo) => {
  const yaEstaban = new Set(antes.map(x => x.id));
  return despues.filter(x => !yaEstaban.has(x.id) && x.lote === archivo);
};

/**
 * Prepara la importación sin escribir nada.
 *
 * Se separa de `aplicar` para que la pantalla pueda enseñar lo que va
 * a pasar —cuántos gastos, cuántos retiros, qué rubros nuevos— antes
 * de que nadie toque la base. Un importador que escribe primero y
 * enseña después no se puede revisar.
 */
export function preparar({ D, lote, destino }) {
  const copia = copiar(D);
  const ayuda = ayudaPara(copia);
  const cuenta = A.aplicarLote(copia, lote, destino, ayuda);

  const rubrosNuevos = copia.gastos.filter(
    g => !(D.gastos || []).some(x => x.id === g.id));

  const comerciosNuevos = Object.entries(copia.comercios)
    .filter(([clave, id]) => (D.comercios || {})[clave] !== id)
    .map(([clave, gastoId]) => ({ clave, gastoId }));

  return {
    cuenta,
    rubrosNuevos,
    comerciosNuevos,
    movimientos: nuevasDe(copia.movimientos, D.movimientos || [], lote.archivo),
    retiros: nuevasDe(copia.retiros, D.retiros || [], lote.archivo),
    pagos: nuevasDe(copia.pagosTarjeta, D.pagosTarjeta || [], lote.archivo),
    // Cuántas filas de importaciones anteriores va a reemplazar. La
    // base lo dirá exacto; esto es para poder avisarlo antes.
    reemplaza: [...(D.movimientos || []), ...(D.retiros || []), ...(D.pagosTarjeta || [])]
      .filter(x => x.origen === 'import' &&
                   x.fuente === destino.clase + ':' + destino.id &&
                   x.fecha >= lote.desde && x.fecha <= lote.hasta).length
  };
}

/* Del documento a la fila de la base. El motor habla camelCase y la
   función de la base recibe las columnas tal como se llaman. */
const filaMovimiento = m => ({
  fecha: m.fecha, periodo: m.periodo, monto: m.monto, concepto: m.concepto || '',
  /* `'otros'` NO es un rubro: es lo que el motor devuelve cuando no
     supo clasificar. En la app anterior vivía como texto dentro del
     documento y no molestaba; aquí la columna es una clave foránea y
     mandar la palabra reventaría el INSERT entero — o sea la
     importación completa, por un solo renglón que el banco escribió
     raro. Sin rubro es NULO, y el cierre de mes ya lo vuelve a leer
     como «Sin clasificar». */
  gasto_id: (m.gastoId && m.gastoId !== 'otros') ? m.gastoId : null,
  persona_id: m.personaId || null,
  medio_pago: m.medioPago || 'tarjeta', tarjeta_id: m.tarjetaId || null
});

const filaRetiro = r => ({
  fecha: r.fecha, periodo: r.periodo, monto: r.monto,
  cuenta_id: r.cuentaId || null, persona_id: r.personaId || null, nota: r.nota || ''
});

const filaPago = p => ({
  fecha: p.fecha, periodo: p.periodo, monto: p.monto,
  tarjeta_id: p.tarjetaId || null, cuenta_id: p.cuentaId || null, nota: p.nota || ''
});

/**
 * El saldo que el banco declara, que NO se llama igual en los dos casos.
 *
 * Un estado de cuenta trae `saldoFin`; el de una tarjeta trae
 * `saldoCorte`, porque en la tarjeta lo que hay al final del ciclo no
 * es un saldo a favor sino lo que se debe. Leer solo `saldoFin` deja
 * la tarjeta SIN ancla y sin un solo error a la vista: la importación
 * entra completa, se ve bien, y el patrimonio se queda sin la única
 * cifra que permite calcularlo sin bajarse el histórico entero. Se
 * descubrió importando un estado de cuenta de verdad.
 */
const anclaDe = lote =>
  (lote.tipo === 'tarjeta' ? lote.saldoCorte : lote.saldoFin) ?? null;

/**
 * Escribe lo preparado.
 *
 * Devuelve lo que la BASE dice que pasó, no lo que el navegador creía
 * que iba a pasar: cuántas filas se reemplazaron de verdad y cuántas
 * entraron. Si algo no coincide, se ve.
 */
export async function aplicar({ plan, lote, destino, hogarId, aprenderNumero }) {
  /* Si el destino se eligió a mano porque no se reconoció solo, se le
     guarda el número que trae el archivo. Es lo que convierte «elegila
     a mano» en algo que se hace UNA vez: la próxima importación del
     mismo banco se reconoce sola. */
  if (aprenderNumero && lote.cuenta) {
    const tabla = destino.clase === 'cuenta' ? 'cuentas' : 'tarjetas';
    await actualizar(tabla, destino.id, { numero: String(lote.cuenta) });
  }

  if (plan.rubrosNuevos.length) {
    await crearVarias('gastos', plan.rubrosNuevos.map((g, i) =>
      FILAS.gastos(g, { hogarId, orden: 900 + i })));
  }

  if (plan.comerciosNuevos.length) {
    await fusionar('comercios',
      plan.comerciosNuevos.map(c => ({ hogar_id: hogarId, clave: c.clave, gasto_id: c.gastoId })),
      'hogar_id,clave');
  }

  const hecho = await api.llamar('importar_lote', {
    p_destino_clase: destino.clase,
    p_destino_id: destino.id,
    p_desde: lote.desde,
    p_hasta: lote.hasta,
    p_lote: lote.archivo,
    p_movimientos: plan.movimientos.map(filaMovimiento),
    p_retiros: plan.retiros.map(filaRetiro),
    p_pagos: plan.pagos.map(filaPago),
    // El banco manda sobre el saldo: el ancla se pone sola con la
    // fecha de corte del archivo, en vez de tecleada y desfasada.
    p_saldo_banco: anclaDe(lote),
    p_retenido: lote.retenido ?? null
  });

  /* La importación toca meses enteros y cambia los saldos, así que lo
     que hubiera en memoria dejó de valer todo, no solo el mes en
     curso. Va aquí y no en la pantalla porque olvidar a mano funciona
     hasta que alguien se olvida una vez. */
  invalidarConfiguracion();
  olvidarHistorico();

  return hecho;
}
