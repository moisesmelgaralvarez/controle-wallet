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
import * as api from './api.js';
import { actualizar } from './escribir.js';
import { invalidarConfiguracion } from './hogar.js';
import { olvidarHistorico } from './historico.js';

/** Copia con los arreglos aparte: el motor va a mutarlos. */
/* Las cuentas y las tarjetas se copian OBJETO POR OBJETO, no solo la
   lista. El motor les escribe el saldo del banco y lo retenido, y ahora
   también agrega la tarjeta de débito que falta. Con `...D` a secas las
   dos colecciones eran las del hogar vivo: revisar un archivo sin aplicarlo
   ya cambiaba el saldo en memoria, y la tarjeta nueva caía en `D` en vez
   de en la copia — así que `tarjetasNuevas` salía vacía, la tarjeta no
   viajaba a la base, y los movimientos apuntaban a una que no existía. La
   importación entera se habría caído por la llave foránea. Lo encontró la
   prueba de la pantalla, no la del núcleo: el núcleo hacía bien su parte. */
const copiar = D => ({
  ...D,
  cuentas: (D.cuentas || []).map(c => ({ ...c })),
  tarjetas: (D.tarjetas || []).map(t => ({ ...t })),
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

  // La tarjeta de débito que el motor crea cuando la cuenta no tenía
  // ninguna. Va en la misma llamada que los movimientos que cuelgan de ella.
  const tarjetasNuevas = (copia.tarjetas || []).filter(
    t => !(D.tarjetas || []).some(x => x.id === t.id));

  const comerciosNuevos = Object.entries(copia.comercios)
    .filter(([clave, id]) => (D.comercios || {})[clave] !== id)
    .map(([clave, gastoId]) => ({ clave, gastoId }));

  return {
    cuenta,
    /* Lo que YA está anotado a mano y también viene en el archivo.
       Es la única forma de que quede duplicado: lo importado se
       reemplaza solo, pero lo manual no lo toca nadie —a propósito— y
       entonces el mismo gasto queda dos veces.

       Se emparejan por FECHA y MONTO, no por concepto: el banco
       recorta y reescribe las descripciones, pero la fecha y el monto
       no mienten. Un movimiento del archivo empareja como mucho con
       UNO manual: dos cargas de combustible de L 400 el mismo día son
       dos gastos reales, y marcar las dos borraría una de verdad. */
    duplicados: duplicadosManuales(D, lote, destino),
    rubrosNuevos,
    tarjetasNuevas,
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

/** Lo que ya está tecleado a mano para este destino en este rango. */
function manualesEnRango(D, lote, destino) {
  const ref = destino.clase + ':' + destino.id;
  const dentro = x => x.fecha >= lote.desde && x.fecha <= lote.hasta &&
                      (x.origen || 'manual') !== 'import';
  /* Un gasto tecleado a mano NO tiene `fuente`: eso lo pone la
     importación. Del lado de una cuenta, lo que lo liga a ella es la
     tarjeta de débito con que se pagó. Sin esto, una compra anotada a mano
     con el débito de Judith nunca aparecía como duplicada al importar su
     estado de cuenta, y quedaba dos veces. */
  const debitos = new Set((D.tarjetas || [])
    .filter(t => t.tipo === 'debito' && t.cuentaId === destino.id).map(t => t.id));
  const suyo = {
    movimientos: m => destino.clase === 'tarjeta'
      ? m.tarjetaId === destino.id
      : (m.fuente === ref || debitos.has(m.tarjetaId)),
    retiros: r => r.cuentaId === destino.id,
    pagos: x => x.tarjetaId === destino.id || x.cuentaId === destino.id
  };
  return [
    ...(D.movimientos || []).filter(m => dentro(m) && suyo.movimientos(m))
      .map(m => ({ tabla: 'movimientos', id: m.id, fecha: m.fecha,
                   monto: Math.abs(Number(m.monto) || 0), concepto: m.concepto || '' })),
    ...(D.retiros || []).filter(r => dentro(r) && suyo.retiros(r))
      .map(r => ({ tabla: 'retiros', id: r.id, fecha: r.fecha,
                   monto: Math.abs(Number(r.monto) || 0), concepto: r.nota || 'Retiro' })),
    ...(D.pagosTarjeta || []).filter(x => dentro(x) && suyo.pagos(x))
      .map(x => ({ tabla: 'pagos', id: x.id, fecha: x.fecha,
                   monto: Math.abs(Number(x.monto) || 0), concepto: x.nota || 'Pago de tarjeta' }))
  ];
}

/* En qué tabla queda cada renglón del archivo que SÍ se registra. Lo que
   no está aquí —ingresos, traslados propios, cuotas, reversos— se lee
   para que el archivo cuadre, pero no entra: no puede ser el duplicado de
   nada, porque no hay nada que duplicar. */
const TABLA_DEL_RENGLON = { gasto: 'movimientos', comision: 'movimientos',
                            retiro: 'retiros', pagoTarjeta: 'pagos' };

/* EL DUPLICADO SE BUSCA ENTRE COSAS DE LA MISMA CLASE.

   Se emparejaba solo por fecha y monto, sin mirar qué era cada cosa. El 6
   entra el sueldo —L 18,000— y ese mismo día se paga la tarjeta por
   L 18,000: el depósito del archivo «era» el pago anotado a mano, la
   casilla de quitar venía marcada, y la importación BORRABA el pago de
   verdad. Lo encontró la prueba de la pantalla con un CSV de ejemplo, y no
   es un caso raro: en este hogar el sueldo se va entero a la tarjeta.

   Tampoco se empareja lo que este archivo no va a registrar: un pago que
   aparece en el estado de la TARJETA no se anota desde ahí —se anota desde
   la cuenta—, así que marcar el tecleado como duplicado lo borraría sin
   poner nada en su lugar. */
function duplicadosManuales(D, lote, destino) {
  const libres = manualesEnRango(D, lote, destino).map(x => ({ ...x, usado: false }));
  const dup = [];
  for (const m of lote.movs) {
    const tabla = TABLA_DEL_RENGLON[m.tipo];
    if (!tabla || (tabla === 'pagos' && destino.clase !== 'cuenta')) continue;
    const monto = Math.round(Math.abs(m.monto) * 100) / 100;
    const par = libres.find(a => !a.usado && a.tabla === tabla && a.fecha === m.fecha &&
                                 Math.abs(Math.round(a.monto * 100) / 100 - monto) < 0.011);
    if (par) { par.usado = true; dup.push({ ...par, delBanco: m.concepto || '' }); }
  }
  return dup;
}

/* Del documento a la fila de la base. El motor habla camelCase y la
   función de la base recibe las columnas tal como se llaman. */
/**
 * Un rubro nuevo, con SU IDENTIFICADOR.
 *
 * `FILAS.gastos` no lo manda —y hace bien: al crear un rubro a mano, el
 * identificador lo pone la base—. Acá no puede ser así. El núcleo es puro,
 * no conoce la base, y a un rubro nuevo le pone un uuid que inventa el
 * navegador; ese mismo uuid ya quedó metido en el `gasto_id` de ochenta
 * movimientos y en el aprendizaje de los comercios.
 *
 * Si no viaja, Postgres asigna otro con `gen_random_uuid()`, el del
 * navegador se pierde, y todo lo que apuntaba a él queda apuntando al
 * vacío. Eso es una violación de llave foránea, que PostgREST contesta
 * con 409 y el cliente traducía como «Ese registro ya existe» — justo lo
 * contrario de lo que pasaba, y por eso costó encontrarlo.
 */
export const filaRubro = (g, orden) => ({
  id: g.id,
  concepto: g.concepto,
  monto: g.monto || 0,
  categoria: g.categoria || 'Otros',
  medio_pago: g.medioPago || 'tarjeta',
  tarjeta_id: g.medioPago === 'efectivo' ? null : (g.tarjetaId || null),
  crecimiento: g.crecimiento || 0,
  orden
});

/* Solo el identificador —el que ya traen los movimientos— y el nombre.
   El tipo y la cuenta los pone la base: de una importación solo puede
   nacer la tarjeta de débito de la cuenta que se está importando. */
export const filaTarjetaDebito = t => ({ id: t.id, nombre: t.nombre });

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

/** Los ids a borrar, repartidos por tabla como los espera la función. */
const idsAQuitar = dups => ({
  p_borrar_movimientos: dups.filter(d => d.tabla === 'movimientos').map(d => d.id),
  p_borrar_retiros:     dups.filter(d => d.tabla === 'retiros').map(d => d.id),
  p_borrar_pagos:       dups.filter(d => d.tabla === 'pagos').map(d => d.id)
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
export async function aplicar({ plan, lote, destino, hogarId, aprenderNumero, quitarDuplicados }) {
  /* Si el destino se eligió a mano porque no se reconoció solo, se le
     guarda el número que trae el archivo. Es lo que convierte «elegila
     a mano» en algo que se hace UNA vez: la próxima importación del
     mismo banco se reconoce sola. */
  if (aprenderNumero && lote.cuenta) {
    const tabla = destino.clase === 'cuenta' ? 'cuentas' : 'tarjetas';
    await actualizar(tabla, destino.id, { numero: String(lote.cuenta) });
  }

  /* LOS RUBROS Y LOS COMERCIOS VAN DENTRO DE LA MISMA LLAMADA, y antes
     iban en dos peticiones sueltas justo acá. La pantalla promete «entra
     todo o no entra nada»: era cierto dentro del RPC y mentira fuera.

     Lo que costó descubrirlo: el primer paso —crear los rubros— sí
     funcionaba y no se deshacía; el segundo se caía. Y como la recarga
     del documento va después, al reintentar el navegador seguía sin saber
     que esos rubros ya existían y los volvía a crear. Cinco intentos
     dejaron cinco copias de cada uno de los catorce rubros. Un fallo que
     se multiplica a sí mismo es peor que uno que solo falla. */

  const hecho = await api.llamar('importar_lote', {
    p_rubros: plan.rubrosNuevos.map((g, i) => filaRubro(g, 900 + i)),
    p_tarjetas: (plan.tarjetasNuevas || []).map(filaTarjetaDebito),
    p_comercios: plan.comerciosNuevos.map(c => ({ clave: c.clave, gasto_id: c.gastoId })),
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
    /* Los que se habían tecleado a mano y también vienen en el archivo.
       Van en la MISMA llamada: borrarlos aparte dejaría, si esto
       fallara después, el mes sin ese movimiento — ni el tecleado ni el
       importado. Un duplicado se ve; un hueco no. */
    ...idsAQuitar(quitarDuplicados ? plan.duplicados : []),
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
