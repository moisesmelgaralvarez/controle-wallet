/* ============================================================
   Los errores, en cristiano.

   Un error de red y uno de permisos no son lo mismo y no se arreglan
   igual. Traducirlos en un solo lugar evita que cada pantalla invente
   su propio texto — y evita el clásico «Error: [object Object]».

   LA REGLA: el mensaje tiene que decir QUÉ HACER. «Los datos enviados
   no son válidos» no es un mensaje, es una forma de no contestar:
   quien escribió mal su contraseña se va a revisar el correo, o a
   creer que la app está rota.

   Vive aparte de `api.js` porque es lógica pura —entra un estado y un
   cuerpo, sale un texto— y así se puede probar sin levantar nada.
   ============================================================ */

/** El cajón de sastre, por código de estado. Lo último que se mira. */
const MENSAJES = {
  400: 'Los datos enviados no son válidos.',
  401: 'La sesión venció. Volvé a entrar.',
  403: 'No tenés permiso para hacer eso.',
  404: 'No se encontró lo que se pidió.',
  409: 'Ese registro ya existe.',
  413: 'El archivo es demasiado grande.',
  429: 'Demasiados intentos. Esperá un momento.',
  500: 'Falló el servidor. Intentá de nuevo en un momento.'
};

/**
 * Lo que puede salir mal al entrar o al registrarse.
 *
 * Se busca por el MOTIVO que manda el servidor, no por el código de
 * estado. GoTrue cambió de criterio: lo que antes contestaba 401 con
 * «Invalid login credentials» ahora contesta **400** con un
 * `error_code` dentro. Colgarse del número dejaba los tres casos más
 * comunes —contraseña incorrecta, correo sin confirmar y correo ya
 * registrado— cayendo todos en el mismo «los datos enviados no son
 * válidos».
 *
 * Se mira el texto ADEMÁS del código porque los códigos son nuevos:
 * una instancia vieja manda solo el mensaje.
 */
const DE_ENTRADA = [
  [/invalid_credentials|invalid login/i,
   'Correo o contraseña incorrectos.'],
  [/email_not_confirmed|email not confirmed/i,
   'Falta confirmar tu correo. Buscá el mensaje que te mandamos al crear la cuenta —revisá también la carpeta de no deseados— y abrí el enlace.'],
  [/user_already_exists|already registered/i,
   'Ese correo ya tiene cuenta.'],
  [/weak_password|password should be at least/i,
   'La contraseña es muy corta: poné al menos 8 caracteres.'],
  [/same_password/i,
   'La contraseña nueva tiene que ser distinta de la anterior.'],
  [/over_email_send_rate_limit|email rate limit/i,
   'Se mandaron demasiados correos seguidos. Esperá unos minutos y volvé a intentar.'],
  [/over_request_rate_limit/i,
   'Demasiados intentos seguidos. Esperá un momento.'],
  [/signup_disabled/i,
   'El registro está cerrado por ahora.']
];

/** Los que Postgres escribió para leerse tal cual, desde un disparador. */
const TAL_CUAL = /mes .* cerrado|solo el propietario/i;

export function traducir(estado, cuerpo) {
  const propio = cuerpo && (cuerpo.message || cuerpo.error_description || cuerpo.msg || cuerpo.error);
  if (propio && TAL_CUAL.test(propio)) return propio;

  const motivo = `${(cuerpo && cuerpo.error_code) || ''} ${propio || ''}`;
  for (const [patron, texto] of DE_ENTRADA) if (patron.test(motivo)) return texto;

  return MENSAJES[estado] || propio || `Error ${estado}.`;
}

export { MENSAJES, DE_ENTRADA };
