/* ============================================================
   Un error tiene que decir qué hacer.

   Esta prueba nace de un fallo real: con la contraseña correcta y el
   correo sin confirmar, la pantalla de entrar decía «Los datos
   enviados no son válidos». Ese texto manda a la persona a revisar el
   formulario —donde no hay nada malo— en vez de a su bandeja de
   entrada.

   La causa es que GoTrue cambió de criterio: lo que antes contestaba
   401 con «Invalid login credentials» ahora contesta **400** con un
   `error_code` en el cuerpo. La traducción se colgaba del código de
   estado, así que los tres casos más comunes —contraseña incorrecta,
   correo sin confirmar y correo ya registrado— caían todos en el
   cajón de sastre del 400.

   Se prueban las dos formas, la nueva con `error_code` y la vieja con
   solo el mensaje, porque una instancia sin actualizar manda la
   vieja.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traducir, MENSAJES } from '../sitio/app/datos/mensajes.js';

const generico = MENSAJES[400];

/* ------------------------------------------------------------
   Lo que trajo esta prueba
   ------------------------------------------------------------ */

test('un correo sin confirmar manda a la bandeja de entrada, no al formulario', () => {
  const nuevo = traducir(400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
  assert.match(nuevo, /confirmar tu correo/i);
  assert.notEqual(nuevo, generico);

  // La forma vieja, sin `error_code`.
  assert.match(traducir(400, { msg: 'Email not confirmed' }), /confirmar tu correo/i);
});

test('una contraseña incorrecta lo dice, con 400 y con 401', () => {
  assert.match(traducir(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
    /correo o contraseña incorrectos/i);
  assert.match(traducir(401, { msg: 'Invalid login credentials' }),
    /correo o contraseña incorrectos/i);
});

test('un correo que ya tiene cuenta lo dice, con 400 y con 422', () => {
  assert.match(traducir(400, { error_code: 'user_already_exists', msg: 'User already registered' }),
    /ya tiene cuenta/i);
  assert.match(traducir(422, { msg: 'User already registered' }), /ya tiene cuenta/i);
});

test('ningún motivo conocido se queda en el cajón de sastre', () => {
  // Si alguien agrega un motivo a la lista y se le va el patrón, el
  // mensaje vuelve a ser el genérico sin que nada avise. Aquí sí avisa.
  const conocidos = [
    'invalid_credentials', 'email_not_confirmed', 'user_already_exists',
    'weak_password', 'same_password', 'over_email_send_rate_limit',
    'over_request_rate_limit', 'signup_disabled'
  ];
  const sinTraducir = conocidos.filter(c => traducir(400, { error_code: c }) === generico);
  assert.deepEqual(sinTraducir, [], `siguen cayendo en el mensaje genérico: ${sinTraducir.join(', ')}`);
});

/* ------------------------------------------------------------
   Lo que ya funcionaba y no se puede romper
   ------------------------------------------------------------ */

test('los mensajes de los disparadores de la base pasan tal cual', () => {
  // Están escritos en español y para leerse: traducirlos otra vez
  // perdería el mes del que hablan.
  const cerrado = 'El mes 2026-07 ya está cerrado y no admite cambios.';
  assert.equal(traducir(400, { message: cerrado }), cerrado);
  assert.match(traducir(403, { message: 'Solo el propietario del hogar puede reabrir un mes cerrado.' }),
    /solo el propietario/i);
});

test('lo que manda una Edge Function nuestra pasa tal cual', () => {
  // La marca `propio` la ponen nuestras funciones. Sin ella, un 500 se
  // convertía en «Falló el servidor. Intentá de nuevo en un momento», y
  // eso borra justo lo que hay que leer: por qué se negó el cálculo.
  const negado = 'Faltaron 412 filas de movimientos: el cálculo no se hace a medias.';
  assert.equal(traducir(500, { error: negado, propio: true }), negado);
  assert.notEqual(traducir(500, { error: negado, propio: true }), MENSAJES[500]);

  // Y funciona en cualquier código, no solo en el 500.
  assert.match(traducir(404, { error: 'No se encontró tu hogar.', propio: true }), /tu hogar/);
});

test('sin la marca, un error ajeno sigue cayendo en su genérico', () => {
  // Un 500 de PostgREST puede traer texto técnico en inglés. Ese sí se
  // cambia por el mensaje de la tabla: no está escrito para leerse.
  assert.equal(traducir(500, { message: 'deadlock detected' }), MENSAJES[500]);
});

test('un estado sin motivo cae en el mensaje de su código', () => {
  assert.equal(traducir(403, null), MENSAJES[403]);
  assert.equal(traducir(500, {}), MENSAJES[500]);
  assert.equal(traducir(404, { message: '' }), MENSAJES[404]);
});

test('un estado desconocido no devuelve «undefined»', () => {
  assert.equal(traducir(418, null), 'Error 418.');
  assert.equal(traducir(502, { message: 'Bad gateway' }), 'Bad gateway');
});

test('un cuerpo que no es objeto no revienta la traducción', () => {
  // PostgREST a veces contesta texto plano; `cuerpoDe` lo pasa así.
  assert.equal(traducir(500, 'algo se rompió'), MENSAJES[500]);
  assert.equal(traducir(0, null), 'Error 0.');
});
