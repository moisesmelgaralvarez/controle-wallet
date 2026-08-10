/* ============================================================
   Lo que solo el servidor puede calcular.

   El navegador baja el mes en curso; hay cifras que necesitan toda la
   vida del hogar. En vez de bajar tres años al teléfono, se le
   pregunta al servidor, que corre EL MISMO NÚCLEO sobre el histórico
   completo (`supabase/functions/historico`).

   CÓMO SE USA, Y POR QUÉ ASÍ:

   Nunca se espera a esto para pintar. La pantalla dibuja primero todo
   lo que ya es cierto con lo que hay —avance, cuota, plazo— y cuando
   la respuesta llega, se vuelve a pintar con lo que faltaba. Bloquear
   la pantalla entera durante un viaje al servidor para enseñar un
   dato más es cambiar algo que funciona por algo que espera.

   Y si el viaje falla, no pasa nada grave: se queda lo que ya estaba,
   que nunca fue mentira.

   Vive en memoria mientras dure la pestaña, como todo lo demás. Al
   escribir cualquier cosa se olvida, y eso va pegado a la escritura
   en `escribir.js` para que no dependa de que alguien se acuerde.
   ============================================================ */

import { invocar } from './api.js';

const porPeriodo = new Map();

/** Se llama al cerrar sesión y después de cada escritura. */
export function olvidarHistorico() {
  porPeriodo.clear();
}

/**
 * El cálculo del histórico para un mes.
 *
 * Se guarda la PROMESA, no el resultado: dos pantallas que pregunten
 * a la vez comparten un solo viaje en vez de hacer dos. Si falla, se
 * borra para que el siguiente intento vuelva a preguntar en vez de
 * quedarse con el error pegado.
 */
export function historico(periodo, { refrescar = false } = {}) {
  if (refrescar) porPeriodo.delete(periodo);
  if (porPeriodo.has(periodo)) return porPeriodo.get(periodo);

  const viaje = invocar('historico', { periodo })
    .catch(e => { porPeriodo.delete(periodo); throw e; });

  porPeriodo.set(periodo, viaje);
  return viaje;
}
