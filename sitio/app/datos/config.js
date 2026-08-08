/* ============================================================
   A qué base habla la aplicación.

   La clave que va aquí es la PUBLICABLE, y que esté a la vista es
   correcto: por sí sola no abre nada. Cada tabla exige sesión
   iniciada y las políticas RLS deciden qué puede ver cada quien.
   Quien copie esta clave y pida datos sin sesión recibe una lista
   vacía — hay una prueba automática que lo comprueba en cada
   cambio.

   Las claves que SÍ son secretas —la de servicio, la de Anthropic,
   la del correo— viven en el servidor y nunca bajan al navegador.
   Ver SECRETOS.md.

   El ambiente se decide por el dominio, sin paso de compilación:
   el mismo archivo sirve para producción y para las vistas previas
   de cada rama. Así lo que se prueba es exactamente lo que se
   publica.
   ============================================================ */

const PRODUCCION = {
  url: 'https://qhbkghxuwzdrlswphusd.supabase.co',
  clave: 'sb_publishable_PxU2S900O0R0j0lTy9yRMg_74MkmfC_'
};

const PRUEBAS = {
  url: 'https://xidzmxtninmtxgqhddvu.supabase.co',
  clave: 'sb_publishable_kOp2ikDpXwRkeGqZyYy-lA_BIGKG6_u'
};

/* Producción es el dominio propio y nada más. Cualquier otra cosa
   —una vista previa, `localhost`, un subdominio de workers.dev—
   habla con la base de pruebas. El error que esta línea evita es el
   peor de todos: probar contra los datos reales de un cliente. */
const enProduccion = typeof location !== 'undefined' &&
  /(^|\.)controlewallet\.com$/.test(location.hostname);

export const CONFIG = enProduccion ? PRODUCCION : PRUEBAS;
export const AMBIENTE = enProduccion ? 'produccion' : 'pruebas';
