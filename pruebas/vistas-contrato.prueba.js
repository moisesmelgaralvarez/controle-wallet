/* ============================================================
   Cada pantalla recibe las funciones que llama.

   Esta prueba existe por un fallo concreto y evitable: la pantalla de
   importar llamaba a `A.leerArchivo`, y `nucleo/index.js` —la puerta
   del núcleo— no reexportaba nada de `importar.js`. El módulo cargaba
   sin quejarse, porque importar un espacio de nombres SIEMPRE funciona
   aunque esté vacío. El error apareció recién al elegir un archivo, en
   producción: «A.leerArchivo is not a function».

   Lo que lo dejó pasar fue una comprobación que no podía fallar: se
   verificó que la vista se pudiera importar, no que lo que llama
   exista. Una comprobación que no puede fallar no está comprobando
   nada.

   Así que aquí se lee el CÓDIGO de cada vista, se saca cada `A.algo`
   que use, y se exige que el núcleo lo exporte de verdad.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as A from '../sitio/app/nucleo/index.js';

const CARPETA = new URL('../sitio/app/vistas/', import.meta.url);
const vistas = readdirSync(CARPETA).filter(n => n.endsWith('.js'));

test('el lector encuentra las vistas y lo que llaman', () => {
  // Sin esto, las de abajo pasarían en verde sin comprobar nada.
  assert.ok(vistas.length >= 6, `solo se encontraron ${vistas.length} vistas`);
  const importar = readFileSync(new URL('importar.js', CARPETA), 'utf8');
  assert.match(importar, /A\.leerArchivo/, 'la vista de importar debería llamar a leerArchivo');
});

for (const archivo of vistas) {
  test(`la vista ${archivo} solo llama a lo que el núcleo exporta`, () => {
    const fuente = readFileSync(new URL(archivo, CARPETA), 'utf8');

    // Solo cuenta si el archivo de verdad importa el núcleo como `A`.
    if (!/import \* as A from ['"]\.\.\/nucleo\/index\.js['"]/.test(fuente)) return;

    const usadas = new Set([...fuente.matchAll(/\bA\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
    const faltan = [...usadas].filter(k => A[k] === undefined);

    assert.deepEqual(faltan, [],
      `${archivo} llama a ${faltan.join(', ')}, que el núcleo no exporta: ` +
      `reventaría al usarlo, no al cargar la pantalla`);
  });
}

/* ------------------------------------------------------------
   El ancla del banco no se llama igual en los dos casos
   ------------------------------------------------------------ */

test('el saldo declarado se lee del campo correcto según el tipo de archivo', async () => {
  /* Una cuenta trae `saldoFin`; una tarjeta trae `saldoCorte`, porque
     al final del ciclo lo que hay no es un saldo a favor sino lo que se
     debe. Leer solo `saldoFin` dejaba la tarjeta SIN ancla y sin un
     solo error a la vista: la importación entraba completa, se veía
     bien, y el patrimonio se quedaba sin la única cifra que permite
     calcularlo sin bajar el histórico entero.

     Se descubrió importando un estado de cuenta de verdad. La prueba
     lee el código porque `anclaDe` es interna, y lo que hay que fijar
     es que los dos campos estén contemplados. */
  const fuente = readFileSync(
    new URL('../sitio/app/datos/importar.js', import.meta.url), 'utf8');

  assert.match(fuente, /saldoCorte/,
    'el importador no contempla el saldo de corte: las tarjetas quedarían sin ancla');
  assert.match(fuente, /lote\.tipo === 'tarjeta'/,
    'no distingue cuenta de tarjeta al leer el saldo declarado');
  assert.doesNotMatch(fuente, /p_saldo_banco:\s*lote\.saldoFin/,
    'volvió a mandar solo `saldoFin`, que en una tarjeta es undefined');
});

test('la pantalla dice cuándo NO pudo comprobar que el archivo cuadre', () => {
  // Callarlo deja creer que se revisó y salió bien, cuando lo que pasó
  // es que no se revisó.
  const vista = readFileSync(
    new URL('../sitio/app/vistas/importar.js', import.meta.url), 'utf8');
  assert.match(vista, /No se pudo comprobar que el archivo cuadre/,
    'la ausencia de la comprobación volvió a ser silenciosa');
});

test('el destino ofrecido es de la misma clase que el archivo', () => {
  /* Un estado de cuenta y el de una tarjeta no son intercambiables: en
     la cuenta un cargo resta y en la tarjeta suma a lo que se debe, y
     los pagos se registran desde la cuenta y no al revés. Ofrecer los
     dos juntos deja elegir el equivocado con un clic, y el error no da
     ningún aviso: entra completo y descuadra el mes.

     Salió con un CSV de cuenta cuyo ÚNICO destino ofrecido era una
     tarjeta, porque el hogar no tenía cuentas registradas. */
  const vista = readFileSync(
    new URL('../sitio/app/vistas/importar.js', import.meta.url), 'utf8');

  assert.match(vista, /tipoDe\(lote\) === 'tarjeta'\s*\n?\s*\?\s*tarjetas\.map/,
    'el desplegable volvió a mezclar cuentas y tarjetas');
  // Y si no se sabe de qué clase es el documento, no se ofrece ninguno:
  // se pregunta primero.
  assert.match(vista, /tipoDe\(lote\) \? posibles\(lote\) : \[\]/,
    'ofrece destinos sin saber si el archivo es de cuenta o de tarjeta');
  // Y cuando no hay ninguno de esa clase, se ofrece registrarlo ahí
  // mismo en vez de mandar a otra pantalla y perder el archivo leído.
  assert.match(vista, /data-registrar/,
    'no se puede registrar la cuenta o tarjeta desde la pantalla de importar');
  assert.match(vista, /nuevoCorte/,
    'una tarjeta sin día de corte no se puede guardar: la base lo exige');
});

test('elegir el destino a mano se hace una sola vez', () => {
  // Sin esto, «elegila a mano» es para siempre: el archivo del mes que
  // viene tampoco se va a reconocer.
  const datos = readFileSync(
    new URL('../sitio/app/datos/importar.js', import.meta.url), 'utf8');
  assert.match(datos, /aprenderNumero/,
    'no se guarda el número del archivo en el destino elegido a mano');
});
