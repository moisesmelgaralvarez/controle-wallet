/* ============================================================
   Traer el hogar del servidor y armarlo para el núcleo.

   Aquí se decide QUÉ se baja, que no es lo mismo que qué se
   muestra. La regla:

     · La configuración —personas, cuentas, tarjetas, rubros,
       proyectos— son decenas de filas y cambian poco. Se trae una
       vez y se guarda en memoria mientras dure la pestaña.

     · Lo que pasó —movimientos, retiros, pagos, ingresos— crece sin
       techo. Se trae POR MES. Un hogar con tres años de historia no
       tiene por qué bajarle tres años al teléfono para enseñarle
       agosto.

   En memoria, no en el dispositivo: al cerrar la pestaña no queda
   nada. Los datos del usuario viven en el servidor y punto.

   Lo que recorre TODO el histórico por diseño —historia,
   patrimonio, proyección— se calcula en el servidor con este mismo
   núcleo. Esa parte llega con las vistas que la necesitan.
   ============================================================ */

import { leerVarias } from './api.js';
import { armar, CONFIGURACION, POR_MES } from './armador.js';

let configuracion = null;   // filas que cambian poco
const meses = new Map();    // periodo → filas de ese mes
let hogarFila = null;

/** Olvida todo lo traído. Se llama al cerrar sesión. */
export function olvidar() {
  configuracion = null;
  hogarFila = null;
  meses.clear();
}

async function traerConfiguracion() {
  if (configuracion) return configuracion;
  const [hogares, resto] = await Promise.all([
    leerVarias(['hogares']),
    leerVarias(CONFIGURACION)
  ]);
  hogarFila = (hogares.hogares || [])[0] || null;
  configuracion = resto;
  return configuracion;
}

async function traerMes(periodo) {
  if (meses.has(periodo)) return meses.get(periodo);
  const filtro = { periodo: `eq.${periodo}` };
  const filas = await leerVarias(POR_MES, Object.fromEntries(POR_MES.map(t => [t, filtro])));
  meses.set(periodo, filas);
  return filas;
}

/**
 * El documento del hogar para un mes, listo para el núcleo.
 *
 * `refrescar` fuerza a volver a preguntar: es lo que hay que hacer
 * después de escribir algo, y al volver a la pestaña tras un rato
 * fuera — si la otra persona del hogar registró un gasto, aquí es
 * donde aparece.
 */
export async function cargarHogar(periodo, { refrescar = false } = {}) {
  if (refrescar) { configuracion = null; meses.delete(periodo); }
  const [cfg, mes] = [await traerConfiguracion(), await traerMes(periodo)];
  return armar({ hogar: hogarFila, ...cfg, ...mes });
}

/** Datos del hogar en sí: nombre, moneda, día de arranque del mes. */
export async function datosDelHogar() {
  await traerConfiguracion();
  return hogarFila;
}

/** Tras escribir, el mes tocado deja de valer. */
export const invalidarMes = periodo => meses.delete(periodo);
export const invalidarConfiguracion = () => { configuracion = null; };

/**
 * El mes del hogar al que pertenece hoy.
 *
 * No es el mes del calendario: si el hogar arranca el 7, el 3 de
 * agosto todavía es julio. Se calcula con la fecha LOCAL, nunca
 * con `toISOString()` — eso da UTC, y en Honduras a partir de las
 * seis de la tarde devolvería el día siguiente.
 */
export function mesDeHoy(inicioMes = 1) {
  const d = new Date();
  const dosDig = n => String(n).padStart(2, '0');
  const y = d.getFullYear(), m = d.getMonth() + 1, dia = d.getDate();
  if (dia >= Math.max(1, inicioMes)) return `${y}-${dosDig(m)}`;
  const ant = new Date(y, m - 2, 1);
  return `${ant.getFullYear()}-${dosDig(ant.getMonth() + 1)}`;
}
