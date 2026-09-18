/* ============================================================
   El latido: una consulta diaria a cada base para que Supabase no
   la dé por abandonada.

   Tiene que ser una consulta DE VERDAD a Postgres, no un vistazo a la
   salud del servicio: lo que Supabase mide es actividad en la base.
   Se pide una fila de `hogares` con la clave publicable y sin sesión;
   RLS devuelve una lista vacía, pero Postgres hizo el trabajo. No lee
   ni un dato de nadie — la prueba de aislamiento garantiza exactamente
   eso — y no necesita ningún secreto.
   ============================================================ */

import { BASES } from '../sitio/app/datos/config.js';

/** Un latido a una base. Devuelve qué pasó, para verlo en los registros. */
export async function latir(nombre, { url, clave }, pedir = fetch) {
  try {
    const r = await pedir(`${url}/rest/v1/hogares?select=id&limit=1`, {
      headers: { apikey: clave }
    });
    return { base: nombre, estado: r.status, ok: r.ok };
  } catch (e) {
    return { base: nombre, estado: 0, ok: false, error: String(e && e.message || e) };
  }
}

export async function latirTodas(pedir = fetch) {
  return Promise.all(Object.entries(BASES).map(([n, b]) => latir(n, b, pedir)));
}

export default {
  async scheduled(_evento, _env, ctx) {
    ctx.waitUntil(latirTodas().then(r => {
      // Se registra aunque todo salga bien: si un día la base sí se pausa,
      // `wrangler tail` o el panel muestran desde cuándo dejó de contestar.
      for (const x of r) console.log(`latido ${x.base}: ${x.estado}${x.error ? ' · ' + x.error : ''}`);
    }));
  }
};
