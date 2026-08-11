/* ============================================================
   El CSV de cualquier banco.

   La consulta era: ¿se puede leer el estado de cuenta de cualquier
   entidad? La respuesta corta es que SÍ por CSV o Excel, y NO por PDF.

   POR PDF NO, Y ESTÁ MEDIDO. El texto de un PDF pierde la estructura
   de columnas: cuando una celda va vacía DESAPARECE y las de la
   derecha se corren. Un lector genérico leía el saldo como si fuera el
   crédito —«L 8,749.25» donde iban «−1,250.75»— sin dar ningún error.
   Un número creíble y falso es peor que no leer el archivo, así que un
   PDF desconocido se rechaza y se manda a descargar el CSV.

   POR CSV SÍ, porque conserva las celdas vacías. Lo que hacía falta no
   era un lector por banco, sino dejar de suponer dos cosas: que el
   separador es la coma, y que el decimal es el punto.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../sitio/app/nucleo/index.js';

/* El mismo estado de cuenta, escrito como lo exportan bancos distintos. */

const CON_COMA = `Banco Cualquiera
Cuenta No: 987654321
Fecha,Descripción,Débito,Crédito,Saldo
05/08/2026,SUPERMERCADO LA COLONIA,1250.75,,8749.25
07/08/2026,DEPOSITO NOMINA,,22000.00,30749.25
09/08/2026,FARMACIA KIELSA,340.00,,30409.25`;

const CON_PUNTO_Y_COMA = `Banco Cualquiera
Cuenta No: 987654321
Fecha;Descripción;Débito;Crédito;Saldo
05/08/2026;SUPERMERCADO LA COLONIA;1.250,75;;8.749,25
07/08/2026;DEPOSITO NOMINA;;22.000,00;30.749,25
09/08/2026;FARMACIA KIELSA;340,00;;30.409,25`;

const CON_TABULADOR = "Banco Cualquiera\nCuenta No: 987654321\n" +
  "Fecha\tDescripción\tDébito\tCrédito\tSaldo\n" +
  "05/08/2026\tSUPERMERCADO LA COLONIA\t1250.75\t\t8749.25\n" +
  "07/08/2026\tDEPOSITO NOMINA\t\t22000.00\t30749.25\n" +
  "09/08/2026\tFARMACIA KIELSA\t340.00\t\t30409.25";

for (const [nombre, texto] of [['coma', CON_COMA],
                               ['punto y coma con decimales europeos', CON_PUNTO_Y_COMA],
                               ['tabulador', CON_TABULADOR]]) {
  test(`se lee el mismo estado de cuenta separado por ${nombre}`, () => {
    const lote = A.adaptadorCsv(texto);
    assert.ok(lote, 'no se reconoció el archivo');
    assert.equal(lote.cuenta, '987654321', 'no encontró el número de cuenta');
    assert.equal(lote.movs.length, 3);

    // El signo no sale del banco: sale de en qué columna cayó el número.
    assert.equal(lote.movs[0].monto, -1250.75, 'el supermercado debería restar');
    assert.equal(lote.movs[1].monto, 22000, 'la nómina debería sumar');
    assert.equal(lote.movs[2].monto, -340, 'la farmacia debería restar');
  });
}

test('«1.250,75» y «1,250.75» son el mismo dinero', () => {
  /* Quitar las comas a ciegas convertía 1.250,75 en 1250075 —mil veces
     más— sin dar ningún error. Manda el separador que está más a la
     derecha: los miles nunca van al final. */
  assert.equal(A.numero('1.250,75'), 1250.75);
  assert.equal(A.numero('1,250.75'), 1250.75);
  assert.equal(A.numero('L 8,749.25'), 8749.25);
  assert.equal(A.numero('0,50'), 0.5);
  assert.equal(A.numero('-340.00'), -340);
});

test('un archivo sin columnas reconocibles se rechaza, no se adivina', () => {
  // Leer mal un estado de cuenta es peor que no leerlo.
  assert.equal(A.adaptadorCsv('hola\nque tal\n123'), null);
});
