/* ============================================================
   Mandar la invitación por correo.

   La fila de `invitaciones` la escribe el navegador —RLS ya exige ser
   propietario del hogar— y con ella viene el token. Lo único que no
   se puede hacer desde ahí es MANDAR EL CORREO: crear el usuario
   invitado y enviarle el enlace exige la clave de servicio, y esa
   clave no baja nunca al cliente.

   DE QUÉ SE ASEGURA ANTES DE MANDAR NADA

   De que quien pide sea propietario DEL HOGAR DE ESA INVITACIÓN. No
   se comprueba a mano: se lee la invitación **con el token de quien
   pregunta**, así que es RLS quien decide si la ve. Si no es del
   hogar, la consulta no devuelve nada y aquí no hay nada que mandar.
   La clave de servicio se usa solo después, y solo para el correo.

   POR QUÉ EL ENLACE **NO** LLEVA NUESTRO TOKEN

   Lo llevó, en un fragmento pegado al `redirect_to`, y NO PUEDE
   FUNCIONAR. Un `#` dentro del valor de un parámetro de consulta tiene
   que ir codificado como `%23`; sin codificar, todo lo que sigue al `#`
   se convierte en el fragmento de la URL de AFUERA y el servidor no lo
   ve siquiera. Se comprobó con el correo que de verdad llegó a un
   teléfono: el enlace terminaba en
   `redirect_to=https://controlewallet.com/app/`, con el fragmento
   evaporado.

   Y codificarlo tampoco era la salida, porque dependía de que GoTrue
   respetara la codificación y de que la lista blanca aceptara
   fragmentos — dos cosas fuera de nuestro control para resolver algo
   que no hacía falta resolver.

   La app no necesita el token: pregunta. Al caer en `/app/` sin hogar,
   llama a `mi_invitacion_pendiente()`, que contesta con lo que hay
   PARA SU PROPIO CORREO. El token se queda en la base, que es donde
   siempre debió estar, y no pasa por el historial de nadie.

   SI EL CORREO YA TIENE CUENTA

   GoTrue contesta que ya existe, y eso NO es un error: la persona ya
   está registrada y solo hay que decirle que entre y abra el enlace.
   Tratarlo como fallo dejaría sin poder invitar justo a quien ya usa
   la app.
   ============================================================ */

const CABECERAS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: CABECERAS });

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
    const { invitacionId, destino } = await req.json().catch(() => ({}));
    if (!invitacionId) return fallar('Falta decir qué invitación mandar.', 400);

    /* Se lee CON EL TOKEN DE QUIEN PIDE. RLS decide: si la invitación
       no es de un hogar suyo, esto vuelve vacío y no hay qué mandar.
       No se filtra por hogar en ninguna línea de aquí, y esa ausencia
       es deliberada. */
    const r = await fetch(
      `${url}/rest/v1/invitaciones?id=eq.${encodeURIComponent(invitacionId)}&select=correo,token,estado,vence_en`,
      { headers: { apikey: anon, Authorization: autorizacion } });
    const filas = await r.json();
    const inv = Array.isArray(filas) ? filas[0] : null;
    if (!inv) return fallar('No se encontró esa invitación.', 404);
    if (inv.estado !== 'pendiente') return fallar('Esa invitación ya no está pendiente.', 400);

    /* A dónde cae la persona al confirmar: la app, y nada más. Sin
       token pegado — ver la nota de arriba sobre por qué el fragmento
       no sobrevive a un parámetro de consulta. */
    const volverA = String(destino || '').startsWith('https://')
      ? String(destino) : 'https://controlewallet.com/app/';

    /* `redirect_to` se manda igual: sin él, `{{ .ConfirmationURL }}`
       apunta al `site_url` del panel, que es un valor que se administra
       aparte y puede no ser el de la app.

       `data.invitacion` SÍ se queda, y es el único camino por el que el
       token viaja: lo lee el disparador `al_crear_usuario` DENTRO de la
       base, para no crearle un hogar propio a quien viene invitado.
       Nunca llega al navegador. */
    const enviado = await fetch(`${url}/auth/v1/invite`, {
      method: 'POST',
      headers: { apikey: servicio, Authorization: `Bearer ${servicio}`,
                 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inv.correo,
        data: { invitacion: inv.token },
        redirect_to: volverA
      })
    });

    if (enviado.ok) return responder({ mandado: true, correo: inv.correo, volverA });

    const detalle = await enviado.json().catch(() => ({}));
    const motivo = String(detalle?.msg || detalle?.error_description || detalle?.message || '');

    /* Ya tener cuenta no es un fallo. Es el caso más común cuando se
       invita a alguien que ya usa la app, y decirle «error» a eso
       sería impedir justo la invitación más fácil de completar. */
    if (/already been registered|already registered|already exists/i.test(motivo)) {
      return responder({
        mandado: false, yaTieneCuenta: true, correo: inv.correo, volverA,
        aviso: 'Esa persona ya tiene cuenta. Pasale el enlace: al abrirlo con su ' +
               'sesión iniciada, entra al hogar.'
      });
    }

    return fallar(`No se pudo mandar la invitación. ${motivo}`.trim(), 502);

  } catch (e) {
    return fallar((e as Error).message || 'No se pudo mandar la invitación.', 500);
  }
});
