/* ============================================================
   Escribir, y que lo de la pantalla deje de estar viejo.

   Cada vez que se guarda algo hay que olvidar lo que se tenía en
   memoria, o la pantalla sigue mostrando el número anterior y la
   persona vuelve a guardar creyendo que no funcionó.

   Olvidar a mano después de cada escritura funciona hasta que
   alguien se olvida una vez — y ese caso es imposible de encontrar
   después, porque solo se nota en la pantalla de otra persona.
   Aquí la invalidación va pegada a la escritura y no se puede
   separar.
   ============================================================ */

import * as api from './api.js';
import { invalidarMes, invalidarConfiguracion } from './hogar.js';
import { olvidarHistorico } from './historico.js';
import { POR_MES } from './armador.js';

const esDelMes = tabla => POR_MES.includes(tabla);

function olvidar(tabla, fila) {
  // El cálculo del servidor se hizo sobre TODO el histórico, así que
  // cualquier escritura lo deja viejo — no solo las del mes que se
  // tocó. Un gasto de agosto cambia el saldo de la cuenta, y de ahí
  // cuelga el veredicto de cada proyecto.
  olvidarHistorico();

  if (esDelMes(tabla)) {
    // Si la fila trae período, solo ese mes deja de valer. Sin él
    // —un borrado donde no sabemos de qué mes era— se olvida todo,
    // que es lento pero nunca miente.
    if (fila && fila.periodo) invalidarMes(fila.periodo);
    else invalidarConfiguracion();
  } else {
    invalidarConfiguracion();
  }
}

export async function crear(tabla, fila) {
  const r = await api.crear(tabla, fila);
  olvidar(tabla, fila);
  return r;
}

export async function actualizar(tabla, id, cambios, fila) {
  const r = await api.actualizar(tabla, id, cambios);
  olvidar(tabla, fila || cambios);
  return r;
}

export async function borrar(tabla, id, fila) {
  const r = await api.borrar(tabla, id);
  olvidar(tabla, fila);
  return r;
}

/**
 * Crear o actualizar según haya id. Lo usan todos los formularios:
 * el mismo código sirve para «nuevo» y para «editar», que es lo que
 * evita que las dos rutas se separen con el tiempo.
 */
export const guardar = (tabla, id, fila) =>
  id ? actualizar(tabla, id, fila, fila) : crear(tabla, fila);

/**
 * Varias filas de un tirón, en orden.
 *
 * El asistente de arranque lo necesita: crea personas, pagos y
 * gastos, y los gastos pueden apuntar a una tarjeta que se acaba de
 * crear. En paralelo, la tarjeta podría no existir todavía cuando
 * se inserta el gasto que la referencia.
 */
export async function crearVarias(tabla, filas) {
  const hechas = [];
  for (const f of filas) hechas.push(await api.crear(tabla, f));
  olvidar(tabla, filas[0]);
  return hechas;
}

/**
 * Borra todas las filas que cumplan un filtro.
 *
 * `fila` es solo para saber qué olvidar de lo que hay en memoria: le
 * basta con traer el `periodo`.
 */
export async function borrarDonde(tabla, filtros, fila) {
  const r = await api.borrarDonde(tabla, filtros);
  olvidar(tabla, fila);
  return r;
}

/**
 * Varias filas de un tirón, reemplazando las que ya existan.
 *
 * `unicas` son las columnas que la base ya declaró únicas. Lo usa el
 * editor de pagos: guarda de una vez lo que le toca a cada persona,
 * sin tener que saber cuáles de esas líneas ya estaban.
 */
export async function fusionar(tabla, filas, unicas) {
  if (!filas.length) return [];
  const r = await api.insertarOReemplazar(tabla, filas, unicas);
  olvidar(tabla, filas[0]);
  return r;
}
