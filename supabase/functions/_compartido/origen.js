/* ============================================================
   A quién le contesta una función de servidor.

   Las tres decían `Access-Control-Allow-Origin: '*'`: cualquier sitio
   del mundo puede llamarlas desde el navegador de quien sea.

   HOY ESO NO ALCANZA PARA ROBAR NADA, y conviene decirlo antes que
   nada para no exagerar el hallazgo: la autorización viaja en la
   cabecera `Authorization`, no en una cookie, así que un sitio ajeno
   no puede provocar la llamada con la sesión de la víctima —no tiene
   el token, y `script-src 'self'` le impide conseguirlo—.

   Pero `*` es una puerta abierta que no hace falta. Nadie más que
   nuestras propias páginas llama a estas funciones, y una defensa que
   depende de que la de al lado no falle no es una defensa: es una
   apuesta. Esto la vuelve precisa.

   QUÉ SE PERMITE, Y POR QUÉ CADA UNO

   · `controlewallet.com` y su `www` — la app en producción.
   · Los DOS Workers propios en `workers.dev` — las vistas previas de
     cada rama. Sin esto, probar una rama antes de unirla dejaría de
     funcionar, y fallaría en el navegador, en silencio, lejos del
     cambio que lo rompió. Van con su nombre completo y no como
     `*.workers.dev`: ese comodín deja entrar el Worker de cualquiera,
     que es el mismo error que se acaba de quitar de la CSP, un piso
     más abajo. Los nombres son los de `wrangler.toml`; el trozo del
     medio es el subdominio de la cuenta, que Cloudflare asigna.
   · `localhost` y `127.0.0.1` en cualquier puerto — `wrangler dev`,
     que corre en el 8787 pero no siempre.

   A un origen que no está en la lista se le contesta con el de
   producción, que no es el suyo: el navegador compara y bloquea. Se
   devuelve ese y no un valor inventado para que la respuesta siga
   bien formada cuando la petición no viene de un navegador —`curl`,
   las pruebas de integración— que es donde no hay `Origin` que valga.
   ============================================================ */

const PERMITIDOS = [
  /^https:\/\/(www\.)?controlewallet\.com$/,
  /^https:\/\/controle-wallet(-pruebas)?\.[a-z0-9-]+\.workers\.dev$/,
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/
];

const POR_OMISION = 'https://controlewallet.com';

/** El origen que se va a devolver: el suyo si está permitido, el nuestro si no. */
export function origenPermitido(origen) {
  const o = String(origen || '');
  return PERMITIDOS.some(r => r.test(o)) ? o : POR_OMISION;
}

/**
 * Las cabeceras y los dos ayudantes de respuesta, atados al origen que
 * preguntó. Se arman POR PETICIÓN y no una vez al cargar el módulo:
 * la respuesta ya no es la misma para todos.
 */
export function respuestas(req) {
  const CABECERAS = {
    'Access-Control-Allow-Origin': origenPermitido(req.headers.get('Origin')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    /* Sin esto, una caché intermedia puede servirle a un origen la
       respuesta que se armó para otro — y ahí el comodín volvería por
       la puerta de atrás. */
    'Vary': 'Origin',
    'Content-Type': 'application/json'
  };

  const responder = (cuerpo, estado = 200) =>
    new Response(JSON.stringify(cuerpo), { status: estado, headers: CABECERAS });

  /** `propio: true` hace que el mensaje llegue tal cual a la pantalla. */
  const fallar = (mensaje, estado) =>
    responder({ error: mensaje, propio: true }, estado);

  return { CABECERAS, responder, fallar };
}
