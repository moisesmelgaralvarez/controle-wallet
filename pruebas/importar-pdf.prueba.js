/* ============================================================
   El PDF del mes en curso, de cualquier banco.

   Los bancos dan CSV de los meses cerrados, pero del mes EN CURSO
   —el único que sirve para controlar el gasto mientras pasa— solo dan
   una impresión en PDF. Así que el PDF no es el camino secundario: es
   el principal, y hay que leerlo de cualquier entidad.

   NO SE LEEN COLUMNAS, SE LEE EL SALDO. El texto de un PDF pierde la
   estructura de la tabla: una celda vacía DESAPARECE y las de la
   derecha se corren. Lo que sí es de fiar es el saldo que arrastra
   cada renglón, y entonces el movimiento no se adivina:

       monto = saldo de este renglón − saldo del anterior

   Exacto, con el signo incluido, y comprobable: esa diferencia tiene
   que aparecer como número en el mismo renglón — es el banco diciendo
   lo mismo dos veces.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../sitio/app/nucleo/index.js';

/* Un PDF ya convertido a renglones, con la celda de crédito VACÍA en
   dos de los tres movimientos. Es exactamente el caso que hacía que un
   lector por columnas leyera el saldo como si fuera el crédito. */
const RENGLONES = [
  'BANCO CUALQUIERA, S.A.',
  'Cuenta de ahorro No: 987654321',
  'Saldo anterior 10,000.00',
  'Fecha Descripción Débito Crédito Saldo',
  '05/08/2026 SUPERMERCADO LA COLONIA 1,250.75 8,749.25',
  '07/08/2026 DEPOSITO NOMINA 22,000.00 30,749.25',
  '09/08/2026 FARMACIA KIELSA 340.00 30,409.25'
];

test('lee el PDF de un banco que nadie programó, con el signo correcto', () => {
  const lote = A.adaptadorSaldos(RENGLONES);
  assert.ok(lote, 'no se pudo leer');
  assert.equal(lote.movs.length, 3);

  // Estos son los mismos tres números con los que el lector por
  // columnas se equivocaba. El signo sale del saldo, no de la columna.
  assert.equal(lote.movs[0].monto, -1250.75, 'el supermercado debería restar');
  assert.equal(lote.movs[1].monto, 22000, 'la nómina debería sumar');
  assert.equal(lote.movs[2].monto, -340, 'la farmacia debería restar');
});

test('el concepto sobrevive aunque no haya columnas', () => {
  const lote = A.adaptadorSaldos(RENGLONES);
  assert.match(lote.movs[0].concepto, /SUPERMERCADO LA COLONIA/);
  assert.match(lote.movs[1].concepto, /DEPOSITO NOMINA/);
});

test('saca el número de cuenta y reconoce que es una cuenta', () => {
  const lote = A.adaptadorSaldos(RENGLONES);
  assert.equal(lote.cuenta, '987654321');
  assert.equal(lote.tipo, 'cuenta');
});

test('en una tarjeta un cargo SUMA a lo que se debe', () => {
  /* Es la misma resta, y por eso funciona en los dos casos: se lee el
     movimiento del número del banco en sus propios términos. En la
     cuenta un cargo baja el saldo; en la tarjeta sube la deuda. */
  const lote = A.adaptadorSaldos([
    'BANCO CUALQUIERA — Tarjeta de crédito',
    'Límite de crédito 50,000.00   Fecha de corte 06/08/2026',
    'Saldo anterior 5,000.00',
    '05/08/2026 SUPERMERCADO 1,250.75 6,250.75',
    '07/08/2026 PAGO RECIBIDO 2,000.00 4,250.75',
    '09/08/2026 FARMACIA 340.00 4,590.75'
  ]);
  assert.ok(lote);
  assert.equal(lote.tipo, 'tarjeta');
  assert.equal(lote.movs[0].monto, 1250.75, 'un consumo suma a la deuda');
  assert.equal(lote.movs[1].monto, -2000, 'un pago la baja');
  assert.equal(lote.movs[2].monto, 340);
});

test('si los saldos no cuadran con los montos, se rechaza el archivo entero', () => {
  /* La diferencia entre dos saldos tiene que aparecer como número en el
     renglón: es el banco diciendo lo mismo dos veces. Si no coincide,
     la lectura está mal — y entregar «casi bien» con dinero es
     entregar mal. */
  const roto = A.adaptadorSaldos([
    'BANCO RARO  Cuenta de ahorro No: 111222333',
    'Saldo anterior 10,000.00',
    '05/08/2026 ALGO 999.99 8,749.25',
    '07/08/2026 OTRA COSA 111.11 30,749.25',
    '09/08/2026 MAS 222.22 30,409.25'
  ]);
  assert.equal(roto, null, 'aceptó una lectura que no cuadra consigo misma');
});

test('sin saldo de arranque, el primer movimiento no se inventa', () => {
  // Su signo es genuinamente desconocido: se anota que quedó fuera en
  // vez de adivinarlo.
  const lote = A.adaptadorSaldos([
    'BANCO CUALQUIERA  Cuenta de ahorro No: 987654321',
    '05/08/2026 SUPERMERCADO 1,250.75 8,749.25',
    '07/08/2026 DEPOSITO 22,000.00 30,749.25',
    '09/08/2026 FARMACIA 340.00 30,409.25'
  ]);
  assert.ok(lote);
  assert.equal(lote.lectura.sinPrimero, true, 'debería avisar que faltó el primero');
  assert.equal(lote.movs.length, 2, 'los otros dos sí se leen');
  assert.equal(lote.movs[0].monto, 22000);
});

test('un documento sin saldos no se fuerza: se deja para otro lector', () => {
  assert.equal(A.adaptadorSaldos(['hola', 'que tal', '05/08/2026 algo']), null);
});
