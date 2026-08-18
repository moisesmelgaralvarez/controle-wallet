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

/* ============================================================
   EL RUBRO NUEVO VIAJA CON SU IDENTIFICADOR

   El núcleo es puro y no conoce la base, así que a un rubro nuevo le
   pone un uuid que inventa el navegador. Ese mismo uuid queda metido en
   el `gasto_id` de cada movimiento del lote y en el aprendizaje de los
   comercios.

   Cuando la fila que se le mandaba a la base NO lo llevaba, Postgres
   asignaba otro, el del navegador se perdía, y ochenta movimientos más
   catorce comercios quedaban apuntando al vacío. La importación entera
   se caía con un 409 que decía «ya existe» — lo contrario de lo que
   pasaba.

   Esta prueba mira lo único que importa: que el identificador que el
   motor le puso al rubro sea EL MISMO que referencian sus movimientos,
   y que sobreviva el viaje a la base.
   ============================================================ */

test('el rubro nuevo y lo que lo referencia comparten identificador', async () => {
  const { filaRubro } = await import('../sitio/app/datos/importar.js');

  const rubro = {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    concepto: 'Farmacia', monto: 0, categoria: 'Salud',
    medioPago: 'tarjeta', crecimiento: 0, tarjetaId: null
  };
  const fila = filaRubro(rubro, 900);

  assert.strictEqual(fila.id, rubro.id,
    'sin el id, la base asigna otro y todo lo que apunta a este rubro queda huérfano');
  assert.strictEqual(fila.concepto, 'Farmacia');
  assert.strictEqual(fila.categoria, 'Salud');
  assert.strictEqual(fila.orden, 900);
});

/* ============================================================
   UN TRASLADO ES PROPIO POR SU DESTINO, NO POR SU ORIGEN

   El banco escribe «Transferencia entre Cuentas-ORIGEN-DESTINO», y el
   ORIGEN es siempre el titular de la cuenta que uno acaba de importar —
   o sea, siempre alguien del hogar. La comprobación vieja buscaba el
   nombre de cualquier persona registrada en la línea ENTERA, así que no
   podía dar «no» nunca: toda transferencia salía como traslado propio.

   Medido con archivos reales: L 900 a una hermana y L 2,060 a otros dos
   terceros quedaron sin registrar, y un ACH de L 1,200 a un tercero se
   registró como PAGO DE TARJETA.
   ============================================================ */

test('una transferencia a un tercero es gasto, aunque la mande alguien del hogar', async () => {
  const I = await import('../sitio/app/nucleo/importar.js');
  const D = { personas: [
    { id: 'm', nombre: 'Moisés Armando Melgar Álvarez' },
    { id: 'j', nombre: 'Judith Maryorie Vallejos Aguilera' }
  ]};
  const lote = { tipo: 'cuenta' };

  const aCasa = I.clasificar(
    { concepto: 'Transferencia entre Cuentas-JUDITH MARYORIE VALLEJOS AGUILERA-MOISES ARMANDO MELGAR ALVAREZ',
      monto: -10769 }, D, lote);
  assert.strictEqual(aCasa, 'traslado',
    'entre dos cuentas del hogar la plata no sale: registrarla sería contarla dos veces');

  const aTercero = I.clasificar(
    { concepto: 'Transferencia entre Cuentas-JUDITH MARYORIE VALLEJOS AGUILERA-KATHERINE ALEJANDRA VALLEJOS AGUILERA',
      monto: -500 }, D, lote);
  assert.strictEqual(aTercero, 'gasto',
    'a una hermana con los mismos apellidos la plata SÍ sale del hogar');
});

test('un ACH a un tercero no es un pago de tarjeta', async () => {
  const I = await import('../sitio/app/nucleo/importar.js');
  const D = { personas: [
    { id: 'm', nombre: 'Moisés Armando Melgar Álvarez' },
    { id: 'j', nombre: 'Judith Maryorie Vallejos Aguilera' }
  ]};
  const lote = { tipo: 'cuenta' };

  assert.strictEqual(
    I.clasificar({ concepto: 'ACH Debito-Moises Melgar', monto: -9031.71 }, D, lote),
    'pagoTarjeta', 'el giro a nombre propio sí es el que paga la tarjeta');

  assert.strictEqual(
    I.clasificar({ concepto: 'ACH Debito-Daniel Josue Vallejos Aguilera', monto: -1200 }, D, lote),
    'gasto', 'compartir apellidos no convierte a un tercero en el titular');
});

/* ============================================================
   LA DESCRIPCIÓN PARTIDA EN VARIAS LÍNEAS

   Cuando la descripción es larga, el banco la parte y deja la fecha y el
   monto en la línea de en medio. Los fragmentos se agrupan por su
   coordenada vertical, así que el renglón del movimiento se quedaba SIN
   texto — y sin concepto no hay regla que lo pueda clasificar.

   Se vio con datos reales: dos pedidos por L 619 entraron como «sin
   clasificar» y el dueño no tenía cómo saber de dónde salían.
   ============================================================ */

test('un movimiento sin concepto recupera el texto de sus vecinos', async () => {
  const I = await import('../sitio/app/nucleo/importar.js');

  const r = I.coserDescripcionesPartidas([
    'PEDIDOS YA RESTAURANTEFRANCISCO',
    '15/08/2026                    459.00 LPS',
    'MO\\HND'
  ]);

  assert.strictEqual(r.length, 1, 'los tres renglones son un solo movimiento');
  assert.match(r[0], /PEDIDOS YA RESTAURANTE/);
  assert.match(r[0], /459\.00/);
});

test('el renglón que ya venía completo no se toca', async () => {
  const I = await import('../sitio/app/nucleo/importar.js');

  const bueno = '15/08/2026  SUPER 7 PUMA ANDALUCIACHOLUTECA \\HND   148.43 LPS';
  const r = I.coserDescripcionesPartidas(['Movimientos recientes', bueno, 'Total del periodo']);

  assert.ok(r.includes(bueno), 'un movimiento con su descripción no entra en el caso');
});

test('dos movimientos seguidos no se roban el concepto', async () => {
  const I = await import('../sitio/app/nucleo/importar.js');

  const r = I.coserDescripcionesPartidas([
    '01/08/2026   FARMACIA SIMAN   100.00 LPS',
    '02/08/2026   EL MATERNO 5     200.00 LPS'
  ]);

  assert.deepEqual(r.length, 2, 'ninguno de los dos está sin concepto: no hay nada que coser');
});

test('«FRESSCO» es comida: un starmart de gasolinera', async () => {
  const I = await import('../sitio/app/nucleo/importar.js');
  const r = I.reglaDe('FRESSCO VIZCAYA       CHOLUTECA 21:26');
  assert.strictEqual(r && r.rubro, 'Comida fuera');
});
