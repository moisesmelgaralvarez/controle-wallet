/* ============================================================
   Un respaldo de Controle Wallet no es un hogar de la app vieja.

   `reconocer()` existe para que un archivo equivocado no empiece a
   escribir filas y falle a la mitad. Pero solo miraba que vinieran
   `personas` y `gastos` como listas — y el respaldo que exporta ESTA
   app trae las dos, porque son dos de sus veinte tablas.

   O sea que el archivo propio pasaba el portero, se migraba como si
   fuera del formato viejo, y ensuciaba el hogar sin dar un solo error.
   Y como migrar AGREGA, no reemplaza, el estropicio no se deshace
   solo.

   Lo que lo volvía peligroso de verdad es a quién le tocaba: quien no
   viene de la app anterior solo abre esa pantalla por una razón
   —querer restaurar su respaldo— así que el único camino que quedaba
   hacia ese botón terminaba justo en el fallo silencioso.

   La comparación de las diez cifras que impediría que una migración
   mala pasara vive en `integracion.js`: es una PRUEBA, no un guardián
   dentro de la app. No iba a atajar esto en la vida real.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconocer } from '../sitio/app/datos/migrar.js';
import { CONFIGURACION, POR_MES } from '../sitio/app/datos/armador.js';

/* El respaldo de la app anterior: el documento del núcleo tal cual, que
   es lo que `heredado/app.js` escribe en `presupuesto-AAAA-MM.json`.
   Ids cortos, sin envoltorio, y CON su propia `version`. */
const respaldoViejo = () => ({
  version: 6, configurado: true, inicioMes: 7,
  personas: [{ id: 'p1', nombre: 'Moisés', cuentaId: 'c1' }],
  gastos: [{ id: 'g1', nombre: 'Luz', monto: 1200 }],
  cuentas: [{ id: 'c1', nombre: 'Ficohsa', saldoInicial: 15000 }],
});

/* El respaldo de Controle Wallet, armado como lo arma la pantalla de
   Tu cuenta: el envoltorio, y después una lista por cada tabla. Se
   construye desde las MISMAS listas que usa la app —no de una copia
   escrita a mano— para que esto siga describiendo la realidad si
   mañana se agrega o se quita una tabla. */
const respaldoPropio = () => {
  const doc = { hogar: { id: 'uuid-del-hogar', moneda: 'HNL' },
                exportado: new Date().toISOString(), version: 1 };
  for (const t of [...new Set([...CONFIGURACION, ...POR_MES])]) doc[t] = [];
  doc.personas = [{ id: 'uuid-1', hogar_id: 'uuid-del-hogar', nombre: 'Moisés' }];
  doc.gastos   = [{ id: 'uuid-2', hogar_id: 'uuid-del-hogar', nombre: 'Luz' }];
  return doc;
};

test('el choque que causó todo esto es real: el respaldo propio trae personas y gastos', () => {
  // Si esto dejara de ser cierto, la trampa habría desaparecido sola y
  // el resto de este archivo estaría cuidando un fantasma. Vale más
  // que falle y alguien lo relea.
  const tablas = [...new Set([...CONFIGURACION, ...POR_MES])];
  assert.ok(tablas.includes('personas'), 'ya no se exporta una tabla `personas`');
  assert.ok(tablas.includes('gastos'), 'ya no se exporta una tabla `gastos`');

  const propio = respaldoPropio();
  assert.ok(Array.isArray(propio.personas) && Array.isArray(propio.gastos));
});

test('un respaldo de Controle Wallet se rechaza, y se dice qué es', () => {
  const problema = reconocer(respaldoPropio());
  assert.ok(problema, 'el respaldo propio pasó como si fuera de la app vieja');
  assert.match(problema, /respaldo de Controle Wallet/);
});

test('`version` no sirve para distinguirlos: el documento viejo también la trae', () => {
  // Fijar esto por escrito evita que alguien «simplifique» el rechazo a
  // mirar `version`, que dejaría fuera todos los respaldos legítimos.
  assert.equal(typeof respaldoViejo().version, 'number');
  assert.equal(typeof respaldoPropio().version, 'number');
});

test('el respaldo de la app anterior sigue entrando', () => {
  // La mitad que importa del arreglo: rechazar de más rompería lo único
  // para lo que esa pantalla existe.
  assert.equal(reconocer(respaldoViejo()), null);
});

test('lo que no es ninguno de los dos se sigue rechazando como antes', () => {
  assert.match(reconocer(null), /no es un respaldo/);
  assert.match(reconocer({ hola: 1 }), /no trae/);
  assert.match(reconocer({ personas: [] }), /no trae los gastos/);
});
