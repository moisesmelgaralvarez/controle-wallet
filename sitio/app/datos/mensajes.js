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

/**
 * El 409 son DOS cosas distintas y decían la misma.
 *
 * PostgREST contesta 409 tanto para `unique_violation` —esto ya existe—
 * como para `foreign_key_violation` —esto apunta a algo que NO existe—,
 * que son exactamente opuestas. El texto único, «Ese registro ya existe»,
 * mandó una búsqueda entera en la dirección contraria: se buscó un
 * duplicado durante horas cuando lo que había era una referencia rota.
 *
 * Un mensaje que puede ser falso es peor que no tener mensaje.
 */
const CODIGO_PG = {
  '23503': 'Esa operación apunta a un registro que ya no existe. Recargá la página y volvé a intentar.',
  '23505': 'Ese registro ya existe.',
  '23514': 'Los datos no cumplen una regla del sistema.'
};

export function traducir(estado, cuerpo) {
  const propio = cuerpo && (cuerpo.message || cuerpo.error_description || cuerpo.msg || cuerpo.error);

  /* Nuestras propias Edge Functions marcan sus errores con `propio`.
     Ya están escritos en español y para leerse, y varios dicen algo que
     ningún genérico puede decir: cuando el cálculo del histórico se
     niega porque faltaron 412 filas, ESA es la frase que hay que leer,
     no «falló el servidor, intentá de nuevo». La marca es explícita a
     propósito: una lista de patrones que hay que mantener al día se
     queda vieja el día que alguien agrega un mensaje. */
  if (cuerpo && cuerpo.propio && propio) return propio;

  if (propio && TAL_CUAL.test(propio)) return propio;

  /* El código de Postgres ANTES que el de HTTP: es más específico. Va
     después de `TAL_CUAL` porque un disparador que escribió su propia
     frase sabe más que cualquier tabla. */
  const pg = cuerpo && cuerpo.code;
  if (pg && CODIGO_PG[pg]) return CODIGO_PG[pg];

  const motivo = `${(cuerpo && cuerpo.error_code) || ''} ${propio || ''}`;
  for (const [patron, texto] of DE_ENTRADA) if (patron.test(motivo)) return texto;

  return MENSAJES[estado] || propio || `Error ${estado}.`;
}

export { MENSAJES, DE_ENTRADA, CODIGO_PG };
