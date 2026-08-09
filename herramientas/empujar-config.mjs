#!/usr/bin/env node
/* ============================================================
   Empujar la configuración de Supabase, con seguros.

   POR QUÉ EXISTE:

   `supabase config push` manda el archivo entero y falla en
   silencio de dos maneras que ya ocurrieron:

   1. La contraseña de SMTP sale de `env(RESEND_API_KEY)`. Si esa
      variable no está puesta —o trae el texto de ejemplo de una
      instrucción copiada— la CLI empuja igual y el envío de correos
      queda roto. Nadie se entera hasta que alguien intenta
      registrarse.

   2. Empuja al proyecto ENLAZADO. Si el enlace quedó en pruebas, la
      configuración de producción no cambia y uno se queda creyendo
      que sí.

   Este guion comprueba las dos cosas ANTES de empujar y se niega si
   algo no cuadra. Un comando que se puede ejecutar mal es cuestión
   de tiempo; uno que se niega, no.

   Uso:  npm run config:produccion
   ============================================================ */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ENV = 'supabase/.env';
const REF_PRODUCCION = 'qhbkghxuwzdrlswphusd';

const morir = (...lineas) => { console.error('\n' + lineas.join('\n') + '\n'); process.exit(1); };

/* ---------- 1. el archivo de secretos ---------- */

if (!existsSync(ENV)) {
  morir(
    `No existe ${ENV}.`,
    '',
    'Crealo con tu clave de Resend dentro (una sola línea):',
    '',
    '    RESEND_API_KEY=re_...',
    '',
    'Ese archivo está en .gitignore: no se sube al repositorio.',
    'Se escribe UNA vez y sirve para siempre — así ningún comando',
    'vuelve a llevar la clave escrita adentro.'
  );
}

const texto = readFileSync(ENV, 'utf8');
const clave = (texto.match(/^RESEND_API_KEY\s*=\s*(.+)$/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');

if (!clave) morir(`${ENV} existe pero no tiene RESEND_API_KEY.`);

/* Las claves de Resend empiezan con `re_`. Esta comprobación es
   exactamente la que habría atajado las dos veces que se empujó un
   texto de ejemplo en vez de la clave. */
if (!/^re_[A-Za-z0-9_-]{20,}$/.test(clave)) {
  morir(
    'RESEND_API_KEY no parece una clave de Resend.',
    '',
    `  Encontrado: ${clave.slice(0, 6)}… (${clave.length} caracteres)`,
    '  Esperado:   re_ seguido de al menos 20 caracteres',
    '',
    'Si ahí quedó el texto de ejemplo de alguna instrucción,',
    'reemplazalo por la clave de verdad. Empujar esto dejaría el',
    'envío de correos roto sin avisar.'
  );
}

/* ---------- 2. el proyecto enlazado ---------- */

let enlazado;
try {
  const salida = execFileSync('npx', ['supabase', 'projects', 'list', '--output-format', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const j = JSON.parse(salida.trim().split('\n').pop());
  enlazado = (j.projects || []).find(p => p.linked);
} catch {
  morir('No se pudo consultar el proyecto enlazado. ¿Sesión de Supabase iniciada?');
}

if (!enlazado) morir('No hay ningún proyecto enlazado. Corré `npx supabase link --project-ref …`.');

if (enlazado.ref !== REF_PRODUCCION) {
  morir(
    `El enlace apunta a "${enlazado.name}", no a producción.`,
    '',
    'Este archivo de configuración describe PRODUCCIÓN. Empujarlo a',
    'otro proyecto le pondría el dominio y los correos equivocados.',
    '',
    `    npx supabase link --project-ref ${REF_PRODUCCION}`
  );
}

/* ---------- 3. empujar ---------- */

console.log(`\nEmpujando la configuración a ${enlazado.name}…`);
console.log(`  clave de Resend: ${clave.slice(0, 6)}… (${clave.length} caracteres) ✓\n`);

try {
  execFileSync('npx', ['supabase', 'config', 'push', '--env-file', ENV],
    { stdio: 'inherit', env: { ...process.env, RESEND_API_KEY: clave } });
} catch {
  morir('El empuje falló. La configuración anterior sigue en pie.');
}

console.log('\nListo. Acordate de devolver el enlace a pruebas:');
console.log('    npx supabase link --project-ref xidzmxtninmtxgqhddvu\n');
