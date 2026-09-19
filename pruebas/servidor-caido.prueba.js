/* ============================================================
   Cuando el servidor no contesta, la app lo DICE.

   El 18 de septiembre de 2026 la base estaba pausada y su dirección no
   existía. En la computadora, «No se pudo entrar» —el error de red se
   perdía—; en el iPhone, «Trayendo tu hogar del servidor…» para siempre,
   porque ninguna petición tenía límite de tiempo.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { llegar, ErrorDatos, entrar } from '../sitio/app/datos/api.js';

const conFetch = async (falso, fn) => {
  const original = globalThis.fetch;
  globalThis.fetch = falso;
  try { return await fn(); } finally { globalThis.fetch = original; }
};

test('Una petición que nunca contesta se corta y lo dice', { timeout: 3000 }, async () => {
  // Así se portaba el iPhone con la dirección de una base pausada.
  const colgada = (_u, op) => new Promise((_, rechazar) =>
    op.signal.addEventListener('abort', () => rechazar(new DOMException('abortada', 'AbortError'))));
  const inicio = Date.now();
  const e = await conFetch(colgada, () => llegar('https://x.supabase.co/rest/v1/hogares', {}, 60)
    .then(() => null, err => err));
  assert.ok(e instanceof ErrorDatos, 'tiene que ser un error que la pantalla sepa leer');
  assert.equal(e.servidor, true);
  assert.match(e.message, /no responde/);
  assert.ok(Date.now() - inicio < 1000, 'y no puede esperar para siempre');
});

test('Una dirección que no existe es «el servidor no responde», no un error suelto', async () => {
  const dns = async () => { throw new TypeError('Failed to fetch'); };
  const e = await conFetch(dns, () => llegar('https://x.supabase.co/auth/v1/token', {}).catch(err => err));
  assert.ok(e instanceof ErrorDatos);
  assert.equal(e.servidor, true);
  assert.match(e.message, /Tus datos están guardados/);
});

test('Entrar con el servidor caído da la razón, no «No se pudo entrar»', { timeout: 3000 }, async () => {
  // `entrar.js` muestra el mensaje solo si es un ErrorDatos; un TypeError
  // suelto caía en el genérico y el dueño no tenía cómo saber qué pasaba.
  const e = await conFetch(async () => { throw new TypeError('Load failed'); },
    () => entrar('alguien@correo.com', 'x').catch(err => err));
  assert.ok(e instanceof ErrorDatos, `llegó ${e && e.constructor && e.constructor.name}`);
  assert.match(e.message, /no responde/);
});

test('Con respuesta, pasa tal cual', async () => {
  const r = await conFetch(async () => new Response('[]', { status: 200 }),
    () => llegar('https://x.supabase.co/rest/v1/hogares', {}));
  assert.equal(r.status, 200);
});
