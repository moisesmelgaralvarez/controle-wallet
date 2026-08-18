/* ============================================================
   A quién le habla la app, y quién puede hablarle a ella.

   Dos cosas que no se comprueban leyendo el código con los ojos, y
   que fallan sin dar un solo error:

   1. LA CSP DECÍA `https://*.supabase.co`. Eso es cualquier proyecto
      de Supabase, no los dos nuestros; cualquiera puede crear uno
      gratis en un minuto. Hoy no hay forma de aprovecharlo —haría
      falta ejecutar código inyectado, que `script-src 'self'` impide—
      pero una defensa que depende de que la de al lado no falle es
      una apuesta, no una defensa.

   2. LAS TRES FUNCIONES DE SERVIDOR CONTESTABAN A CUALQUIER ORIGEN.
      Tampoco alcanza para robar nada, porque la autorización va en
      una cabecera y no en una cookie. Pero es una puerta abierta que
      nadie usa.

   Se comprueban leyendo los archivos que se publican, no una copia:
   una prueba que mire otra cosa que lo que Cloudflare y Supabase van
   a servir no está comprobando nada.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { origenPermitido } from '../supabase/functions/_compartido/origen.js';

const cabeceras = readFileSync(new URL('../sitio/_headers', import.meta.url), 'utf8');
const config = readFileSync(new URL('../sitio/app/datos/config.js', import.meta.url), 'utf8');

/* Los anfitriones salen de `config.js`, que es de donde los toma la app.
   Escribirlos otra vez acá dejaría que los dos se separaran, que es
   exactamente el defecto que esta prueba viene a impedir. */
const ANFITRIONES = [...config.matchAll(/https:\/\/[a-z0-9]+\.supabase\.co/g)].map(m => m[0]);

test('se leyeron los anfitriones de la base, o abajo no se comprueba nada', () => {
  assert.equal(ANFITRIONES.length, 2,
    `se esperaban dos proyectos (producción y pruebas) y se leyeron ${ANFITRIONES.length}`);
});

test('la CSP no le abre a cualquier proyecto de Supabase', () => {
  const linea = cabeceras.split('\n').find(l => l.includes('Content-Security-Policy:'));
  assert.ok(linea, 'no hay línea de Content-Security-Policy en sitio/_headers');

  const connect = /connect-src ([^;]+);/.exec(linea);
  assert.ok(connect, 'la CSP no declara connect-src');

  assert.doesNotMatch(connect[1], /\*/,
    `connect-src volvió a tener un comodín: ${connect[1].trim()}`);
  for (const host of ANFITRIONES) {
    assert.ok(connect[1].includes(host),
      `connect-src no autoriza ${host}, así que la app no podría hablar con esa base`);
  }
});

test('la CSP no afloja donde más importa', () => {
  // Si alguna de estas se relaja, el token de sesión deja de estar protegido.
  for (const regla of ["script-src 'self'", "style-src 'self'", "object-src 'none'",
                       "base-uri 'none'", "frame-ancestors 'none'"]) {
    assert.ok(cabeceras.includes(regla), `se perdió \`${regla}\` de la CSP`);
  }
});

/* ---------- las funciones de servidor ---------- */

const CARPETA = new URL('../supabase/functions/', import.meta.url);
const funciones = readdirSync(CARPETA, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('_'))
  .map(d => d.name);

test('se encontraron las funciones de servidor', () => {
  assert.ok(funciones.length >= 3, `solo se encontraron ${funciones.length}: ${funciones}`);
});

for (const nombre of funciones) {
  test(`la función ${nombre} no le contesta a cualquier origen`, () => {
    const fuente = readFileSync(new URL(`${nombre}/index.ts`, CARPETA), 'utf8');
    assert.doesNotMatch(fuente, /'Access-Control-Allow-Origin':\s*'\*'/,
      'volvió el comodín: cualquier sitio puede llamarla desde el navegador de quien sea');
    assert.match(fuente, /respuestas\(req\)/,
      'no toma sus cabeceras de `_compartido/origen.js`, así que se hizo las suyas');
  });
}

/* ---------- el filtro, probado de verdad ---------- */

test('los orígenes propios pasan tal cual', () => {
  for (const o of ['https://controlewallet.com',
                   'https://www.controlewallet.com',
                   'https://controle-wallet-pruebas.mi-cuenta.workers.dev',
                   'https://controle-wallet.mi-cuenta.workers.dev',
                   'http://localhost:8787',
                   'http://127.0.0.1:3000']) {
    assert.equal(origenPermitido(o), o, `${o} debería pasar y no pasó`);
  }
});

test('un origen ajeno recibe uno que no es el suyo, y el navegador lo bloquea', () => {
  for (const o of ['https://controlewallet.com.malo.net',
                   'https://evil.example',
                   'http://controlewallet.com',          // sin TLS
                   'https://sub.controlewallet.com',     // subdominio que no existe
                   'https://workers.dev',
                   'https://el-worker-de-otro.mi-cuenta.workers.dev',
                   '']) {
    assert.notEqual(origenPermitido(o), o, `${o} NO debería haber pasado`);
    assert.equal(origenPermitido(o), 'https://controlewallet.com');
  }
});

test('sin cabecera Origin la respuesta sigue bien formada', () => {
  // `curl` y las pruebas de integración no mandan Origin. Devolver
  // `undefined` ahí rompería la respuesta para quien no es un navegador.
  assert.equal(origenPermitido(null), 'https://controlewallet.com');
  assert.equal(origenPermitido(undefined), 'https://controlewallet.com');
});
