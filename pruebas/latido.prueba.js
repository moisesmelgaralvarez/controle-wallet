/* El latido le pega a LAS DOS bases, con la clave publicable y nada más,
   y pide a Postgres —no a un chequeo de salud—. Si alguien lo cambia por
   `/auth/v1/health`, Supabase deja de contarlo como uso y la base se
   vuelve a pausar a los siete días, en silencio. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latirTodas } from '../latido/latido.js';
import { BASES } from '../sitio/app/datos/config.js';

test('El latido consulta la base de producción y la de pruebas', async () => {
  const pedidos = [];
  const pedir = async (url, op) => { pedidos.push({ url, op }); return { status: 200, ok: true }; };
  const r = await latirTodas(pedir);
  assert.deepEqual(r.map(x => x.base).sort(), ['produccion', 'pruebas']);
  assert.ok(pedidos.some(p => p.url.startsWith(BASES.produccion.url)));
  assert.ok(pedidos.some(p => p.url.startsWith(BASES.pruebas.url)));
});

test('Pide a Postgres por la API de datos, no un chequeo de salud', async () => {
  const urls = [];
  await latirTodas(async url => { urls.push(url); return { status: 200, ok: true }; });
  for (const u of urls) assert.match(u, /\/rest\/v1\/[a-z_]+\?select=/);
});

test('Solo viaja la clave publicable, nunca una de servicio', async () => {
  const cabeceras = [];
  await latirTodas(async (_u, op) => { cabeceras.push(op.headers); return { status: 200, ok: true }; });
  for (const h of cabeceras) {
    assert.match(h.apikey, /^sb_publishable_/);
    assert.equal(h.Authorization, undefined);
  }
});

test('Una base caída no tumba el latido de la otra', async () => {
  const r = await latirTodas(async url => {
    if (url.startsWith(BASES.produccion.url)) throw new Error('sin conexión');
    return { status: 200, ok: true };
  });
  const prod = r.find(x => x.base === 'produccion');
  const pru = r.find(x => x.base === 'pruebas');
  assert.equal(prod.ok, false);
  assert.match(prod.error, /sin conexión/);
  assert.equal(pru.ok, true);
});
