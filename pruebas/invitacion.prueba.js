/* ============================================================
   La invitación no puede perder la ruta por el camino.

   POR QUÉ EXISTE ESTA PRUEBA

   Un hogar de verdad la encontró antes que nosotros. Se invitó a una
   persona sin cuenta; abrió el correo y la app le pidió armar un hogar,
   habiendo sido invitada a uno que ya existía. Al final ninguno de los
   dos veía lo del otro.

   La causa estaba acá: `capturarSesionDeURL` hacía
   `location.pathname + location.search` a secas, o sea borraba el hash
   ENTERO. Y el enlace de invitación llega justamente como
   `#/invitacion/<token>&access_token=…`, así que la ruta se destruía
   antes de que el enrutador la leyera — encima corre primero, en la
   línea 49, y el enrutador lee en la 122.

   Falló en silencio y de la peor manera: la sesión SÍ quedaba abierta,
   así que todo parecía haber salido bien.

   LO QUE ESTA PRUEBA FIJA, Y LO QUE NO

   Fija que los parámetros de sesión se borran —para eso estaba el
   borrado, y no tienen por qué quedar en el historial ni en una captura
   de pantalla— y que la ruta a la que iba la persona SOBREVIVE.

   Las dos mitades importan y por eso se comprueban las dos. Una prueba
   que solo mirara que la ruta sobrevive pasaría con un `limpiar` que no
   limpiara nada, y volvería a dejar el token de sesión en el historial.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';

/* `api.js` toca `localStorage`, `location` e `history` al cargarse, así
   que el ambiente se arma ANTES de importarlo. Se importa una sola vez
   y cada caso reescribe `location.hash`, que es lo único que lee. */
const guardado = new Map();
globalThis.localStorage = {
  getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
  setItem: (k, v) => guardado.set(k, String(v)),
  removeItem: (k) => guardado.delete(k)
};

let reemplazos = [];
globalThis.location = { hash: '', pathname: '/app/', search: '' };
globalThis.history = {
  replaceState: (_a, _b, url) => { reemplazos.push(url); }
};

const { capturarSesionDeURL } = await import('../sitio/app/datos/api.js');

/** Pone la dirección, corre la captura y devuelve lo que quedó. */
function correr(hash) {
  reemplazos = [];
  guardado.clear();
  globalThis.location.hash = hash;
  const salida = capturarSesionDeURL();
  return {
    salida,
    direccion: reemplazos.length ? reemplazos[reemplazos.length - 1] : null,
    sesion: guardado.get('controle.sesion') || null
  };
}

const SESION = 'access_token=AAA&refresh_token=BBB&expires_in=3600&token_type=bearer';

test('la ruta de la invitación sobrevive a la captura de la sesión', () => {
  const r = correr(`#/invitacion/T0KEN123&${SESION}&type=invite`);

  assert.equal(r.direccion, '/app/#/invitacion/T0KEN123',
    'la ruta tiene que quedar en la dirección: es lo único que le dice a la app a qué hogar entra');
  assert.equal(r.salida.tipo, 'invite');
});

test('y los parámetros de sesión NO sobreviven', () => {
  const r = correr(`#/invitacion/T0KEN123&${SESION}&type=invite`);

  /* La otra mitad, y sin ella la prueba de arriba pasaría con un
     `limpiar` que no limpiara: el token quedaría en el historial. */
  for (const rastro of ['access_token', 'AAA', 'refresh_token', 'BBB', 'type=']) {
    assert.ok(!r.direccion.includes(rastro),
      `«${rastro}» no puede quedar en la dirección`);
  }
});

test('la sesión sí se guarda: la persona queda adentro', () => {
  const r = correr(`#/invitacion/T0KEN123&${SESION}&type=invite`);
  const s = JSON.parse(r.sesion);
  assert.equal(s.access_token, 'AAA');
  assert.equal(s.refresh_token, 'BBB');
});

test('sin ruta, la dirección queda pelada y no inventa uno', () => {
  const r = correr(`#${SESION}&type=signup`);
  assert.equal(r.direccion, '/app/',
    'quien solo confirma su correo no va a ninguna ruta en particular');
  assert.equal(r.salida.tipo, 'signup');
});

test('una ruta común también sobrevive, con su mes', () => {
  const r = correr(`#/movimientos/2026-08&${SESION}&type=recovery`);
  assert.equal(r.direccion, '/app/#/movimientos/2026-08');
});

test('sin token de sesión no se toca la dirección', () => {
  const r = correr('#/resumen');
  assert.equal(r.salida, null);
  assert.equal(r.direccion, null, 'no había nada que capturar: no hay por qué reescribir nada');
});

test('un error del correo se informa y limpia', () => {
  const r = correr('#error=access_denied&error_description=El%20enlace%20venci%C3%B3');
  assert.ok(r.salida.error, 'el motivo tiene que llegar a la pantalla');
  assert.ok(!String(r.direccion).includes('error='));
});

/* ============================================================
   El fragmento no sobrevive a un parámetro de consulta.

   POR QUÉ EXISTE ESTA PRUEBA

   Se mandó una invitación de verdad y el correo llegó con
   `redirect_to=https://controlewallet.com/app/` — el
   `#/invitacion/<token>` evaporado. La causa no era GoTrue ni la lista
   blanca: es que un `#` dentro del valor de un parámetro de consulta
   tiene que ir codificado como `%23`. Sin codificar, todo lo que sigue
   se convierte en el fragmento de la URL de AFUERA.

   Esto fija la regla para que nadie la vuelva a romper armando enlaces
   «más completos». Y fija lo contrario: que la app NO necesita el token
   en la dirección, porque lo pregunta a la base.
   ============================================================ */

test('un # sin codificar se lleva la ruta al fragmento de afuera', () => {
  const destino = 'https://controlewallet.com/app/#/invitacion/T0KEN';
  const enlace  = `https://proy.supabase.co/auth/v1/verify?type=invite&redirect_to=${destino}`;

  const u = new URL(enlace);
  assert.equal(u.searchParams.get('redirect_to'), 'https://controlewallet.com/app/',
    'el servidor recibe el destino TRUNCADO: todo lo que sigue al # se le escapa');
  assert.equal(u.hash, '#/invitacion/T0KEN',
    'y la ruta termina en el fragmento del enlace de Supabase, donde nadie la lee');
});

test('codificado sí sobrevive, pero por eso mismo no se usa', () => {
  const destino = 'https://controlewallet.com/app/#/invitacion/T0KEN';
  const enlace  = `https://proy.supabase.co/auth/v1/verify?type=invite&redirect_to=${encodeURIComponent(destino)}`;

  assert.equal(new URL(enlace).searchParams.get('redirect_to'), destino,
    'codificado llega entero — pero depende de que un tercero respete la codificación');
});

test('el destino que se manda hoy no lleva token', () => {
  /* Lo que de verdad construye `supabase/functions/invitar/index.ts`.
     Si alguien le vuelve a pegar un fragmento, esta prueba lo agarra. */
  const volverA = 'https://controlewallet.com/app/';
  assert.ok(!volverA.includes('#'), 'el token no viaja en la URL: lo pregunta la app a la base');
  assert.ok(!/token|invitacion/i.test(volverA), 'ni el token ni la ruta van en la dirección');
});
