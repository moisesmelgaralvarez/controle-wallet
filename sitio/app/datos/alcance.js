/* ============================================================
   Hasta dónde alcanza lo que se bajó.

   El navegador tiene la configuración del hogar entera, pero de lo
   que pasó solo tiene EL MES EN CURSO. Esa decisión es deliberada —un
   hogar con tres años de historia no le baja tres años al teléfono—
   pero deja una trampa: hay cifras del núcleo que recorren todo el
   histórico, y calculadas con un mes salen mal SIN AVISAR.

   Las tres son `saldoCuenta`, `deudaTarjeta` y `efectivo`, y de ellas
   cuelga `patrimonio` → `saludFinanciera` → el veredicto de un
   proyecto. Medido: el mismo proyecto sale «Programado» con doce
   meses cargados y «Reconsideralo» con uno solo, inventándose la
   razón. Un veredicto al revés, dicho con seguridad, hace más daño
   que no darlo.

   LA SALIDA ES EL ANCLA. Cuando una cuenta o una tarjeta declara el
   saldo que dijo el banco y su fecha, el núcleo deja de sumar desde
   el principio: parte de esa cifra —que es un hecho, no una
   deducción— y solo le agrega lo posterior a esa fecha. Si el ancla
   cae DENTRO del mes que está cargado, no falta ni un movimiento y
   el resultado es idéntico al que daría el histórico completo.

   Eso es lo que decide este archivo. No es una prudencia ni un
   margen de seguridad: es una condición exacta.

   Lo que el ancla no cubre es el efectivo en mano, que no tiene una.
   Su error va en dirección conservadora —se pierde lo que sobró de
   meses anteriores, así que el colchón se subestima y la app frena
   de más, no de menos— y está acotado al efectivo de un mes.
   ============================================================ */

import { rangoPeriodo, inicioMes } from '../nucleo/fechas.js';

/** Una tarjeta de crédito es la única que arrastra deuda por su cuenta. */
const esCredito = t => (t.tipo || 'credito') === 'credito';

const anclada = (x, desde) =>
  Boolean(x.saldoBanco && x.saldoBanco.fecha && x.saldoBanco.fecha >= desde);

/**
 * ¿Se puede confiar en el patrimonio calculado con lo que hay cargado?
 *
 * Devuelve `{ exacto, faltan, hayCuentas }`. `faltan` trae las cuentas
 * y tarjetas cuya ancla no está al día, por nombre, para poder decir
 * exactamente qué falta en vez de un «no se puede».
 */
export function alcanzaParaPatrimonio(D, periodo) {
  const desde = rangoPeriodo(periodo, inicioMes(D)).desde;

  const cuentas = D.cuentas || [];
  const credito = (D.tarjetas || []).filter(esCredito);

  const faltan = [...cuentas, ...credito].filter(x => !anclada(x, desde));

  return {
    // Sin una sola cuenta declarada, el líquido sale cero y el
    // diagnóstico entero se apoya en una cifra que nadie escribió.
    hayCuentas: cuentas.length > 0,
    faltan,
    exacto: cuentas.length > 0 && faltan.length === 0,
    desde
  };
}
