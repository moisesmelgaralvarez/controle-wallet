/* ============================================================
   Cerrar un mes: los dos escritos, y en el orden que importa.

   Cerrar no es marcar una casilla. Son dos filas en dos meses
   distintos:

     1. La del mes que se cierra, con su plan congelado, las
        justificaciones de lo que se pasó y los ajustes que cuadran
        las tres conciliaciones.
     2. La del mes SIGUIENTE, a la que se le siembra la apertura:
        saldo final = saldo inicial, sin huecos.

   AQUÍ NO SE CALCULA NADA, Y ESO ES DELIBERADO

   Este módulo no recibe el documento del hogar. No es una cuestión de
   estilo: `saldosCierre` recorre toda la vida del hogar, y el
   navegador solo baja el mes en curso. Un módulo que tuviera `D` a
   mano podría calcular el arranque del mes siguiente con un doceavo
   de los datos, sembrar una cifra falsa, y no habría pantalla donde
   se viera mal — las cuentas dejarían de cuadrar meses después, sin
   un solo error. Así que los números llegan ya calculados desde la
   Edge Function (`paraCerrar`) y aquí solo se decide qué se escribe y
   en qué orden.

   POR QUÉ EL ORDEN ES AL REVÉS DE LO QUE PARECE

   Se siembra la apertura PRIMERO y se marca cerrado DESPUÉS. Puesto
   al derecho —cerrar y luego sembrar— una caída de red en medio deja
   un mes cerrado cuyo siguiente no tiene apertura, y entonces el
   núcleo la deduce recorriendo el histórico… que en el navegador es
   solo un mes.

   Al revés, el peor caso es inofensivo: queda sembrada la apertura
   correcta —que es la misma se cierre o no— y el mes sigue abierto.
   Volver a intentarlo escribe exactamente lo mismo.

   POR QUÉ SE LEE EL MES SIGUIENTE ANTES DE TOCARLO

   El navegador solo trae el mes que se está mirando, así que no sabe
   qué hay guardado en el siguiente. Escribirle a ciegas podría
   borrarle su foto del plan. Se lee, se mira, y se decide:

     - si ya está CERRADO, no se toca y se dice por qué. Reescribirle
       la apertura a un mes cerrado le movería el suelo a una
       cuadratura que alguien ya dio por buena;
     - si existe, se le cambia SOLO la apertura;
     - si no existe, se crea con la apertura y nada más.
   ============================================================ */

import { sumaMeses } from '../nucleo/fechas.js';
import { FILAS, filaApertura } from './filas.js';
import * as api from './api.js';
import { crear, actualizar } from './escribir.js';

/**
 * El mes siguiente ya está cerrado, así que no se le puede mover el
 * suelo.
 *
 * Lleva el período dentro en vez del texto ya escrito porque este
 * archivo no es quien pone nombre a los meses: eso es de la pantalla,
 * y ningún módulo de datos importa `ui.js`.
 */
export class ErrorSiguienteCerrado extends Error {
  constructor(periodo, siguiente) {
    super('El mes siguiente ya está cerrado.');
    this.periodo = periodo;
    this.siguiente = siguiente;
  }
}

/** La fila de este mes, si es que ya existe una. */
async function filaExistente(periodo) {
  const filas = await api.leer('presupuesto_mes', { periodo: `eq.${periodo}` });
  return (filas || [])[0] || null;
}

const guardarFila = (existente, fila) =>
  existente ? actualizar('presupuesto_mes', existente.id, fila, fila)
            : crear('presupuesto_mes', fila);

const filaDelMes = ({ hogarId, periodo, montos, notas, ajustes, efectivoContado }, cerrar) =>
  FILAS.presupuesto_mes({ montos, notas, ajustes, efectivoContado },
                        { hogarId, periodo, cerrar });

/**
 * Guardar sin cerrar. Las justificaciones se teclean mientras se
 * revisa, y perderlas porque una conciliación todavía no cuadra haría
 * que a la segunda vez nadie las escriba.
 */
export async function guardarAvance(datos) {
  const fila = filaDelMes(datos, false);
  return guardarFila(await filaExistente(datos.periodo), fila);
}

/**
 * Cerrar el mes y sembrarle la apertura al siguiente.
 *
 * `saldos` y `montos` vienen calculados sobre el histórico completo.
 * No comprueba los bloqueos —eso es del núcleo y lo enseña la
 * pantalla—; lo que sí impone es lo que la pantalla no puede saber:
 * qué hay guardado en el mes siguiente.
 */
export async function cerrarMes(datos) {
  const { periodo, hogarId, saldos, desdeSiguiente, efectivoContado } = datos;
  const sig = sumaMeses(periodo, 1);

  // Se lee ANTES de escribir nada. Si el mes que viene ya está
  // cerrado, no se toca ni se cierra este: dejarlo a medias sería peor
  // que no empezar.
  const filaSig = await filaExistente(sig);
  if (filaSig && filaSig.cerrado) throw new ErrorSiguienteCerrado(periodo, sig);

  /* El efectivo que la persona acaba de contar gana, y hay que ponerlo
     aquí a mano por una razón de tiempos: `saldos` lo calculó el
     servidor AL ABRIR LA PANTALLA, o sea antes de que nadie escribiera
     nada. El núcleo ya prefiere lo contado sobre lo calculado, pero
     sobre lo que había GUARDADO en ese momento.
     Sin esta línea pasaría lo más torcido posible: la cifra contada se
     guardaría en el mes que se cierra —se vería en pantalla, correcta—
     y el mes siguiente arrancaría igual con la deducción vieja. */
  const apertura = filaApertura(
    { ...saldos,
      fecha: desdeSiguiente,
      ...(efectivoContado === null || efectivoContado === undefined || efectivoContado === ''
        ? {}
        : { efectivo: Number(efectivoContado) || 0 }) },
    { hogarId, periodo: sig });

  // Primero la apertura del siguiente; después el cierre de este. Ver
  // el encabezado: el orden es lo que hace que una caída de red en
  // medio no deje números falsos en pantalla.
  await guardarFila(filaSig, apertura);
  await guardarFila(await filaExistente(periodo), filaDelMes(datos, true));

  return { sig };
}

/**
 * Reabrir. Es del propietario del hogar y la base lo impone con un
 * disparador; aquí solo se pide.
 *
 * La apertura sembrada en el mes siguiente NO se borra: mientras el
 * mes vuelve a cuadrar, esa cifra sigue siendo la mejor que hay, y
 * borrarla dejaría al mes siguiente deduciendo del histórico —que en
 * el navegador no está.
 */
export async function reabrirMes({ periodo, hogarId }) {
  const fila = await filaExistente(periodo);
  if (!fila) throw new Error('Ese mes no está cerrado.');
  return actualizar('presupuesto_mes', fila.id,
    { cerrado: false, cerrado_el: null }, { hogar_id: hogarId, periodo });
}
