/* ============================================================
   Borrar la cuenta de verdad.

   La política de privacidad publicada dice, textualmente, que la
   exportación y el borrado están disponibles «directamente en tu
   panel, sin tener que pedirlos». Esta función es la mitad que no se
   puede hacer desde el navegador: borrar un usuario exige la clave de
   servicio, y esa clave no baja nunca al cliente.

   DE QUIÉN ES LA CUENTA QUE SE BORRA

   Del dueño del token, y de nadie más. El identificador NO se recibe
   en el cuerpo: se le pregunta a GoTrue quién es el portador de ese
   token, y se borra a ese. Aceptar un id por el cuerpo convertiría
   esta función en un botón para borrar la cuenta de cualquiera —una
   sola línea de distancia entre «mi panel» y «el de otro».

   QUÉ PASA CON EL HOGAR

   Se lo lleva el disparador `borrar_hogar_sin_miembros`, y solo si
   era el ÚLTIMO miembro. Si la pareja sigue en el hogar, el hogar y
   sus datos siguen: borrar tu cuenta no puede destruirle el
   presupuesto a otra persona.

   POR QUÉ NO SE PIDE LA CONTRASEÑA AQUÍ

   Porque no la manejamos. Quien llega hasta aquí ya tiene una sesión
   iniciada y válida; volver a pedirle la contraseña obligaría a que
   esta función la viera, que es exactamente lo que el proyecto evita.
   La confirmación es en la pantalla, escribiendo el correo propio.
   ============================================================ */

const CABECERAS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: CABECERAS });

/** `propio: true` hace que el mensaje llegue tal cual a la pantalla. */
const fallar = (mensaje: string, estado: number) =>
  responder({ error: mensaje, propio: true }, estado);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CABECERAS });

  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion.startsWith('Bearer ')) {
    return fallar('Hace falta iniciar sesión.', 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !servicio) return fallar('Falta configuración del proyecto.', 500);

  try {
    const { confirmacion } = await req.json().catch(() => ({}));

    // Quién es, según el token. Nunca según el cuerpo.
    const yo = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: autorizacion }
    });
    if (!yo.ok) return fallar('La sesión venció. Volvé a entrar.', 401);
    const usuario = await yo.json();
    if (!usuario?.id) return fallar('No se pudo confirmar quién sos.', 401);

    /* La confirmación se comprueba TAMBIÉN aquí, no solo en la
       pantalla. Un botón deshabilitado en el navegador no es una
       defensa: el navegador se asume hostil. */
    if (String(confirmacion || '').trim().toLowerCase() !== String(usuario.email || '').toLowerCase()) {
      return fallar('Para borrar la cuenta hay que escribir tu correo tal cual.', 400);
    }

    const borrado = await fetch(`${url}/auth/v1/admin/users/${usuario.id}`, {
      method: 'DELETE',
      headers: { apikey: servicio, Authorization: `Bearer ${servicio}` }
    });
    if (!borrado.ok) {
      const detalle = await borrado.text();
      return fallar(`No se pudo borrar la cuenta. ${detalle}`.trim(), 500);
    }

    /* El hogar se lo lleva el disparador `borrar_hogar_sin_miembros`,
       y solo si era el último. Aquí no se toca: duplicar esa regla en
       dos sitios es garantizar que un día digan cosas distintas. */
    return responder({ borrado: true, correo: usuario.email });

  } catch (e) {
    return fallar((e as Error).message || 'No se pudo borrar la cuenta.', 500);
  }
});
